import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { Trip } from '../../types/trip';
import { formatTripDateRange } from '../../utils/dateFormat';

interface TripCardProps {
  trip: Trip;
  currentUserId?: string;
  onPress: (trip: Trip) => void;
}

export const TripCard = ({ trip, currentUserId, onPress }: TripCardProps) => {
  const status = trip.status || 'active';
  const statusStyle =
    status === 'planned'
      ? styles.plannedBadge
      : status === 'completed'
        ? styles.completedBadge
        : styles.activeBadge;
  const statusTextStyle =
    status === 'planned'
      ? styles.plannedText
      : status === 'completed'
        ? styles.completedText
        : styles.activeText;
  const statusLabel = status[0].toUpperCase() + status.slice(1);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Open ${trip.name}`}
      style={styles.card}
      onPress={() => onPress(trip)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Ionicons name="map-outline" size={23} color={colors.link} />
        </View>
        <View style={styles.titleBox}>
          <View style={styles.titleLine}>
            <Text style={styles.name} numberOfLines={1}>
              {trip.name}
            </Text>
            <View style={statusStyle}>
              <Text style={statusTextStyle}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.dates}>{formatTripDateRange(trip.startDate, trip.endDate)}</Text>
        </View>
        {trip.createdBy === currentUserId ? (
          <View style={styles.hostBadge}>
            <Text style={styles.hostText}>Host</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <View style={styles.codeBadge}>
          <Ionicons name="key-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.codeText}>{trip.inviteCode}</Text>
        </View>
        <View style={styles.members}>
          <View style={styles.avatars}>
            {(trip.memberNames || []).slice(0, 3).map((name, index) => (
              <View key={`${name}_${index}`} style={styles.avatar}>
                <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.membersText}>
            {trip.memberIds?.length || 1} {trip.memberIds?.length === 1 ? 'member' : 'members'}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
        </View>
      </View>
      <Text style={styles.activity} numberOfLines={1}>
        {trip.latestActivity || 'No recorded activity yet'}
      </Text>
    </TouchableOpacity>
  );
};

const badge = { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 } as const;
const badgeText = { fontSize: 9, fontWeight: '800' as const };
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 14,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  titleBox: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  dates: { fontSize: 12, color: colors.textSecondary },
  hostBadge: {
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hostText: { fontSize: 11, fontWeight: '700', color: colors.primaryLight },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeText: { fontSize: 12, fontWeight: '700', color: colors.primaryLight },
  members: { flexDirection: 'row', alignItems: 'center' },
  avatars: { flexDirection: 'row', marginRight: 5 },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -4,
    backgroundColor: colors.primaryDark,
    borderWidth: 1,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primaryLight, fontSize: 10, fontWeight: '800' },
  activity: { color: colors.textMuted, fontSize: 11, marginTop: 10 },
  membersText: { fontSize: 13, color: colors.textSecondary, marginRight: 6 },
  activeBadge: { ...badge, backgroundColor: 'rgba(20, 184, 166, 0.15)' },
  activeText: { ...badgeText, color: colors.primaryLight },
  plannedBadge: { ...badge, backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  plannedText: { ...badgeText, color: '#FBBF24' },
  completedBadge: { ...badge, backgroundColor: 'rgba(100, 116, 139, 0.15)' },
  completedText: { ...badgeText, color: colors.textSecondary },
});
