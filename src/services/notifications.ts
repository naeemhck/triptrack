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
 * Native FCM push notifications on iOS require an Apple Push Notification (APNs) key (.p8 file)
 * uploaded to your Firebase Console under:
 * Project Settings -> Cloud Messaging -> iOS app configuration.
 */


import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, updateDoc } from 'firebase/firestore';
import { db, isMockFirebase } from '../config/firebase';

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
 * Register device for push notifications and store fcmToken in Firestore users/{uid}
 * 
 * API 31–32 (Android 12/12L): No POST_NOTIFICATIONS permission exists; requestPermissionsAsync()
 * returns 'granted' without showing a system dialog.
 * API 33+ (Android 13+): requestPermissionsAsync() triggers the runtime POST_NOTIFICATIONS dialog.
 */

export const registerForPushNotificationsAsync = async (uid: string): Promise<string | null> => {
  if (isMockFirebase || !Device.isDevice) {
    console.log('[Notification Service] Mock mode or Simulator detected — skipping push token registration.');
    return 'mock-fcm-token-12345';
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notification Service] Push notification permission denied by user.');
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

    // Retrieve token
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    });
    const token = tokenResponse.data;

    console.log('📱 [Notification Service] Device Push Token registered successfully.');

    // Save token to Firestore users/{uid}
    await updateDoc(doc(db, 'users', uid), {
      fcmToken: token,
      lastTokenUpdate: Date.now(),
    });

    return token;
  } catch (error) {
    console.error('[Notification Service] Error registering for push notifications:', error);
    return null;
  }
};

/**
 * Set up notification tap response listener to navigate directly to trip detail & center map on stop
 */
export const setupNotificationResponseListener = (
  navigationRef: any
): (() => void) => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;

    if (data?.tripId) {
      // Route user to TripDetailScreen and pass target stop coordinates
      navigationRef?.navigate('TripDetail', {
        tripId: data.tripId,
        highlightStopId: data.stopId,
        targetLat: data.lat ? parseFloat(String(data.lat)) : undefined,
        targetLng: data.lng ? parseFloat(String(data.lng)) : undefined,
      });
    }
  });

  return () => subscription.remove();
};
