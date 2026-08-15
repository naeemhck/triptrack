/**
 * TripTrack Application-Owned Offline Synchronization Queue Service
 * 
 * ARCHITECTURE & RELIABILITY MODEL:
 * TripTrack uses a Write-Ahead Queue strategy (Local durable state first -> remote sync second -> ack/removal last).
 * 
 * KEY FEATURES:
 * 1. Operation Types: `latest_location`, `manual_stop`, `auto_stop`, `stop_update`, `stop_photo`
 * 2. Coalesced Live Location: Keyed by `tripId + uid` (1 pending sample per trip/user; newest sample replaces older)
 * 3. Stable Stop IDs: Idempotent Supabase upserts keyed by UUID
 * 4. Photo Durability & JPEG Normalization: Photos copied to app document directory before queueing; partial success handling
 * 5. Serialized Mutations & Crash Lease Recovery: Mutex lock for queue mutations; processing leases expire after 60s
 * 6. Bounded Exponential Backoff: Initial 5s, max 5m, max 10 attempts before `manual_retry_required`
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { TripStop, MemberLocation } from '../types/location';
import { upsertLocation } from './supabase/locations';
import { stopPhotoPath, uploadStopPhoto } from './supabase/photos';
import { assertStopExistsOwned, updateStop, upsertStop } from './supabase/stops';
import { devLog, devWarn } from '../utils/devLog';

export const ASYNC_QUEUE_KEY = '@triptrack_offline_sync_queue';
export const LEASE_DURATION_MS = 60 * 1000; // 60s lease timeout for standard operations
export const MEDIA_LEASE_DURATION_MS = 180 * 1000; // 180s lease timeout for slow media photo uploads
export const SYNC_INITIAL_RETRY_MS = 5000; // 5s
export const SYNC_MAX_RETRY_MS = 5 * 60 * 1000; // 5m
export const MAX_ATTEMPTS = 10;
export const MAX_PENDING_PHOTOS = 20; // Retention safety limit for queued photos
const PENDING_MEDIA_DIRECTORY = `${FileSystem.documentDirectory}triptrack-pending-media/`;

export type OfflineOperationType =
  | 'latest_location'
  | 'leader_route_sample'
  | 'manual_stop'
  | 'auto_stop'
  | 'stop_update'
  | 'stop_photo';

export type SyncItemStatus =
  | 'pending'
  | 'processing'
  | 'synced'
  | 'failed'
  | 'manual_retry_required';

export interface OfflineSyncItem {
  id: string;
  operationType: OfflineOperationType;
  tripId: string;
  uid: string;
  createdAt: number; // queuedAt
  sampledAt?: number;
  attempts: number;
  nextRetryAt: number;
  status: SyncItemStatus;
  processingStartedAt?: number;
  leaseExpiresAt?: number;
  payload: any;
  localPhotoUri?: string;
  error?: string;
}

// In-memory mutex chain for serializing queue mutations (prevents AsyncStorage read-modify-write race conditions)
let mutationChain: Promise<any> = Promise.resolve();
let isWorkerRunning = false;

/**
 * Execute a serialized queue mutation safely
 */
const runSerializedMutation = <T>(mutationFn: (queue: OfflineSyncItem[]) => Promise<{ updatedQueue: OfflineSyncItem[]; result: T }>): Promise<T> => {
  const nextPromise = mutationChain.then(async () => {
    try {
      const raw = await AsyncStorage.getItem(ASYNC_QUEUE_KEY);
      let queue: OfflineSyncItem[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Filter malformed records
            queue = parsed.filter(
              (item) => item && item.id && item.operationType && item.tripId && item.uid
            );
          }
        } catch (e) {
          console.error('⚠️ [Sync Queue] Malformed queue JSON. Starting clean.', e);
        }
      }

      const { updatedQueue, result } = await mutationFn(queue);
      await AsyncStorage.setItem(ASYNC_QUEUE_KEY, JSON.stringify(updatedQueue));
      return result;
    } catch (err) {
      console.error('⚠️ [Sync Queue] Mutation error:', err);
      throw err;
    }
  });

  mutationChain = nextPromise.catch(() => {});
  return nextPromise;
};

/**
 * Retrieve current offline queue items
 */
