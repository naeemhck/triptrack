/**
 * TripTrack Background Location Task Service
 * 
 * ANDROID VERSION COMPATIBILITY MATRIX (minSdkVersion=31, targetSdkVersion=36):
 * 
 * API 31–32 (Android 12/12L):
 *   - ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION: runtime permission required.
 *   - ACCESS_BACKGROUND_LOCATION: must be requested SEPARATELY after foreground grant.
 *     The OS may redirect user to Settings to grant "Allow all the time".
 *   - FOREGROUND_SERVICE + FOREGROUND_SERVICE_LOCATION: manifest-declared.
 *   - POST_NOTIFICATIONS: does not exist as a runtime permission on these versions.
 *   - Foreground service background-start restrictions apply: TripTrack starts the
 *     foreground service from an interactive user action (toggle switch) to comply.
 *   - Approximate vs precise location: user may grant only ACCESS_COARSE_LOCATION.
 *     TripTrack requests ACCESS_FINE_LOCATION but must handle coarse-only grants.
 * 
 * API 33 (Android 13):
 *   - POST_NOTIFICATIONS: new runtime permission. Must be requested before showing
 *     notifications. expo-notifications requestPermissionsAsync() handles this.
 *   - Photo picker changes handled by expo-image-picker abstraction.
 * 
 * API 34 (Android 14):
 *   - Foreground service type enforcement: the declared foreground service type must
 *     exactly match the runtime foreground service type. expo-location declares
 *     type="location" and starts it correctly.
 *   - Partial photo access (selected photos only) possible; expo-image-picker handles.
 * 
 * API 35 (Android 15):
 *   - Stricter foreground service launch restrictions. TripTrack complies by starting
 *     tracking from explicit user interaction (sharing toggle).
 * 
 * API 36–37 (Android 16–17):
 *   - Further foreground service restrictions. expo-location 18.x handles via native plugin.
 *   - Edge-to-edge display enforced on API 36. react-native-safe-area-context handles insets.
 *   - TripTrack must verify foreground/background permission state before starting
 *     tracking — the permission state can change at any time via OS settings.
 * 
 * IMPORTANT — OS BEHAVIORAL POLICIES NOT ELIMINATED BY EXPO ABSTRACTION:
 *   - Location permission must be checked before every tracking start (user can revoke).
 *   - Background location permission is separate from foreground (two-step sequence).
 *   - Foreground services cannot be started from the background on API 31+.
 *   - Notification permission (API 33+) must be granted for foreground service notification.
 *   - Battery optimization may throttle background location on all versions.
 * 
 * iOS COMPATIBILITY:
 *   - NSLocationAlwaysAndWhenInUseUsageDescription required for "Always" permission.
 *   - UIBackgroundModes: ["location"] triggers App Store review scrutiny.
 *   - showsBackgroundLocationIndicator: true shows blue status bar pill.
 * 
 * BATTERY & ACCURACY CONFIGURATION:
 * Uses Location.Accuracy.Balanced with timeInterval=30000ms (30s) and distanceInterval=50m
 * to balance battery conservation with group tracking accuracy.
 * pausesUpdatesAutomatically: false ensures continuous tracking during road trips.
 */


import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { devLog } from '../utils/devLog';
import { processLocationForStopDetection, clearStopDetectorState } from './stopDetector';
import {
  enqueueLocation,
  processPendingSyncQueue,
  clearTripQueueForUser,
} from './offlineSyncQueue';

export const BACKGROUND_LOCATION_TASK = 'TRIPTRACK_BACKGROUND_LOCATION_TASK';
export const ASYNC_BG_TRIP_KEY = '@triptrack_active_bg_trip';

export type PermissionState = 'granted-always' | 'granted-foreground-only' | 'denied';

export interface ActiveBgTripInfo {
  tripId: string;
  uid: string;
  displayName: string;
  avatar?: string;
  tripName?: string;
  routeLeaderUserId?: string;
}

// Task execution context outside React component tree
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('⚠️ [Background Location Task Error]:', error.message);
    return;
  }

  if (data && data.locations && data.locations.length > 0) {
    const location = data.locations[data.locations.length - 1];
    const { latitude, longitude, accuracy } = location.coords;

    try {
      // Read active background trip info persisted in AsyncStorage
      const rawTripInfo = await AsyncStorage.getItem(ASYNC_BG_TRIP_KEY);
      if (!rawTripInfo) return;

      const tripInfo: ActiveBgTripInfo = JSON.parse(rawTripInfo);
      const { tripId, uid, displayName, avatar, routeLeaderUserId } = tripInfo;

      if (!tripId || !uid) return;
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user.id !== uid) {
        await AsyncStorage.removeItem(ASYNC_BG_TRIP_KEY);
        if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
        return;
      }

      // Write-Ahead Queue: Enqueue coalesced location sample locally first
      const sampledAt = location.timestamp || Date.now();
      await enqueueLocation(tripId, uid, {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ?? undefined,
        displayName,
        avatar: avatar || '',
        sharingEnabled: true,
        sampledAt,
      }, routeLeaderUserId === uid);

      // Trigger sync worker to flush queue if network is available
      void processPendingSyncQueue(uid);

      // Run automatic stop dwell-time detector
      await processLocationForStopDetection(tripId, uid, displayName, latitude, longitude, accuracy);
    } catch (err) {
      console.error('Error in background location callback:', err);
    }
  }
});

