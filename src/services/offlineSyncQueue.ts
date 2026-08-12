/**
 * TripTrack Application-Owned Offline Synchronization Queue Service
 * 
 * ARCHITECTURE & RELIABILITY MODEL:
 * TripTrack uses a Write-Ahead Queue strategy (Local durable state first -> remote sync second -> ack/removal last).
 * 
 * KEY FEATURES:
 * 1. Operation Types: `latest_location`, `manual_stop`, `auto_stop`, `stop_update`, `stop_photo`
 * 2. Coalesced Live Location: Keyed by `tripId + uid` (1 pending sample per trip/user; newest sample replaces older)
 * 3. Stable Stop IDs: Idempotent Firestore setDoc(..., { merge: true })
 * 4. Photo Durability & JPEG Normalization: Photos copied to app document directory before queueing; partial success handling
 * 5. Serialized Mutations & Crash Lease Recovery: Mutex lock for queue mutations; processing leases expire after 60s
 * 6. Bounded Exponential Backoff: Initial 5s, max 5m, max 10 attempts before `manual_retry_required`
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, isMockFirebase } from '../config/firebase';
import { TripStop, MemberLocation } from '../types/location';

export const ASYNC_QUEUE_KEY = '@triptrack_offline_sync_queue';
export const LEASE_DURATION_MS = 60 * 1000; // 60s lease timeout for standard operations
export const MEDIA_LEASE_DURATION_MS = 180 * 1000; // 180s lease timeout for slow media photo uploads
export const SYNC_INITIAL_RETRY_MS = 5000; // 5s
export const SYNC_MAX_RETRY_MS = 5 * 60 * 1000; // 5m
export const MAX_ATTEMPTS = 10;
export const MAX_PENDING_PHOTOS = 20; // Retention safety limit for queued photos

export type OfflineOperationType =
  | 'latest_location'
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
        console.log(`⏳ [Sync Queue] Reclaimed expired processing lease for item ${item.id}`);
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
  locationData: Partial<MemberLocation> & { sampledAt?: number }
): Promise<void> => {
  return runSerializedMutation(async (queue) => {
    const now = Date.now();
    const itemId = `loc_${tripId}_${uid}`;

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
        sampledAt: locationData.sampledAt || now,
      },
    };

    console.log(`📥 [Sync Queue] Coalesced live location for user ${uid} on trip ${tripId}`);
    return { updatedQueue: [...filtered, newItem], result: undefined };
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

    console.log(`📥 [Sync Queue] Enqueued ${operationType} "${stopData.name}" (${stopData.id})`);
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
      console.log(`📥 [Sync Queue] Merged stop_update directly into queued stop ${stopId}`);
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

    console.log(`📥 [Sync Queue] Enqueued stop_update for stop ${stopId}`);
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
  return runSerializedMutation(async (queue) => {
    const pendingPhotoCount = queue.filter((i) => i.operationType === 'stop_photo').length;
    if (pendingPhotoCount >= MAX_PENDING_PHOTOS) {
      console.warn(`⚠️ [Sync Queue] Pending photo limit (${MAX_PENDING_PHOTOS}) reached. Deferring new photo queuing.`);
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
      localPhotoUri,
      payload: { stopId, photoUploaded: false, photoUrl: null },
    };

    console.log(`📥 [Sync Queue] Enqueued stop_photo for stop ${stopId}`);
    return { updatedQueue: [...queue, photoItem], result: undefined };
  });
};

/**
 * Clear queue items for a user who left a trip
 */
export const clearTripQueueForUser = async (tripId: string, uid: string): Promise<void> => {
  return runSerializedMutation(async (queue) => {
    // Cancel transient live_location items for departed trip; retain durable manual stops in conflict state if needed
    const updated = queue.filter(
      (item) => !(item.tripId === tripId && item.uid === uid && item.operationType === 'latest_location')
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
    console.log(`⚠️ [Sync Queue] User mismatch for item ${item.id} (item uid: ${item.uid}, current uid: ${currentUid}). Skipping.`);
    return false;
  }

  const { operationType, tripId, payload, localPhotoUri } = item;

  if (isMockFirebase) {
    console.log(`[Mock Sync] Replayed ${operationType} ${item.id} successfully.`);
    return true;
  }

  if (operationType === 'latest_location') {
    // Write coalesced location sample
    await setDoc(doc(db, 'trips', tripId, 'locations', item.uid), {
      uid: item.uid,
      lat: payload.lat,
      lng: payload.lng,
      accuracy: payload.accuracy,
      sampledAt: item.sampledAt || payload.sampledAt || Date.now(),
      updatedAt: Date.now(),
      displayName: payload.displayName || 'Traveler',
      avatar: payload.avatar || '',
      sharingEnabled: payload.sharingEnabled !== false,
    }, { merge: true });
    return true;
  }

  if (operationType === 'manual_stop' || operationType === 'auto_stop') {
    // Idempotent stop write
    await setDoc(doc(db, 'trips', tripId, 'stops', payload.id), {
      ...payload,
      createdAt: payload.createdAt || Date.now(),
    }, { merge: true });
    return true;
  }

  if (operationType === 'stop_update') {
    // Update existing stop
    const { stopId, ...fields } = payload;
    await updateDoc(doc(db, 'trips', tripId, 'stops', stopId), fields);
    return true;
  }

  if (operationType === 'stop_photo') {
    const stopId = payload.stopId;
    let photoUrl = payload.photoUrl;

    // Partial success recovery: if Storage upload hasn't succeeded yet, upload photo
    if (!payload.photoUploaded && localPhotoUri) {
      console.log(`📤 [Sync Queue] Uploading photo for stop ${stopId}...`);
      const response = await fetch(localPhotoUri);
      const blob = await response.blob();
      const storagePath = `trips/${tripId}/stops/${stopId}/photo.jpg`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      photoUrl = await getDownloadURL(storageRef);

      // Update payload in memory to mark photoUploaded: true before Firestore write
      payload.photoUploaded = true;
      payload.photoUrl = photoUrl;
    }

    // Attach photoUrl to parent stop in Firestore
    if (photoUrl) {
      await updateDoc(doc(db, 'trips', tripId, 'stops', stopId), {
        photoUrl,
      });
    }
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
    console.log('🔒 [Sync Queue] Sync worker already running. Skipping concurrent run.');
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
        (item.status === 'pending' || item.status === 'failed') &&
        now >= item.nextRetryAt &&
        item.attempts < MAX_ATTEMPTS
    );

    if (readyItems.length === 0) {
      isWorkerRunning = false;
      return;
    }

    console.log(`🔄 [Sync Queue Worker] Processing ${readyItems.length} ready queue items...`);

    // Priority ordering: 1. latest_location, 2. manual_stop/auto_stop, 3. stop_update, 4. stop_photo
    const typePriority: Record<OfflineOperationType, number> = {
      latest_location: 1,
      manual_stop: 2,
      auto_stop: 2,
      stop_update: 3,
      stop_photo: 4,
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
          console.log(`✅ [Sync Queue Worker] Item ${item.id} successfully synchronized.`);
        }
      } catch (err: any) {
        console.error(`❌ [Sync Queue Worker] Failed item ${item.id}:`, err.message);

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
              error: err.message || 'Sync error',
              leaseExpiresAt: undefined,
            };
          }
          return { updatedQueue: q, result: undefined };
        });
      }
    }
  } catch (globalErr) {
    console.error('⚠️ [Sync Queue Worker] Global processor error:', globalErr);
  } finally {
    isWorkerRunning = false;
  }
};
