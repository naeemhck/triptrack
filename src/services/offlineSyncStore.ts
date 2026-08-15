import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportError } from '../utils/errorReporting';
import { logger } from '../utils/logger';
import { OfflineSyncItem, SyncItemStatus } from './offlineSyncTypes';

export const ASYNC_QUEUE_KEY = '@triptrack_offline_sync_queue';

let mutationChain: Promise<unknown> = Promise.resolve();

export const runSerializedQueueMutation = <T>(
  mutationFn: (queue: OfflineSyncItem[]) => Promise<{ updatedQueue: OfflineSyncItem[]; result: T }>,
): Promise<T> => {
  const nextPromise = mutationChain.then(async () => {
    try {
      const raw = await AsyncStorage.getItem(ASYNC_QUEUE_KEY);
      let queue: OfflineSyncItem[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            queue = parsed.filter(
              (item) => item && item.id && item.operationType && item.tripId && item.uid,
            );
          }
        } catch (error) {
          reportError(error, { operation: 'offlineQueue.parse' });
        }
      }

      const { updatedQueue, result } = await mutationFn(queue);
      await AsyncStorage.setItem(ASYNC_QUEUE_KEY, JSON.stringify(updatedQueue));
      return result;
    } catch (error) {
      reportError(error, { operation: 'offlineQueue.mutate' });
      throw error;
    }
  });

  mutationChain = nextPromise.catch(() => undefined);
  return nextPromise;
};

export const getOfflineQueue = async (): Promise<OfflineSyncItem[]> =>
  runSerializedQueueMutation(async (queue) => {
    const now = Date.now();
    const cleaned = queue.map((item) => {
      if (item.status === 'processing' && item.leaseExpiresAt && now > item.leaseExpiresAt) {
        logger.info('offline_queue.lease_reclaimed', { operationType: item.operationType });
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