export const getOfflineQueue = async (): Promise<OfflineSyncItem[]> => {
  return runSerializedMutation(async (queue) => {
    // Reclaim expired processing leases on load
    const now = Date.now();
    let modified = false;

    const cleaned = queue.map((item) => {
      if (item.status === 'processing' && item.leaseExpiresAt && now > item.leaseExpiresAt) {
        devLog(`⏳ [Sync Queue] Reclaimed expired processing lease for item ${item.id}`);
        modified = true;
        return {
          ...item,
          status: 'pending' as SyncItemStatus,
          processingStartedAt: undefined,
          leaseExpiresAt: undefined,
        };
      }
      return item;
    });

    return { updatedQueue: cleaned, result: cleaned };
  });
};

/**
 * Enqueue / Coalesce a Live Location sample (`latest_location`)
 * Keyed by `tripId + uid`: exactly ONE pending sample per user/trip
 */
export const enqueueLocation = async (
  tripId: string,
  uid: string,
  locationData: Partial<MemberLocation> & { sampledAt?: number },
  isRouteLeader = false
): Promise<void> => {
  return runSerializedMutation(async (queue) => {
    const now = Date.now();
    const itemId = `loc_${tripId}_${uid}`;
    const sampleId = Crypto.randomUUID();

    // Filter out existing location item for this tripId + uid
    const filtered = queue.filter((item) => item.id !== itemId);

    const newItem: OfflineSyncItem = {
      id: itemId,
      operationType: 'latest_location',
      tripId,
      uid,
      createdAt: now,
      sampledAt: locationData.sampledAt || now,
      attempts: 0,
      nextRetryAt: now,
      status: 'pending',
      payload: {
        ...locationData,
        sampleId,
        sampledAt: locationData.sampledAt || now,
      },
    };

    devLog(`📥 [Sync Queue] Coalesced live location for user ${uid} on trip ${tripId}`);
    if (!isRouteLeader) return { updatedQueue: [...filtered, newItem], result: undefined };
    const routeItem: OfflineSyncItem = {
      ...newItem,
      id: `route_${tripId}_${sampleId}`,
      operationType: 'leader_route_sample',
    };
    return { updatedQueue: [...filtered, newItem, routeItem], result: undefined };
  });
};

/**
 * Enqueue a Stop creation (`manual_stop` or `auto_stop`)
 */
export const enqueueStop = async (
  tripId: string,
  uid: string,
  stopData: TripStop,
  operationType: 'manual_stop' | 'auto_stop',
  localPhotoUri?: string
): Promise<void> => {
  return runSerializedMutation(async (queue) => {
    const now = Date.now();
    const itemId = `stop_${stopData.id}`;

    // Check if stop is already queued
    const existingIndex = queue.findIndex((item) => item.id === itemId);
    const itemData: OfflineSyncItem = {
      id: itemId,
      operationType,
      tripId,
      uid,
      createdAt: now,
      sampledAt: stopData.createdAt || now,
      attempts: 0,
      nextRetryAt: now,
      status: 'pending',
      localPhotoUri,
      payload: stopData,
    };

    let updatedQueue: OfflineSyncItem[];
    if (existingIndex >= 0) {
      updatedQueue = [...queue];
      updatedQueue[existingIndex] = itemData;
    } else {
      updatedQueue = [...queue, itemData];
    }

    devLog(`📥 [Sync Queue] Enqueued ${operationType} "${stopData.name}" (${stopData.id})`);
    return { updatedQueue, result: undefined };
  });
};

/**
 * Enqueue a Stop Update / Departure (`stop_update`)
 */
export const enqueueStopUpdate = async (
  tripId: string,
  uid: string,
  stopId: string,
  updateFields: Partial<TripStop>
): Promise<void> => {
  return runSerializedMutation(async (queue) => {
    const now = Date.now();
    const parentStopId = `stop_${stopId}`;

    // If original unsynced stop is still in queue, merge update fields directly!
    const parentIndex = queue.findIndex((item) => item.id === parentStopId);
    if (parentIndex >= 0) {
      const parentItem = queue[parentIndex];
      const mergedPayload = { ...parentItem.payload, ...updateFields };
      const updatedQueue = [...queue];
      updatedQueue[parentIndex] = { ...parentItem, payload: mergedPayload };
      devLog(`📥 [Sync Queue] Merged stop_update directly into queued stop ${stopId}`);
      return { updatedQueue, result: undefined };
    }

    // Otherwise, create a separate stop_update queue item
    const itemId = `update_${stopId}_${now}`;
    const updateItem: OfflineSyncItem = {
      id: itemId,
      operationType: 'stop_update',
      tripId,
      uid,
      createdAt: now,
      attempts: 0,
      nextRetryAt: now,
      status: 'pending',
      payload: { stopId, ...updateFields },
    };

    devLog(`📥 [Sync Queue] Enqueued stop_update for stop ${stopId}`);
    return { updatedQueue: [...queue, updateItem], result: undefined };
  });
};

