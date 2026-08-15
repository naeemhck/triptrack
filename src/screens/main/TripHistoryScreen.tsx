import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTrips } from '../../context/TripContext';
import { colors } from '../../theme/colors';
import { formatTripDateRange } from '../../utils/dateFormat';

interface TripHistoryScreenProps {
  navigation: any;
}

export const TripHistoryScreen: React.FC<TripHistoryScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const { trips, loadingTrips } = useTrips();

  // Filter completed trips where user was a member
  const completedTrips = trips.filter((t) => t.status === 'completed');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip History</Text>
          <View style={{ width: 60 }} />
        </View>

        <Text style={styles.subtitle}>
          {completedTrips.length} completed {completedTrips.length === 1 ? 'trip' : 'trips'} ·
          Read-only history
        </Text>

        {loadingTrips ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : completedTrips.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="archive-outline" size={38} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Completed Trips Yet</Text>
            <Text style={styles.emptySub}>
              When your group trip ends, it will safely appear here as a read-only timeline.
            </Text>
          </View>
        ) : (
          <FlatList
            data={completedTrips}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => {
              const memberCount = item.memberIds ? item.memberIds.length : 1;
              const isOrganizer = item.createdBy === user?.uid;

              return (
                <TouchableOpacity
                  style={styles.tripCard}
                  onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.tripTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedBadgeText}>Completed</Text>
                    </View>
                  </View>

                  <Text style={styles.tripDates}>
                    {formatTripDateRange(item.startDate, item.endDate)}
                  </Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.memberTag}>
                      {memberCount} Member{memberCount === 1 ? '' : 's'}{' '}
                      {isOrganizer ? '· Organizer' : ''}
                    </Text>
                    <Text style={styles.viewHistoryText}>View Timeline & Map →</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  listContainer: {
    paddingBottom: 30,
  },
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    borderColor: colors.border,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tripTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  completedBadge: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tripDates: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  memberTag: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  viewHistoryText: {
    fontSize: 12,
    color: colors.primaryLight,
    fontWeight: '700',
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 30,
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    marginTop: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
});
