import * as Notifications from 'expo-notifications';
import { setupNotificationResponseListener } from '../notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../config/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const response = (data: Record<string, unknown>) =>
  ({ notification: { request: { content: { data } } } }) as Notifications.NotificationResponse;

describe('notification workspace routing', () => {
  const tripId = '20000000-0000-4000-8000-000000000001';
  let listener: (value: Notifications.NotificationResponse) => void;
  const clear = Notifications.clearLastNotificationResponseAsync as jest.Mock;
  const getLast = Notifications.getLastNotificationResponseAsync as jest.Mock;
  const addListener = Notifications.addNotificationResponseReceivedListener as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getLast.mockResolvedValue(null);
    clear.mockResolvedValue(undefined);
    addListener.mockImplementation((callback) => {
      listener = callback;
      return { remove: jest.fn() };
    });
  });

  it('routes departure notifications to Members', () => {
    const navigation = { navigate: jest.fn(), isReady: jest.fn(() => true) };
    setupNotificationResponseListener(navigation);
    listener(response({ tripId, memberUserId: 'member-2' }));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'TripDetail',
      expect.objectContaining({ tripId, initialTab: 'members', targetUserId: 'member-2' }),
    );
  });

  it('routes stop notifications to the highlighted Map context', () => {
    const navigation = { navigate: jest.fn(), isReady: jest.fn(() => true) };
    const stopId = '30000000-0000-4000-8000-000000000001';
    setupNotificationResponseListener(navigation);
    listener(response({ tripId, stopId, lat: 37.42, lng: -122.08 }));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'TripDetail',
      expect.objectContaining({ tripId, highlightStopId: stopId, initialTab: 'map' }),
    );
  });

  it('routes stale-location notifications to the affected member on Map', () => {
    const navigation = { navigate: jest.fn(), isReady: jest.fn(() => true) };
    setupNotificationResponseListener(navigation);
    listener(response({ tripId, staleUserId: 'member-3' }));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'TripDetail',
      expect.objectContaining({ tripId, initialTab: 'map', targetUserId: 'member-3' }),
    );
  });
});
