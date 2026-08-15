import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TripStop, StopCategory } from '../../types/location';
import { colors } from '../../theme/colors';

const categoryMeta: Record<
  StopCategory,
  { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  general: { label: 'Other', icon: 'flag-outline' },
  lodging: { label: 'Hotel', icon: 'bed-outline' },
  food: { label: 'Food', icon: 'restaurant-outline' },
  viewpoint: { label: 'Viewpoint', icon: 'binoculars-outline' },
  fuel: { label: 'Fuel', icon: 'car-outline' },
};

interface Props {
  stops: TripStop[];
  isOrganizer: boolean;
  onSelect: (stop: TripStop) => void;
  onReview: (stop: TripStop, action: 'confirm' | 'delete') => Promise<void>;
}

export const TripActivityList = ({ stops, isOrganizer, onSelect, onReview }: Props) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!stops.length)
    return <Text style={styles.empty}>Stops and departures will appear here.</Text>;

  return (
    <View style={styles.list}>
      {stops.map((stop) => {
        const open = expanded === stop.id;
        const category = categoryMeta[stop.category || 'general'];
        const duration = stop.departedAt
          ? Math.max(1, Math.round((stop.departedAt - stop.createdAt) / 60000))
          : null;
        return (
          <View key={stop.id} style={styles.row}>
            <TouchableOpacity
              style={styles.summary}
              onPress={() => setExpanded(open ? null : stop.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
            >
              <View style={styles.icon}>
                <Ionicons name={category.icon} size={19} color={colors.primaryLight} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title} numberOfLines={1}>
                  {stop.name}
                </Text>
                <Text style={styles.meta}>
                  {category.label} · {new Date(stop.createdAt).toLocaleString()}
                </Text>
              </View>
              {stop.reviewStatus === 'needs_review' ? (
                <Text style={styles.reviewBadge}>Review</Text>
              ) : null}
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
            {open ? (
              <View style={styles.details}>
                <Text style={styles.detailText}>
                  {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
                </Text>
                <Text style={styles.detailText}>
                  {stop.autoDetected ? 'Automatic' : 'Manual'} · {stop.displayName}
                </Text>
                <Text style={styles.detailText}>
                  {duration ? `Departed after ${duration} min` : 'No departure recorded'}
                </Text>
                {stop.note ? <Text style={styles.note}>{stop.note}</Text> : null}
                {stop.photoUrl ? (
                  <Image source={{ uri: stop.photoUrl }} style={styles.photo} />
                ) : null}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.action} onPress={() => onSelect(stop)}>
                    <Ionicons name="locate-outline" size={17} color={colors.link} />
                    <Text style={styles.actionText}>Show on map</Text>
                  </TouchableOpacity>
                  {isOrganizer && stop.reviewStatus === 'needs_review' ? (
                    <>
                      <TouchableOpacity
                        style={styles.action}
                        onPress={() => void onReview(stop, 'confirm')}
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={17}
                          color={colors.success}
                        />
                        <Text style={styles.actionText}>Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.action}
                        onPress={() =>
                          Alert.alert('Delete automatic stop?', 'This cannot be undone.', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => void onReview(stop, 'delete'),
                            },
                          ])
                        }
                      >
                        <Ionicons name="trash-outline" size={17} color={colors.critical} />
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { gap: 8 },
  empty: { color: colors.textSecondary, textAlign: 'center', paddingVertical: 28 },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  summary: { minHeight: 62, flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  reviewBadge: { color: colors.warning, fontSize: 10, fontWeight: '800' },
  details: { borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 6 },
  detailText: { color: colors.textSecondary, fontSize: 12 },
  note: { color: colors.textPrimary, fontSize: 13, marginTop: 4 },
  photo: { width: '100%', height: 160, borderRadius: 8, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  action: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: colors.link, fontSize: 12, fontWeight: '700' },
});
