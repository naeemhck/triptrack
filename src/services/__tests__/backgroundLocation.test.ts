import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  ASYNC_BG_TRIP_KEY,
  BACKGROUND_LOCATION_TASK,
  checkLocationPermissionsStatus,
  cleanupActiveTripState,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from '../backgroundLocation';
import { clearStopDetectorState, processLocationForStopDetection } from '../stopDetector';
import { supabase } from '../../config/supabase';
import {
  clearTripQueueForUser,
  enqueueLocation,
  processPendingSyncQueue,
} from '../offlineSyncQueue';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
}));
jest.mock('../../config/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('../stopDetector', () => ({
  clearStopDetectorState: jest.fn(),
  processLocationForStopDetection: jest.fn(),
}));
jest.mock('../offlineSyncQueue', () => ({
  clearTripQueueForUser: jest.fn(),
  enqueueLocation: jest.fn(),
  processPendingSyncQueue: jest.fn(),
}));
jest.mock('../../utils/errorReporting', () => ({ reportError: jest.fn() }));
jest.mock('../../utils/devLog', () => ({ devLog: jest.fn() }));

const location = Location as jest.Mocked<typeof Location>;
const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const backgroundTask = (TaskManager.defineTask as jest.Mock).mock.calls[0][1];

describe('background location controls', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await storage.clear();
    location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    location.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
  });

  it.each([
    ['denied', 'denied', 'denied'],
    ['granted', 'denied', 'granted-foreground-only'],
    ['granted', 'granted', 'granted-always'],
  ] as const)('maps foreground %s and background %s permissions', async (fg, bg, expected) => {
    location.getForegroundPermissionsAsync.mockResolvedValue({ status: fg } as never);
    location.getBackgroundPermissionsAsync.mockResolvedValue({ status: bg } as never);
    await expect(checkLocationPermissionsStatus()).resolves.toBe(expected);
  });

  it('persists active context and starts the native task once', async () => {
    await startBackgroundLocationTracking(
      'trip-1',
      { uid: 'user-1', name: 'Traveler' },
      'Coastal Run',
      'user-1',
    );
    expect(JSON.parse((await storage.getItem(ASYNC_BG_TRIP_KEY))!)).toMatchObject({
      tripId: 'trip-1',
      uid: 'user-1',
      routeLeaderUserId: 'user-1',
    });
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      BACKGROUND_LOCATION_TASK,
      expect.objectContaining({ timeInterval: 30_000, distanceInterval: 50 }),
    );
  });

  it('does not restart a task that is already running', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    await startBackgroundLocationTracking('trip-1', { uid: 'user-1' });
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('keeps foreground-only context without starting the background task', async () => {
    location.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    await expect(startBackgroundLocationTracking('trip-1', { uid: 'user-1' })).resolves.toBe(
      'granted-foreground-only',
    );
    expect(await storage.getItem(ASYNC_BG_TRIP_KEY)).not.toBeNull();
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('clears durable state and stops a running task', async () => {
    await storage.setItem(ASYNC_BG_TRIP_KEY, '{}');
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    await stopBackgroundLocationTracking();
    expect(await storage.getItem(ASYNC_BG_TRIP_KEY)).toBeNull();
    expect(clearStopDetectorState).toHaveBeenCalledTimes(1);
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith(BACKGROUND_LOCATION_TASK);
  });

  it('queues a valid background sample for the authenticated trip member', async () => {
    await storage.setItem(
      ASYNC_BG_TRIP_KEY,
      JSON.stringify({
        tripId: 'trip-1',
        uid: 'user-1',
        displayName: 'Traveler',
        routeLeaderUserId: 'user-1',
      }),
    );
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    });
    await backgroundTask({
      data: {
        locations: [{ coords: { latitude: 37, longitude: -122, accuracy: 10 }, timestamp: 123 }],
      },
    });
    expect(enqueueLocation).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      expect.objectContaining({ lat: 37, lng: -122, sampledAt: 123 }),
      true,
    );
    expect(processPendingSyncQueue).toHaveBeenCalledWith('user-1');
    expect(processLocationForStopDetection).toHaveBeenCalledTimes(1);
  });

  it('removes stale background context when the authenticated user changes', async () => {
    await storage.setItem(
      ASYNC_BG_TRIP_KEY,
      JSON.stringify({ tripId: 'trip-1', uid: 'user-1', displayName: 'Traveler' }),
    );
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'user-2' } } },
    });
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    await backgroundTask({
      data: { locations: [{ coords: { latitude: 37, longitude: -122 } }] },
    });
    expect(await storage.getItem(ASYNC_BG_TRIP_KEY)).toBeNull();
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith(BACKGROUND_LOCATION_TASK);
    expect(enqueueLocation).not.toHaveBeenCalled();
  });

  it('cleans queue state only for the matching trip', async () => {
    await storage.setItem(ASYNC_BG_TRIP_KEY, JSON.stringify({ tripId: 'another-trip' }));
    await cleanupActiveTripState('trip-1', 'user-1');
    expect(clearStopDetectorState).toHaveBeenCalledTimes(1);
    expect(clearTripQueueForUser).toHaveBeenCalledWith('trip-1', 'user-1');
    expect(location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});
