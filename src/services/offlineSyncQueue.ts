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

import * as Crypto from 'expo-crypto';
import { TripStop, MemberLocation } from '../types/location';
import { upsertLocation } from './supabase/locations';
import { updateStop, upsertStop } from './supabase/stops';
import { reportError } from '../utils/errorReporting';
import { logger } from '../utils/logger';
import {
  LEASE_DURATION_MS,
  MAX_ATTEMPTS,
  MEDIA_LEASE_DURATION_MS,
  SYNC_INITIAL_RETRY_MS,
  SYNC_MAX_RETRY_MS,
  leaseDurationFor,
  nextRetryState,
} from './offlineSyncBackoff';
import {
  MAX_PENDING_PHOTOS,
  prepareDurableStopPhoto,
  removeDurableStopPhoto,
  syncQueuedStopPhoto,
} from './offlineSyncPhotos';
import {
  ASYNC_QUEUE_KEY,
  getOfflineQueue,
  runSerializedQueueMutation as runSerializedMutation,
} from './offlineSyncStore';
import { OfflineOperationType, OfflineSyncItem, SyncItemStatus } from './offlineSyncTypes';

export {
  ASYNC_QUEUE_KEY,
  getOfflineQueue,
  LEASE_DURATION_MS,
  MAX_ATTEMPTS,
  MEDIA_LEASE_DURATION_MS,
  SYNC_INITIAL_RETRY_MS,
  SYNC_MAX_RETRY_MS,
  MAX_PENDING_PHOTOS,
};
export const MAX_PENDING_LEADER_SAMPLES = 20;
export type { OfflineOperationType, OfflineSyncItem, SyncItemStatus };

let isWorkerRunning = false;
let workerRerunRequested = false;

/**
 * Enqueue / Coalesce a Live Location sample (`latest_location`)
 * Keyed by `tripId + uid`: exactly ONE pending sample per user/trip
 */
