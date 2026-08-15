import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ACTIVE_TRIP_KEY = '@triptrack_last_active_trip';

export const rememberActiveTrip = (tripId: string): Promise<void> =>
  AsyncStorage.setItem(LAST_ACTIVE_TRIP_KEY, tripId);

export const getRememberedTrip = (): Promise<string | null> =>
  AsyncStorage.getItem(LAST_ACTIVE_TRIP_KEY);

export const forgetRememberedTrip = (): Promise<void> =>
  AsyncStorage.removeItem(LAST_ACTIVE_TRIP_KEY);
