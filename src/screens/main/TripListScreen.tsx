import React, { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTrips } from '../../context/TripContext';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';
import { Trip } from '../../types/trip';
import { TripCard } from '../../components/trip/TripCard';
import { EmptyState } from '../../components/ui/Feedback';
import { FadeInView } from '../../components/ui/FadeInView';
import { TripCardSkeleton } from '../../components/ui/Skeleton';
import { forgetRememberedTrip, getRememberedTrip } from '../../services/tripWorkspacePersistence';

interface TripListScreenProps {
  navigation: any;
}

export const TripListScreen: React.FC<TripListScreenProps> = ({ navigation }) => {
  const resumeAttempted = useRef(false);
  const { user, signOutUser, isMockMode } = useAuth();
  const { trips, loadingTrips, pendingInviteCode } = useTrips();

  useEffect(() => {
    if (loadingTrips || pendingInviteCode || resumeAttempted.current) return;
    resumeAttempted.current = true;
    void Promise.all([getRememberedTrip(), Linking.getInitialURL()]).then(([tripId, url]) => {
      if (url || !tripId) return;
      const active = trips.find((trip) => trip.id === tripId && trip.status === 'active');
      if (active) {
        navigation.replace('TripDetail', { tripId: active.id, initialTab: 'map' });
      } else {
        void forgetRememberedTrip();
      }
    });
  }, [loadingTrips, navigation, pendingInviteCode, trips]);

  const handleSelectTrip = (trip: Trip) => {
    navigation.navigate('TripDetail', { tripId: trip.id, tripName: trip.name });
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch {
      Alert.alert(
        'Sign Out Failed',
        'TripTrack could not securely sign out. Check your connection and try again.',
      );
    }
  };
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.container}>
        {/* Header Bar */}
        <FadeInView style={styles.header}>
          <View style={styles.brandGroup}>
            <View style={styles.logoBadge}>
              <Ionicons name="navigate" size={21} color={colors.primaryLight} />
            </View>
            <View>
              <Text style={styles.appName}>TripTrack</Text>
              <Text style={styles.userGreeting}>Welcome, {user?.name || 'Traveler'}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.signOutBtn} onPress={() => void handleSignOut()}>
            <Ionicons name="log-out-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.signOutBtnText}>Exit</Text>
          </TouchableOpacity>
        </FadeInView>

        {/* Unhandled Deep Link Notice */}
        {pendingInviteCode ? (
          <TouchableOpacity
            style={styles.pendingInviteBanner}
            onPress={() => navigation.navigate('JoinTrip', { inviteCode: pendingInviteCode })}
          >
            <View style={styles.pendingInviteIconTile}>
              <Ionicons name="gift-outline" size={18} color={colors.secondaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingInviteTitle}>Pending Invite Link Detected</Text>
              <Text style={styles.pendingInviteSub}>Tap to join trip "{pendingInviteCode}"</Text>
            </View>
            <Text style={styles.pendingInviteAction}>Join →</Text>
          </TouchableOpacity>
        ) : null}

        {/* Demo Mode Notice */}
        {isMockMode && (
          <View style={styles.demoNotice}>
            <Text style={styles.demoNoticeText}>⚡ Demo Mode • Realtime trips enabled</Text>
          </View>
        )}

        {/* Action Header Buttons */}
        <View style={styles.actionHeader}>
          <Text style={styles.sectionTitle}>Your Trips</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.joinHeaderBtn}
              onPress={() => navigation.navigate('TripHistory')}
            >
              <Ionicons name="time-outline" size={17} color={colors.textSecondary} />
              <Text style={styles.joinHeaderBtnText}>History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.joinHeaderBtn}
              onPress={() => navigation.navigate('JoinTrip')}
            >
              <Ionicons name="key-outline" size={17} color={colors.textSecondary} />
              <Text style={styles.joinHeaderBtnText}>Join</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.createHeaderBtn}
              onPress={() => navigation.navigate('CreateTrip')}
            >
              <Text style={styles.createHeaderBtnText}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Content Body */}
        {loadingTrips ? (
          <View style={styles.loadingBox}>
            <TripCardSkeleton />
          </View>
        ) : trips.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="compass-outline"
              title="No Trips Yet"
              subtitle="Start a new adventure or join an existing trip using an invite code from your friends."
              actions={[
                { label: '+ Create a Trip', onPress: () => navigation.navigate('CreateTrip') },
                {
                  label: '🔑 Join via Invite Code',
                  onPress: () => navigation.navigate('JoinTrip'),
                  variant: 'secondary',
                },
              ]}
            />
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item: Trip) => item.id}
            renderItem={({ item, index }) => (
              <FadeInView delay={Math.min(index, 5) * 60}>
                <TripCard trip={item} currentUserId={user?.uid} onPress={handleSelectTrip} />
              </FadeInView>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.tintPrimary,
    borderColor: colors.borderActive,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: letterSpacing.tight,
  },
  userGreeting: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  pendingInviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintViolet,
    borderColor: colors.secondary,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  pendingInviteIconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingInviteTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.secondaryLight,
  },
  pendingInviteSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pendingInviteAction: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryLight,
  },
  demoNotice: {
    backgroundColor: colors.badgeDemo,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  demoNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.badgeDemoText,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md + 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  joinHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  joinHeaderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  createHeaderBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  createHeaderBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  loadingBox: {
    flex: 1,
    paddingTop: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xxxl - 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
});