export const enqueueLocation = async (
  tripId: string,
  uid: string,
  locationData: Partial<MemberLocation> & { sampledAt?: number },
  isRouteLeader = false,
): Promise<void> => {
  return runSerializedMutation(async (queue) => {
    const now = Date.now();
    const sampleId = Crypto.randomUUID();
    const locationItemId = `loc_${tripId}_${uid}`;
    let filtered = queue.filter((item) => item.id !== locationItemId);

    if (isRouteLeader) {
      const existingRouteSamples = filtered
        .filter(
          (item) =>
            item.operationType === 'leader_route_sample' &&
            item.tripId === tripId &&
            item.uid === uid,
        )
        .sort((a, b) => (a.sampledAt || a.createdAt) - (b.sampledAt || b.createdAt));
      if (existingRouteSamples.length >= MAX_PENDING_LEADER_SAMPLES) {
        const dropCount = existingRouteSamples.length - MAX_PENDING_LEADER_SAMPLES + 1;
        const dropIds = new Set(existingRouteSamples.slice(0, dropCount).map((item) => item.id));
        filtered = filtered.filter((item) => !dropIds.has(item.id));
      }
    }

    const newItem: OfflineSyncItem = {
      id: locationItemId,
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

    logger.info('offline_queue.location_coalesced', { isRouteLeader });
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
  localPhotoUri?: string,
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

    logger.info('offline_queue.stop_enqueued', { operationType });
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
  updateFields: Partial<TripStop>,
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
      logger.info('offline_queue.stop_update_merged');
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

    logger.info('offline_queue.stop_update_enqueued');
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
  localPhotoUri: string,
): Promise<void> => {
  const durablePhotoUri = await prepareDurableStopPhoto(stopId, localPhotoUri);

  try {
    return await runSerializedMutation(async (queue) => {
      const pendingPhotoCount = queue.filter((i) => i.operationType === 'stop_photo').length;
      if (pendingPhotoCount >= MAX_PENDING_PHOTOS) {
        logger.warn('offline_queue.photo_limit_reached', { limit: MAX_PENDING_PHOTOS });
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

      logger.info('offline_queue.photo_enqueued');
      return { updatedQueue: [...queue, photoItem], result: undefined };
    });
  } catch (error) {
    await removeDurableStopPhoto(durablePhotoUri);
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
      (item) =>
        !(
          item.tripId === tripId &&
          item.uid === uid &&
          (item.operationType === 'latest_location' || item.operationType === 'leader_route_sample')
        ),
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
    logger.warn('offline_queue.owner_mismatch', { operationType: item.operationType });
    return false;
  }

  const { operationType, tripId, payload, localPhotoUri } = item;

  if (operationType === 'latest_location') {
    await upsertLocation(
      tripId,
      item.uid,
      {
        ...payload,
        sampledAt: item.sampledAt || payload.sampledAt || Date.now(),
      },
      payload.sampleId,
      false,
    );
    return true;
  }

  if (operationType === 'leader_route_sample') {
    await upsertLocation(
      tripId,
      item.uid,
      {
        ...payload,
        sampledAt: item.sampledAt || payload.sampledAt || Date.now(),
      },
      payload.sampleId,
      true,
    );
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
    await syncQueuedStopPhoto({
      tripId,
      stopId: payload.stopId,
      uid: item.uid,
      localPhotoUri,
      photoUploaded: Boolean(payload.photoUploaded),
      remotePath: payload.remotePath as string | null,
      onUploadComplete: async (remotePath) => {
        await runSerializedMutation(async (queue) => ({
          updatedQueue: queue.map((queued) =>
            queued.id === item.id
              ? { ...queued, payload: { ...queued.payload, photoUploaded: true, remotePath } }
              : queued,
          ),
          result: undefined,
        }));
      },
    });
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
    workerRerunRequested = true;
    logger.info('offline_queue.worker_already_running');
    return;
  }

  isWorkerRunning = true;

  try {
    do {
      workerRerunRequested = false;
      await processReadyQueueItems(currentUid);
    } while (workerRerunRequested);
  } catch (globalErr) {
    logger.error('offline_queue.processor_deferred');
    reportError(globalErr, { operation: 'offlineQueue.process' });
  } finally {
    isWorkerRunning = false;
    if (workerRerunRequested) {
      workerRerunRequested = false;
      void processPendingSyncQueue(currentUid);
    }
  }
};

const processReadyQueueItems = async (currentUid?: string): Promise<void> => {
  const queue = await getOfflineQueue();
  if (!queue || queue.length === 0) return;

  const now = Date.now();
  const readyItems = queue.filter(
    (item) =>
      (!currentUid || item.uid === currentUid) &&
      (item.status === 'pending' || item.status === 'failed') &&
      now >= item.nextRetryAt &&
      item.attempts < MAX_ATTEMPTS,
  );

  if (readyItems.length === 0) return;

  logger.info('offline_queue.processing', { queueCount: readyItems.length });

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
    const leaseMs = leaseDurationFor(item.operationType);
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
        await runSerializedMutation(async (q) => {
          const remaining = q.filter((i) => i.id !== item.id);
          return { updatedQueue: remaining, result: undefined };
        });
        logger.info('offline_queue.item_synchronized', { operationType: item.operationType });
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String(err.message)
            : String(err || 'Sync error');
      logger.warn('offline_queue.item_deferred', {
        operationType: item.operationType,
        attempt: item.attempts + 1,
      });

      const retry = nextRetryState(item.attempts, Date.now());

      await runSerializedMutation(async (q) => {
        const idx = q.findIndex((i) => i.id === item.id);
        if (idx >= 0) {
          q[idx] = {
            ...q[idx],
            attempts: retry.attempts,
            nextRetryAt: retry.nextRetryAt,
            status: retry.status,
            error: errorMessage,
            leaseExpiresAt: undefined,
          };
        }
        return { updatedQueue: q, result: undefined };
      });
    }
  }
};
