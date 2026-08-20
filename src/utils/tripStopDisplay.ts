import { TripStop } from '../types/location';
import { OfflineOperationType, OfflineSyncItem } from '../services/offlineSyncTypes';

export const DURABLE_OFFLINE_OPERATIONS: ReadonlySet<OfflineOperationType> = new Set([
  'manual_stop',
  'auto_stop',
  'stop_update',
  'stop_photo',
]);

export const isDurableOfflineOperation = (type: OfflineOperationType): boolean =>
  DURABLE_OFFLINE_OPERATIONS.has(type);

export const countDurablePendingSync = (
  queue: OfflineSyncItem[],
  tripId: string,
  uid?: string,
): number =>
  queue.filter(
    (item) =>
      item.tripId === tripId &&
      (!uid || item.uid === uid) &&
      isDurableOfflineOperation(item.operationType),
  ).length;

export const mergeStopsWithPendingQueue = (
  remoteStops: TripStop[],
  queue: OfflineSyncItem[],
  tripId: string,
  uid?: string,
): TripStop[] => {
  const merged = new Map<string, TripStop>();
  remoteStops.forEach((stop) => merged.set(stop.id, stop));
  queue
    .filter(
      (item) =>
        item.tripId === tripId &&
        (!uid || item.uid === uid) &&
        (item.operationType === 'manual_stop' || item.operationType === 'auto_stop'),
    )
    .forEach((item) => {
      const stop = item.payload as TripStop | undefined;
      if (stop?.id && !merged.has(stop.id)) {
        merged.set(stop.id, { ...stop, isPendingSync: true });
      }
    });
  return Array.from(merged.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};
