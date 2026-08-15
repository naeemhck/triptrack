import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  forgetRememberedTrip,
  getRememberedTrip,
  rememberActiveTrip,
} from '../tripWorkspacePersistence';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('trip workspace persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('remembers and clears only the active trip identifier', async () => {
    await rememberActiveTrip('trip-1');
    expect(await getRememberedTrip()).toBe('trip-1');

    await forgetRememberedTrip();
    expect(await getRememberedTrip()).toBeNull();
  });
});
