import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTrips } from '../../context/TripContext';
import { colors } from '../../theme/colors';
import { Trip } from '../../types/trip';
import { formatTripDateRange } from '../../utils/dateFormat';

interface TripListScreenProps {
  navigation: any;
}

export const TripListScreen: React.FC<TripListScreenProps> = ({ navigation }) => {
  const { user, signOutUser, isMockMode } = useAuth();
  const { trips, loadingTrips, pendingInviteCode } = useTrips();

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

  const renderTripCard = ({ item }: { item: Trip }) => {
    const isCreator = item.createdBy === user?.uid;
    const status = item.status || 'active';

    let statusBadge = (
      <View style={styles.activeStatusBadge}>
        <Text style={styles.activeStatusText}>Active</Text>
      </View>
    );
    if (status === 'planned') {
      statusBadge = (
        <View style={styles.plannedStatusBadge}>
          <Text style={styles.plannedStatusText}>Planned</Text>
        </View>
      );
    } else if (status === 'completed') {
      statusBadge = (
        <View style={styles.completedStatusBadge}>
          <Text style={styles.completedStatusText}>Completed</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.tripCard}
        onPress={() => handleSelectTrip(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardIconBox}>
            <Ionicons name="map-outline" size={23} color={colors.link} />
          </View>
          <View style={styles.cardTitleBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.tripName} numberOfLines={1}>
                {item.name}
              </Text>
              {statusBadge}
            </View>
            <Text style={styles.tripDates}>
              {formatTripDateRange(item.startDate, item.endDate)}
            </Text>
          </View>
          {isCreator && (
            <View style={styles.creatorBadge}>
              <Text style={styles.creatorBadgeText}>Host</Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.codeBadge}>
            <Ionicons name="key-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.codeBadgeText}>{item.inviteCode}</Text>
          </View>

          <View style={styles.membersInfo}>
            <Text style={styles.membersText}>
              {item.memberIds?.length || 1} {item.memberIds?.length === 1 ? 'member' : 'members'}
            </Text>
            <Text style={styles.chevron}>→</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.container}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.brandGroup}>
            <View style={styles.logoBadge}>
              <Ionicons name="navigate" size={22} color="#FFF" />
            </View>
            <View>
              <Text style={styles.appName}>TripTrack</Text>
              <Text style={styles.userGreeting}>Welcome, {user?.name || 'Traveler'}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.signOutBtn} onPress={() => void handleSignOut()}>
            <Text style={styles.signOutBtnText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {/* Unhandled Deep Link Notice */}
        {pendingInviteCode ? (
          <TouchableOpacity
            style={styles.pendingInviteBanner}
            onPress={() => navigation.navigate('JoinTrip', { inviteCode: pendingInviteCode })}
          >
            <Text style={styles.pendingInviteIcon}>🎁</Text>
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
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading your trips...</Text>
          </View>
        ) : trips.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <Text style={styles.emptyIcon}>🏕️</Text>
            </View>
            <Text style={styles.emptyTitle}>No Trips Yet</Text>
            <Text style={styles.emptySub}>
              Start a new adventure or join an existing trip using an invite code from your friends.
            </Text>

            <View style={styles.emptyActions}>
              <TouchableOpacity
                style={styles.emptyPrimaryBtn}
                onPress={() => navigation.navigate('CreateTrip')}
              >
                <Text style={styles.emptyPrimaryBtnText}>+ Create a Trip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.emptySecondaryBtn}
                onPress={() => navigation.navigate('JoinTrip')}
              >
                <Text style={styles.emptySecondaryBtnText}>🔑 Join via Invite Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item: Trip) => item.id}
            renderItem={renderTripCard}
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
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderColor: colors.borderActive,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoIcon: {
    fontSize: 20,
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  userGreeting: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  signOutBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  pendingInviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: colors.secondary,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  pendingInviteIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  pendingInviteTitle: {
    fontSize: 13,
    fontWeight: '700',
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
    paddingHorizontal: 10,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
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
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  joinHeaderBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  joinHeaderBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  createHeaderBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createHeaderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  listContent: {
    paddingBottom: 30,
  },
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardIcon: {
    fontSize: 22,
  },
  cardTitleBox: {
    flex: 1,
  },
  tripName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  tripDates: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  creatorBadge: {
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  creatorBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryLight,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  codeBadge: {
    backgroundColor: colors.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryLight,
  },
  membersInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  membersText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginRight: 6,
  },
  chevron: {
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyActions: {
    width: '100%',
    gap: 12,
  },
  emptyPrimaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyPrimaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySecondaryBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
  },
  emptySecondaryBtnText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  activeStatusBadge: {
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primaryLight,
  },
  plannedStatusBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  plannedStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FBBF24',
  },
  completedStatusBadge: {
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  completedStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
  },
});
