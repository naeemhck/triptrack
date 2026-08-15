import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  ASYNC_DETECTOR_STATE_KEY,
  DetectorState,
  DWELL_TIME_THRESHOLD_MS,
  processLocationForStopDetection,
  STOP_RADIUS_METERS,
} from '../stopDetector';
import { listStops } from '../supabase/stops';
import {
  enqueueStop,
  enqueueStopUpdate,
  getOfflineQueue,
  processPendingSyncQueue,
} from '../offlineSyncQueue';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../supabase/stops', () => ({ listStops: jest.fn() }));
jest.mock('../offlineSyncQueue', () => ({
  enqueueStop: jest.fn(),
  enqueueStopUpdate: jest.fn(),
  getOfflineQueue: jest.fn(),
  processPendingSyncQueue: jest.fn(),
}));
jest.mock('../../utils/errorReporting', () => ({ reportError: jest.fn() }));
jest.mock('../../utils/devLog', () => ({ devLog: jest.fn() }));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const randomUUID = Crypto.randomUUID as jest.Mock;
const listStopsMock = listStops as jest.MockedFunction<typeof listStops>;
const getQueueMock = getOfflineQueue as jest.MockedFunction<typeof getOfflineQueue>;
const now = 1_000_000;

const state = (overrides: Partial<DetectorState> = {}): DetectorState => ({
  tripId: 'trip-1',
  uid: 'user-1',
  candidateLat: 37,
  candidateLng: -122,
  candidateStartedAt: now,
  lastSeenAt: now,
  pendingStopId: 'stop-stable',
  ...overrides,
});

describe('automatic stop detector', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await storage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    randomUUID.mockReturnValue('stop-generated');
    listStopsMock.mockResolvedValue([]);
    getQueueMock.mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('ignores an inaccurate GPS sample', async () => {
    await expect(
      processLocationForStopDetection('trip-1', 'user-1', 'Traveler', 37, -122, 101),
    ).resolves.toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('starts a durable dwell candidate with a stable stop id', async () => {
    await processLocationForStopDetection('trip-1', 'user-1', 'Traveler', 37, -122, 10);
    const saved = JSON.parse((await storage.getItem(ASYNC_DETECTOR_STATE_KEY))!);
    expect(saved).toMatchObject({ pendingStopId: 'stop-generated', candidateStartedAt: now });
  });

  it('resets a candidate after movement beyond the dwell radius', async () => {
    await storage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(state()));
    await processLocationForStopDetection(
      'trip-1',
      'user-1',
      'Traveler',
      37 + (STOP_RADIUS_METERS + 20) / 111_000,
      -122,
    );
    const saved = JSON.parse((await storage.getItem(ASYNC_DETECTOR_STATE_KEY))!);
    expect(saved.pendingStopId).toBe('stop-generated');
    expect(enqueueStop).not.toHaveBeenCalled();
  });

  it('creates one automatic stop after the dwell threshold', async () => {
    await storage.setItem(
      ASYNC_DETECTOR_STATE_KEY,
      JSON.stringify(state({ candidateStartedAt: now - DWELL_TIME_THRESHOLD_MS })),
    );
    const stop = await processLocationForStopDetection('trip-1', 'user-1', 'Traveler', 37, -122);
    expect(stop).toMatchObject({ id: 'stop-stable', autoDetected: true, type: 'auto' });
    expect(enqueueStop).toHaveBeenCalledTimes(1);
    expect(processPendingSyncQueue).toHaveBeenCalledWith('user-1');
  });

  it('binds to a recent nearby stop instead of creating a duplicate', async () => {
    await storage.setItem(
      ASYNC_DETECTOR_STATE_KEY,
      JSON.stringify(state({ candidateStartedAt: now - DWELL_TIME_THRESHOLD_MS })),
    );
    listStopsMock.mockResolvedValue([
      {
        id: 'existing',
        uid: 'user-1',
        displayName: 'Traveler',
        lat: 37,
        lng: -122,
        name: 'Existing stop',
        createdAt: now,
        autoDetected: true,
      },
    ]);
    await processLocationForStopDetection('trip-1', 'user-1', 'Traveler', 37, -122);
    const saved = JSON.parse((await storage.getItem(ASYNC_DETECTOR_STATE_KEY))!);
    expect(saved).toMatchObject({ activeStopId: 'existing', activeStopIsAuto: true });
    expect(enqueueStop).not.toHaveBeenCalled();
  });

  it('keeps an active stop while the traveler remains nearby', async () => {
    await storage.setItem(
      ASYNC_DETECTOR_STATE_KEY,
      JSON.stringify(
        state({
          activeStopId: 'active',
          activeStopLat: 37,
          activeStopLng: -122,
          pendingStopId: undefined,
        }),
      ),
    );
    await processLocationForStopDetection('trip-1', 'user-1', 'Traveler', 37, -122);
    expect(enqueueStopUpdate).not.toHaveBeenCalled();
  });

  it('records departure from an automatic stop and starts a new candidate', async () => {
    await storage.setItem(
      ASYNC_DETECTOR_STATE_KEY,
      JSON.stringify(
        state({
          activeStopId: 'active',
          activeStopLat: 37,
          activeStopLng: -122,
          activeStopIsAuto: true,
          pendingStopId: undefined,
        }),
      ),
    );
    await processLocationForStopDetection('trip-1', 'user-1', 'Traveler', 37.002, -122);
    expect(enqueueStopUpdate).toHaveBeenCalledWith('trip-1', 'user-1', 'active', {
      departedAt: now,
    });
    const saved = JSON.parse((await storage.getItem(ASYNC_DETECTOR_STATE_KEY))!);
    expect(saved).toMatchObject({ pendingStopId: 'stop-generated', candidateLat: 37.002 });
  });

  it('discards detector state owned by another user', async () => {
    await storage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(state({ uid: 'other-user' })));
    await processLocationForStopDetection('trip-1', 'user-1', 'Traveler', 37, -122);
    const saved = JSON.parse((await storage.getItem(ASYNC_DETECTOR_STATE_KEY))!);
    expect(saved.uid).toBe('user-1');
    expect(saved.pendingStopId).toBe('stop-generated');
  });
});