/**
 * Check explicit OS Location Permission status
 * 
 * ANDROID 12+ PERMISSION SEQUENCE:
 * 1. Request foreground permissions first (ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION)
 * 2. Only after foreground is granted, request ACCESS_BACKGROUND_LOCATION separately
 * 3. The OS may direct user to Settings to grant "Allow all the time"
 * 
 * expo-location handles the two-step sequence via separate
 * requestForegroundPermissionsAsync() and requestBackgroundPermissionsAsync() calls.
 */
let permissionStatusRequest: Promise<PermissionState> | null = null;

export const checkLocationPermissionsStatus = (): Promise<PermissionState> => {
  if (permissionStatusRequest) return permissionStatusRequest;

  permissionStatusRequest = (async () => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') return 'denied';

      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status === 'granted') {
        return 'granted-always';
      }
      return 'granted-foreground-only';
    } catch (err) {
      console.error('Error checking location permissions:', err);
      return 'denied';
    } finally {
      permissionStatusRequest = null;
    }
  })();

  return permissionStatusRequest;
};

/**
 * Check if background location task is actively registered
 */
export const isBackgroundTrackingRunning = async (): Promise<boolean> => {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch (e) {
    return false;
  }
};

/**
 * Start background location tracking for a specific active trip
 * 
 * ANDROID FOREGROUND SERVICE:
 * expo-location automatically starts a foreground service with type="location" when
 * startLocationUpdatesAsync is called with foregroundService config. This is required
 * for all supported Android versions (API 31+). The FOREGROUND_SERVICE_LOCATION
 * permission declared in app.json allows the typed foreground service.
 * 
 * The foreground service notification is visible to the user and accurately describes
 * that location is being shared for the active trip. It dismisses automatically when
 * stopLocationUpdatesAsync is called or sharing is toggled off.
 */
export const startBackgroundLocationTracking = async (
  tripId: string,
  user: { uid: string; name?: string; avatar?: string },
  tripName: string = 'Active Trip',
  routeLeaderUserId?: string
): Promise<PermissionState> => {
  const permState = await checkLocationPermissionsStatus();

  // Persist active trip info for background task execution outside React context
  const activeInfo: ActiveBgTripInfo = {
    tripId,
    uid: user.uid,
    displayName: user.name || 'Traveler',
    avatar: user.avatar,
    tripName,
    routeLeaderUserId,
  };
  await AsyncStorage.setItem(ASYNC_BG_TRIP_KEY, JSON.stringify(activeInfo));

  if (permState === 'granted-always') {
    const isRunning = await isBackgroundTrackingRunning();
    if (!isRunning) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000, // 30 seconds
        distanceInterval: 50, // 50 meters
        showsBackgroundLocationIndicator: true, // iOS blue status bar pill
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: `TripTrack: Sharing Location`,
          notificationBody: `Your live location is being shared with your trip group for "${tripName}"`,
          notificationColor: '#14B8A6',
        },
      });
      devLog(`🚀 [Background Location] Task started for trip.`);
    }
  }

  return permState;
};

/**
 * Cleanly stop background location tracking
 */
export const stopBackgroundLocationTracking = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(ASYNC_BG_TRIP_KEY);
    await clearStopDetectorState();
    const isRunning = await isBackgroundTrackingRunning();
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      devLog('🛑 [Background Location] Task stopped cleanly.');
    }
  } catch (err) {
    console.error('Error stopping background location updates:', err);
    throw new Error('Unable to stop background location tracking.');
  }
};

/**
 * Idempotently clean active trip state, background task, and transient offline queue items
 */
export const cleanupActiveTripState = async (tripId: string, currentUid?: string): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_BG_TRIP_KEY);
    if (raw) {
      const activeInfo: ActiveBgTripInfo = JSON.parse(raw);
      if (activeInfo.tripId === tripId) {
        await stopBackgroundLocationTracking();
      }
    }
    await clearStopDetectorState();
    if (currentUid) {
      await clearTripQueueForUser(tripId, currentUid);
    }
    devLog(`🧹 [Cleanup] Cleaned active local state for trip.`);
  } catch (err) {
    console.error('Error cleaning up active trip state:', err);
  }
};
