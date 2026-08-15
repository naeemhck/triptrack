import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  ASYNC_QUEUE_KEY,
  clearTripQueueForUser,
  enqueueLocation,
  enqueueStop,
  enqueueStopUpdate,
  getOfflineQueue,
  LEASE_DURATION_MS,
  processPendingSyncQueue,
  SYNC_INITIAL_RETRY_MS,
} from '../offlineSyncQueue';
import { upsertLocation } from '../supabase/locations';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase/locations', () => ({ upsertLocation: jest.fn() }));
jest.mock('../supabase/photos', () => ({ stopPhotoPath: jest.fn(), uploadStopPhoto: jest.fn() }));
jest.mock('../supabase/stops', () => ({
  assertStopExistsOwned: jest.fn(),
  updateStop: jest.fn(),
  upsertStop: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const crypto = Crypto as jest.Mocked<typeof Crypto>;

describe('offline sync queue', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.clearAllMocks();
    await storage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    crypto.randomUUID.mockReturnValue('00000000-0000-4000-8000-000000000001');
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('coalesces location samples by trip and user', async () => {
    await enqueueLocation('t1', 'u1', { lat: 1, lng: 2 });
    await enqueueLocation('t1', 'u1', { lat: 3, lng: 4 });
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toMatchObject({ lat: 3, lng: 4 });
  });

  it('queues a leader route sample beside the coalesced location', async () => {
    await enqueueLocation('t1', 'u1', { lat: 1, lng: 2 }, true);
    expect((await getOfflineQueue()).map((item) => item.operationType)).toEqual([
      'latest_location',
      'leader_route_sample',
    ]);
  });

  it('reclaims an expired processing lease', async () => {
    await storage.setItem(
      ASYNC_QUEUE_KEY,
      JSON.stringify([
        {
          id: 'loc_t1_u1',
          operationType: 'latest_location',
          tripId: 't1',
          uid: 'u1',
          createdAt: 1,
          attempts: 0,
          nextRetryAt: 1,
          status: 'processing',
          leaseExpiresAt: 999_999,
          payload: {},
        },
      ]),
    );
    expect((await getOfflineQueue())[0]).toMatchObject({
      status: 'pending',
      leaseExpiresAt: undefined,
    });
  });

  it('replaces duplicate stop creation with the latest payload', async () => {
    const base = {
      id: 's1',
      uid: 'u1',
      displayName: 'N',
      lat: 1,
      lng: 2,
      name: 'First',
      createdAt: 1,
    };
    await enqueueStop('t1', 'u1', base, 'manual_stop');
    await enqueueStop('t1', 'u1', { ...base, name: 'Updated' }, 'manual_stop');
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload.name).toBe('Updated');
  });

  it('merges stop updates into an unsynced parent stop', async () => {
    const base = {
      id: 's1',
      uid: 'u1',
      displayName: 'N',
      lat: 1,
      lng: 2,
      name: 'First',
      createdAt: 1,
    };
    await enqueueStop('t1', 'u1', base, 'manual_stop');
    await enqueueStopUpdate('t1', 'u1', 's1', { note: 'Ready' });
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload.note).toBe('Ready');
  });

  it('clears only transient location work when a member leaves', async () => {
    const base = {
      id: 's1',
      uid: 'u1',
      displayName: 'N',
      lat: 1,
      lng: 2,
      name: 'First',
      createdAt: 1,
    };
    await enqueueLocation('t1', 'u1', { lat: 1, lng: 2 }, true);
    await enqueueStop('t1', 'u1', base, 'manual_stop');
    await clearTripQueueForUser('t1', 'u1');
    expect((await getOfflineQueue()).map((item) => item.operationType)).toEqual(['manual_stop']);
  });

  it('applies exponential backoff after a failed sync', async () => {
    (upsertLocation as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await enqueueLocation('t1', 'u1', { lat: 1, lng: 2 });
    await processPendingSyncQueue('u1');
    expect((await getOfflineQueue())[0]).toMatchObject({
      attempts: 1,
      status: 'failed',
      nextRetryAt: 1_000_000 + SYNC_INITIAL_RETRY_MS,
    });
  });

  it('uses the configured lease duration for standard operations', () =>
    expect(LEASE_DURATION_MS).toBe(60_000));
});
