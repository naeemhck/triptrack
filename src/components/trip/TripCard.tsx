import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';
import { Trip } from '../../types/trip';
import { formatTripDateRange } from '../../utils/dateFormat';
import { PressableScale } from '../ui/PressableScale';
import { Chip, statusTone } from '../ui/Chips';

interface TripCardProps {
  trip: Trip;
  currentUserId?: string;
  onPress: (trip: Trip) => void;
}

// One lookup per status instead of parallel icon/color/tint tables.
const statusVisual: Record<
  string,
  {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
    tint: string;
  }
> = {
  active: { icon: 'navigate', color: colors.primaryLight, tint: colors.tintPrimary },
  planned: { icon: 'time-outline', color: colors.warning, tint: colors.tintWarning },
  completed: {
    icon: 'checkmark-done-outline',
    color: colors.textSecondary,
    tint: colors.surfaceLight,
  },
};

export const TripCard = ({ trip, currentUserId, onPress }: TripCardProps) => {
  const status = trip.status || 'active';
  const statusLabel = status[0].toUpperCase() + status.slice(1);
  const visual = statusVisual[status] ?? statusVisual.completed;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open ${trip.name}`}
      style={styles.card}
      onPress={() => onPress(trip)}
      scaleTo={0.98}
    >
      <View style={styles.header}>
        <View style={[styles.iconTile, { backgroundColor: visual.tint }]}>
          <Ionicons name={visual.icon} size={21} color={visual.color} />
        </View>
        <View style={styles.titleBox}>
          <View style={styles.titleLine}>
            <Text style={styles.name} numberOfLines={1}>
              {trip.name}
            </Text>
            <Chip label={statusLabel} tone={statusTone(status)} />
          </View>
          <Text style={styles.dates}>{formatTripDateRange(trip.startDate, trip.endDate)}</Text>
        </View>
        {trip.createdBy === currentUserId ? (
          <View style={styles.hostBadge}>
            <Ionicons name="shield-checkmark-outline" size={11} color={colors.primaryLight} />
            <Text style={styles.hostText}>Host</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.activity} numberOfLines={1}>
        {trip.latestActivity || 'No recorded activity yet'}
      </Text>
      <View style={styles.footer}>
        <View style={styles.codeBadge}>
          <Ionicons name="key-outline" size={13} color={colors.primaryLight} />
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
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: spacing.md + 2,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  titleBox: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
  dates: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.tintPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginLeft: spacing.sm,
  },
  hostText: { fontSize: 11, fontWeight: '800', color: colors.primaryLight },
  activity: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  codeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryLight,
    letterSpacing: letterSpacing.tight,
  },
  members: { flexDirection: 'row', alignItems: 'center' },
  avatars: { flexDirection: 'row', marginRight: spacing.sm },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    marginLeft: -4,
    backgroundColor: colors.primaryDark,
    borderWidth: 1,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primaryLight, fontSize: 10, fontWeight: '800' },
  membersText: { fontSize: 13, color: colors.textSecondary, marginRight: 6 },
});
