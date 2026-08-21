import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getTrackingProfile,
  getTrackingTaskParams,
  isTrackingProfile,
  setTrackingProfile,
  TRACKING_PREFERENCE_KEY,
  TRACKING_PROFILES,
} from '../trackingPreferences';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-location', () => ({
  Accuracy: { Lowest: 0, Low: 1, Balanced: 2, High: 3, Highest: 4, Best: 5 },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('tracking preferences', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await storage.clear();
  });

  it('defaults to the balanced profile when nothing is stored', async () => {
    await expect(getTrackingProfile()).resolves.toBe('balanced');
  });

  it('falls back to balanced when the stored value is not a profile', async () => {
    await storage.setItem(TRACKING_PREFERENCE_KEY, 'turbo-mode');
    await expect(getTrackingProfile()).resolves.toBe('balanced');
  });

  it('returns the stored profile when valid', async () => {
    await storage.setItem(TRACKING_PREFERENCE_KEY, 'battery-saver');
    await expect(getTrackingProfile()).resolves.toBe('battery-saver');
  });

  it('round-trips a saved profile', async () => {
    await setTrackingProfile('high-accuracy');
    await expect(storage.getItem(TRACKING_PREFERENCE_KEY)).resolves.toBe('high-accuracy');
    await expect(getTrackingProfile()).resolves.toBe('high-accuracy');
  });

  it('falls back to balanced when storage read fails', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('disk error'));
    await expect(getTrackingProfile()).resolves.toBe('balanced');
  });

  it.each(['battery-saver', 'balanced', 'high-accuracy'] as const)(
    'maps %s to its task parameters',
    async (profile) => {
      await setTrackingProfile(profile);
      const params = await getTrackingTaskParams();
      expect(params).toEqual({
        timeInterval: TRACKING_PROFILES[profile].timeInterval,
        distanceInterval: TRACKING_PROFILES[profile].distanceInterval,
        accuracy: TRACKING_PROFILES[profile].accuracy,
      });
    },
  );

  it('keeps balanced as the historical default sampling', () => {
    expect(TRACKING_PROFILES.balanced.timeInterval).toBe(30000);
    expect(TRACKING_PROFILES.balanced.distanceInterval).toBe(50);
  });

  it('orders sampling strictly across profiles', () => {
    expect(TRACKING_PROFILES['battery-saver'].timeInterval).toBeGreaterThan(
      TRACKING_PROFILES.balanced.timeInterval,
    );
    expect(TRACKING_PROFILES.balanced.timeInterval).toBeGreaterThan(
      TRACKING_PROFILES['high-accuracy'].timeInterval,
    );
  });
});

describe('isTrackingProfile', () => {
  it('accepts known profile keys', () => {
    expect(isTrackingProfile('balanced')).toBe(true);
    expect(isTrackingProfile('battery-saver')).toBe(true);
    expect(isTrackingProfile('high-accuracy')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isTrackingProfile('Balanced')).toBe(false);
    expect(isTrackingProfile('')).toBe(false);
    expect(isTrackingProfile(null)).toBe(false);
    expect(isTrackingProfile(3)).toBe(false);
  });
});
