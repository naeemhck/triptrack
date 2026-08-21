/**
 * TripTrack Tracking Preferences
 *
 * Per-device battery/accuracy profile for background location tracking.
 * Stored in AsyncStorage (not per-trip) because it controls how the OS-level
 * location task samples the GPS on this device.
 *
 * Note: the stale-location cron threshold is unchanged across profiles, so
 * Battery saver may surface stale-location alerts more often by design.
 */

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRACKING_PREFERENCE_KEY = '@triptrack_tracking_profile';

export type TrackingProfile = 'battery-saver' | 'balanced' | 'high-accuracy';

export interface TrackingProfileConfig {
  label: string;
  description: string;
  timeInterval: number; // ms
  distanceInterval: number; // meters
  accuracy: Location.LocationAccuracy;
}

export const TRACKING_PROFILES: Record<TrackingProfile, TrackingProfileConfig> = {
  'battery-saver': {
    label: 'Battery saver',
    description: 'Updates every 2 minutes / 200 m. May look stale to your group sooner.',
    timeInterval: 120000,
    distanceInterval: 200,
    accuracy: Location.Accuracy.Low,
  },
  balanced: {
    label: 'Balanced',
    description: 'Updates every 30 seconds / 50 m. Recommended for group trips.',
    timeInterval: 30000,
    distanceInterval: 50,
    accuracy: Location.Accuracy.Balanced,
  },
  'high-accuracy': {
    label: 'High accuracy',
    description: 'Updates every 10 seconds / 20 m. Uses noticeably more battery.',
    timeInterval: 10000,
    distanceInterval: 20,
    accuracy: Location.Accuracy.High,
  },
};

const VALID_PROFILES = Object.keys(TRACKING_PROFILES) as TrackingProfile[];

export const isTrackingProfile = (value: unknown): value is TrackingProfile =>
  typeof value === 'string' && (VALID_PROFILES as string[]).includes(value);

/** Read the saved profile, falling back to Balanced on missing/invalid data. */
export const getTrackingProfile = async (): Promise<TrackingProfile> => {
  try {
    const saved = await AsyncStorage.getItem(TRACKING_PREFERENCE_KEY);
    return isTrackingProfile(saved) ? saved : 'balanced';
  } catch {
    return 'balanced';
  }
};

export const setTrackingProfile = async (profile: TrackingProfile): Promise<void> => {
  await AsyncStorage.setItem(TRACKING_PREFERENCE_KEY, profile);
};

/** Task parameters derived from the saved profile (used at tracking start). */
export const getTrackingTaskParams = async (): Promise<
  Pick<TrackingProfileConfig, 'timeInterval' | 'distanceInterval' | 'accuracy'>
> => {
  const { timeInterval, distanceInterval, accuracy } =
    TRACKING_PROFILES[await getTrackingProfile()];
  return { timeInterval, distanceInterval, accuracy };
};