/**
 * Enqueue a Stop Photo upload (`stop_photo`)
 */
export const enqueueStopPhoto = async (
  tripId: string,
  uid: string,
  stopId: string,
  localPhotoUri: string
): Promise<void> => {
  await FileSystem.makeDirectoryAsync(PENDING_MEDIA_DIRECTORY, { intermediates: true });
  const normalized = await ImageManipulator.manipulateAsync(localPhotoUri, [], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const durablePhotoUri = `${PENDING_MEDIA_DIRECTORY}${stopId}.jpg`;
  await FileSystem.copyAsync({ from: normalized.uri, to: durablePhotoUri });

  try {
    return await runSerializedMutation(async (queue) => {
      const pendingPhotoCount = queue.filter((i) => i.operationType === 'stop_photo').length;
      if (pendingPhotoCount >= MAX_PENDING_PHOTOS) {
        devWarn(`⚠️ [Sync Queue] Pending photo limit (${MAX_PENDING_PHOTOS}) reached. Deferring new photo queuing.`);
        throw new Error("Photo can't be queued until pending uploads sync.");
      }

    const now = Date.now();
    const itemId = `photo_${stopId}`;

    const photoItem: OfflineSyncItem = {
      id: itemId,
      operationType: 'stop_photo',
      tripId,
      uid,
      createdAt: now,
      attempts: 0,
      nextRetryAt: now,
      status: 'pending',
      localPhotoUri: durablePhotoUri,
      payload: { stopId, photoUploaded: false, remotePath: null },
    };

      devLog(`📥 [Sync Queue] Enqueued stop_photo for stop ${stopId}`);
      return { updatedQueue: [...queue, photoItem], result: undefined };
    });
  } catch (error) {
    await FileSystem.deleteAsync(durablePhotoUri, { idempotent: true });
    throw error;
  }
};

/**
 * Clear queue items for a user who left a trip
 */
export const clearTripQueueForUser = async (tripId: string, uid: string): Promise<void> => {
  return runSerializedMutation(async (queue) => {
    // Cancel transient live_location items for departed trip; retain durable manual stops in conflict state if needed
    const updated = queue.filter(
      (item) => !(item.tripId === tripId && item.uid === uid &&
        (item.operationType === 'latest_location' || item.operationType === 'leader_route_sample'))
    );
    return { updatedQueue: updated, result: undefined };
  });
};

/**
 * Execute single queue item sync operation
 */
const syncSingleItem = async (item: OfflineSyncItem, currentUid: string): Promise<boolean> => {
  // Validate ownership
  if (item.uid !== currentUid) {
    devLog(`⚠️ [Sync Queue] User mismatch for item ${item.id} (item uid: ${item.uid}, current uid: ${currentUid}). Skipping.`);
    return false;
  }

  const { operationType, tripId, payload, localPhotoUri } = item;

  if (operationType === 'latest_location') {
    await upsertLocation(tripId, item.uid, {
      ...payload,
      sampledAt: item.sampledAt || payload.sampledAt || Date.now(),
    }, payload.sampleId, false);
    return true;
  }

  if (operationType === 'leader_route_sample') {
    await upsertLocation(tripId, item.uid, {
      ...payload,
      sampledAt: item.sampledAt || payload.sampledAt || Date.now(),
    }, payload.sampleId, true);
    return true;
  }

  if (operationType === 'manual_stop' || operationType === 'auto_stop') {
    await upsertStop(tripId, payload as TripStop);
    return true;
  }

  if (operationType === 'stop_update') {
    // Update existing stop
    const { stopId, ...fields } = payload;
    await updateStop(tripId, stopId, fields);
    return true;
  }

  if (operationType === 'stop_photo') {
    const stopId = payload.stopId;
    let remotePath = payload.remotePath as string | null;

    // The binary is secondary to the canonical stop and must never race it.
    await assertStopExistsOwned(tripId, stopId, item.uid);

    // Partial success recovery: if Storage upload hasn't succeeded yet, upload photo
    if (!payload.photoUploaded && localPhotoUri) {
      devLog(`📤 [Sync Queue] Uploading photo for stop ${stopId}...`);
      remotePath = stopPhotoPath(tripId, stopId);
      await uploadStopPhoto(remotePath, localPhotoUri);
      await runSerializedMutation(async (queue) => ({
        updatedQueue: queue.map((queued) => queued.id === item.id
          ? { ...queued, payload: { ...queued.payload, photoUploaded: true, remotePath } }
          : queued),
        result: undefined,
      }));
    }

    if (!remotePath) throw new Error('Uploaded photo is missing its remote path.');
    await updateStop(tripId, stopId, { photoPath: remotePath });
    if (localPhotoUri) await FileSystem.deleteAsync(localPhotoUri, { idempotent: true });
    return true;
  }

  return true;
};

/**
 * Synchronization Worker Processor
 * Run on network reconnect, app resume, auth change, or manual trigger
 */
export const processPendingSyncQueue = async (currentUid?: string): Promise<void> => {
  if (isWorkerRunning) {
    devLog('🔒 [Sync Queue] Sync worker already running. Skipping concurrent run.');
    return;
  }

  isWorkerRunning = true;

  try {
    const queue = await getOfflineQueue();
    if (!queue || queue.length === 0) {
      isWorkerRunning = false;
      return;
    }

    const now = Date.now();
    const readyItems = queue.filter(
      (item) =>
        (!currentUid || item.uid === currentUid) &&
        (item.status === 'pending' || item.status === 'failed') &&
        now >= item.nextRetryAt &&
        item.attempts < MAX_ATTEMPTS
    );

    if (readyItems.length === 0) {
      isWorkerRunning = false;
      return;
    }

    devLog(`🔄 [Sync Queue Worker] Processing ${readyItems.length} ready queue items...`);

    // Priority ordering: 1. latest_location, 2. manual_stop/auto_stop, 3. stop_update, 4. stop_photo
    const typePriority: Record<OfflineOperationType, number> = {
      latest_location: 1,
      leader_route_sample: 2,
      manual_stop: 3,
      auto_stop: 3,
      stop_update: 4,
      stop_photo: 5,
    };

    readyItems.sort((a, b) => typePriority[a.operationType] - typePriority[b.operationType]);

    for (const item of readyItems) {
      // Lease item (use 180s for media uploads, 60s for standard operations)
      const leaseMs = item.operationType === 'stop_photo' ? MEDIA_LEASE_DURATION_MS : LEASE_DURATION_MS;
      await runSerializedMutation(async (q) => {
        const idx = q.findIndex((i) => i.id === item.id);
        if (idx >= 0) {
          q[idx] = {
            ...q[idx],
            status: 'processing',
            processingStartedAt: now,
            leaseExpiresAt: now + leaseMs,
          };
        }
        return { updatedQueue: q, result: undefined };
      });

      try {
        const success = await syncSingleItem(item, currentUid || item.uid);
        if (success) {
          // Remove completed queue item
          await runSerializedMutation(async (q) => {
            const remaining = q.filter((i) => i.id !== item.id);
            return { updatedQueue: remaining, result: undefined };
          });
          devLog(`✅ [Sync Queue Worker] Item ${item.id} successfully synchronized.`);
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String(err.message)
            : String(err || 'Sync error');
        devWarn(`[Sync Queue Worker] Deferred item ${item.id}: ${errorMessage}`);

        // Bounded exponential backoff
        const nextAttempts = item.attempts + 1;
        const delay = Math.min(
          SYNC_INITIAL_RETRY_MS * Math.pow(2, nextAttempts - 1),
          SYNC_MAX_RETRY_MS
        );
        const nextStatus: SyncItemStatus =
          nextAttempts >= MAX_ATTEMPTS ? 'manual_retry_required' : 'failed';

        await runSerializedMutation(async (q) => {
          const idx = q.findIndex((i) => i.id === item.id);
          if (idx >= 0) {
            q[idx] = {
              ...q[idx],
              attempts: nextAttempts,
              nextRetryAt: Date.now() + delay,
              status: nextStatus,
              error: errorMessage,
              leaseExpiresAt: undefined,
            };
          }
          return { updatedQueue: q, result: undefined };
        });
      }
    }
  } catch (globalErr) {
    const errorMessage = globalErr instanceof Error ? globalErr.message : String(globalErr || 'Sync error');
    devWarn(`[Sync Queue Worker] Processor deferred: ${errorMessage}`);
  } finally {
    isWorkerRunning = false;
  }
};
