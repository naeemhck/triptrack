import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTrips } from '../../context/TripContext';
import { Trip } from '../../types/trip';
import { colors } from '../../theme/colors';

interface TripHistoryScreenProps {
  navigation: any;
}

export const TripHistoryScreen: React.FC<TripHistoryScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const { trips, loadingTrips } = useTrips();

  // Filter completed trips where user was a member
  const completedTrips = trips.filter((t) => t.status === 'completed');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip History 📜</Text>
          <View style={{ width: 60 }} />
        </View>

        <Text style={styles.subtitle}>
          Read-only history of completed trips you participated in
        </Text>

        {loadingTrips ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : completedTrips.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🏁</Text>
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
                      <Text style={styles.completedBadgeText}>Completed 🏁</Text>
                    </View>
                  </View>

                  <Text style={styles.tripDates}>
                    📅 {item.startDate} — {item.endDate}
                  </Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.memberTag}>
                      👥 {memberCount} Member{memberCount === 1 ? '' : 's'} {isOrganizer ? '• Organizer' : ''}
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
    borderRadius: 14,
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
    borderRadius: 16,
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
