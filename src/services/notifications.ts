/**
 * TripTrack Notification Service (FCM & Expo Notifications)
 *
 * ANDROID NOTIFICATION PERMISSION BEHAVIOR:
 * - API 31–32 (Android 12/12L): The POST_NOTIFICATIONS runtime permission does not exist.
 *   Notifications are permitted by default. Users can disable via OS notification settings.
 * - API 33+ (Android 13+): POST_NOTIFICATIONS is a runtime permission that must be
 *   explicitly requested. expo-notifications requestPermissionsAsync() handles this
 *   automatically; if denied, notifications are silently blocked.
 *
 * NOTIFICATION CHANNELS:
 * Required on all TripTrack-supported versions (channels exist since API 26).
 * TripTrack creates a "default" channel with HIGH importance on first registration.
 *
 * NOTE FOR iOS DEV BUILDS:
 * Expo Push delivery on iOS requires APNs credentials configured through the Expo/EAS project.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../config/supabase';
import { devLog } from '../utils/devLog';

// Configure default notification presentation behavior in-app
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register an Expo push token and store it in Supabase for this user.
 *
 * API 31–32 (Android 12/12L): No POST_NOTIFICATIONS permission exists; requestPermissionsAsync()
 * returns 'granted' without showing a system dialog.
 * API 33+ (Android 13+): requestPermissionsAsync() triggers the runtime POST_NOTIFICATIONS dialog.
 */

export const registerForPushNotificationsAsync = async (_uid: string): Promise<string | null> => {
  if (!Device.isDevice) {
    devLog(
      '[Notification Service] Mock mode or Simulator detected — skipping push token registration.',
    );
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      devLog('[Notification Service] Push notification permission denied by user.');
      return null;
    }

    // Android: Create notification channel for API 26+ (required for all supported versions since minSdk=31)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'TripTrack Notifications',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#14B8A6',
      });
    }

    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId)
      throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID is required for Expo push registration.');
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;

    devLog('📱 [Notification Service] Device Push Token registered successfully.');

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) throw error;

    return token;
  } catch (error) {
    console.error('[Notification Service] Error registering for push notifications:', error);
    return null;
  }
};

export const disablePushTokensForCurrentUser = async (uid: string): Promise<void> => {
  const { error } = await supabase
    .from('push_tokens')
    .update({ enabled: false })
    .eq('user_id', uid);
  if (error) throw error;
};

/**
 * Set up notification tap response listener to navigate directly to trip detail & center map on stop
 */
export const setupNotificationResponseListener = (navigationRef: any): (() => void) => {
  const navigateFromResponse = (response: Notifications.NotificationResponse): boolean => {
    const data = response.notification.request.content.data;
    const tripId = typeof data?.tripId === 'string' ? data.tripId : '';
    const stopId = typeof data?.stopId === 'string' ? data.stopId : undefined;
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    const lagUserId = typeof data?.lagUserId === 'string' ? data.lagUserId : undefined;
    const staleUserId = typeof data?.staleUserId === 'string' ? data.staleUserId : undefined;
    const memberUserId = typeof data?.memberUserId === 'string' ? data.memberUserId : undefined;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(tripId) || (stopId !== undefined && !uuidPattern.test(stopId)))
      return false;

    navigationRef?.navigate('TripDetail', {
      tripId,
      highlightStopId: stopId,
      targetLat: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : undefined,
      targetLng: Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : undefined,
      targetUserId: lagUserId || staleUserId || memberUserId,
      initialTab: memberUserId ? 'members' : 'map',
    });
    return true;
  };

  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response && navigationRef?.isReady?.() && navigateFromResponse(response)) {
        return Notifications.clearLastNotificationResponseAsync();
      }
      return undefined;
    })
    .catch((error) => {
      console.error('[Notification Service] Failed to read initial notification response:', error);
    });

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (navigateFromResponse(response)) {
      void Notifications.clearLastNotificationResponseAsync().catch((error) => {
        console.error('[Notification Service] Failed to clear notification response:', error);
      });
    }
  });

  return () => subscription.remove();
};
