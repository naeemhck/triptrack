import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { TripProvider, useTrips } from '../context/TripContext';
import { AuthNavigator } from './AuthNavigator';
import { TripNavigator } from './TripNavigator';
import { colors } from '../theme/colors';
import { letterSpacing, radius, spacing } from '../theme';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { FadeInView } from '../components/ui/FadeInView';
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
        <FadeInView style={styles.loadingLockup}>
          <View style={styles.logoBadge}>
            <Ionicons name="navigate" size={34} color={colors.primaryLight} />
          </View>
          <Text style={styles.logoWord}>TripTrack</Text>
        </FadeInView>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.lg }} />
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
  loadingLockup: { alignItems: 'center', gap: spacing.md },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    backgroundColor: colors.tintPrimary,
    borderColor: colors.borderActive,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWord: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: letterSpacing.tight,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.md,
  },
});
