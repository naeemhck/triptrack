import { TripStop } from '../../types/location';
import { OfflineSyncItem } from '../../services/offlineSyncTypes';
import {
  countDurablePendingSync,
  isDurableOfflineOperation,
  mergeStopsWithPendingQueue,
} from '../tripStopDisplay';

const stop = (id: string, createdAt: number): TripStop => ({
  id,
  uid: 'u1',
  displayName: 'Naeem',
  lat: 1,
  lng: 2,
  name: `Stop ${id}`,
  createdAt,
});

const item = (overrides: Partial<OfflineSyncItem>): OfflineSyncItem => ({
  id: 'q1',
  operationType: 'latest_location',
  tripId: 't1',
  uid: 'u1',
  createdAt: 1,
  attempts: 0,
  nextRetryAt: 1,
  status: 'pending',
  payload: {},
  ...overrides,
});

describe('trip stop display helpers', () => {
  it('treats stop writes as durable and live location as transient', () => {
    expect(isDurableOfflineOperation('manual_stop')).toBe(true);
    expect(isDurableOfflineOperation('stop_photo')).toBe(true);
    expect(isDurableOfflineOperation('latest_location')).toBe(false);
    expect(isDurableOfflineOperation('leader_route_sample')).toBe(false);
  });

  it('counts only durable pending work for the trip member', () => {
    const queue = [
      item({ id: 'loc', operationType: 'latest_location' }),
      item({ id: 'route', operationType: 'leader_route_sample' }),
      item({
        id: 'stop_s2',
        operationType: 'manual_stop',
        payload: stop('s2', 2),
      }),
      item({ id: 'other', operationType: 'auto_stop', tripId: 't2' }),
    ];
    expect(countDurablePendingSync(queue, 't1', 'u1')).toBe(1);
  });

  it('merges unsynced local stops into the activity list without duplicating synced rows', () => {
    const remote = [stop('s1', 10)];
    const queue = [
      item({
        id: 'stop_s1',
        operationType: 'manual_stop',
        payload: { ...stop('s1', 10), name: 'Should not replace' },
      }),
      item({
        id: 'stop_s2',
        operationType: 'auto_stop',
        payload: stop('s2', 20),
      }),
    ];
    const merged = mergeStopsWithPendingQueue(remote, queue, 't1', 'u1');
    expect(merged.map((row) => row.id)).toEqual(['s2', 's1']);
    expect(merged[0].isPendingSync).toBe(true);
    expect(merged[1].name).toBe('Stop s1');
    expect(merged[1].isPendingSync).toBeUndefined();
  });
});
