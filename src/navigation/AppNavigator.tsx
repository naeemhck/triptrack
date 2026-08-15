import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useAuth } from '../context/AuthContext';
import { TripProvider, useTrips } from '../context/TripContext';
import { AuthNavigator } from './AuthNavigator';
import { TripNavigator } from './TripNavigator';
import { colors } from '../theme/colors';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { setupNotificationResponseListener } from '../services/notifications';

const prefix = Linking.createURL('/');
const navigationRef = createNavigationContainerRef<any>();

const linking = {
  prefixes: [prefix, 'triptrack://', 'https://triptrack.app'],
  config: {
    screens: {
      JoinTrip: 'join/:inviteCode',
      TripDetail: 'trip/:tripId',
      TripList: 'trips',
    },
  },
};

// Deep Link Listener Inner Component
const NavigationContent: React.FC = () => {
  const { user, loading, passwordRecovery } = useAuth();
  const { setPendingInviteCode } = useTrips();

  useEffect(() => {
    // Process deep link URL string to extract invite code
    const parseDeepLink = (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);

      let inviteCode: string | null = null;

      if (parsed.hostname === 'join' && parsed.path) {
        inviteCode = parsed.path.replace(/^\//, '');
      } else if (parsed.path && parsed.path.startsWith('join/')) {
        inviteCode = parsed.path.replace('join/', '');
      }

      const normalizedCode = inviteCode?.toUpperCase() || '';
      if (/^TRIP-[A-Z0-9]{4,12}$/.test(normalizedCode)) {
        setPendingInviteCode(normalizedCode);
      }
    };

    // Check cold start link
    Linking.getInitialURL().then((url) => parseDeepLink(url));

    // Listen for warm start links
    const subscription = Linking.addEventListener('url', (event) => parseDeepLink(event.url));

    return () => subscription.remove();
  }, [setPendingInviteCode]);

  useEffect(() => {
    if (loading || !user) return undefined;
    return setupNotificationResponseListener(navigationRef);
  }, [loading, user]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoIcon}>📍</Text>
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>Initializing TripTrack...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      {passwordRecovery ? <ResetPasswordScreen /> : user ? <TripNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export const AppNavigator: React.FC = () => {
  return (
    <TripProvider>
      <NavigationContent />
    </TripProvider>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderColor: colors.borderActive,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 28,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
});
