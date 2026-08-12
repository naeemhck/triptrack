import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  FlatList,
} from 'react-native';
import { colors } from '../../theme/colors';
import { TripStop } from '../../types/location';

interface StopHistoryListProps {
  stops: TripStop[];
  onSelectStop?: (stop: TripStop) => void;
}

export const StopHistoryList: React.FC<StopHistoryListProps> = ({ stops, onSelectStop }) => {
  if (!stops || stops.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🚩</Text>
        <Text style={styles.emptyTitle}>No Marked Stops Yet</Text>
        <Text style={styles.emptySub}>
          Tap "Mark Stop" on the map to add hotel, cafe, or viewpoint recommendations for your trip.
        </Text>
      </View>
    );
  }

  const renderStopItem = ({ item }: { item: TripStop }) => {
    const isAuto = item.autoDetected || item.type === 'auto';
    const timeStr = new Date(item.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const dateStr = new Date(item.createdAt).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });

    let stayDurationStr = '';
    if (item.departedAt && item.createdAt) {
      const mins = Math.max(1, Math.round((item.departedAt - item.createdAt) / 60000));
      const departedTime = new Date(item.departedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      stayDurationStr = ` • Stayed ${mins}m (Departed ${departedTime})`;
    }

    return (
      <TouchableOpacity
        style={[styles.stopCard, isAuto && styles.autoStopCard]}
        onPress={() => onSelectStop && onSelectStop(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.stopIconBox, isAuto && styles.autoIconBox]}>
          <Text style={styles.stopBadgeIcon}>{isAuto ? '🤖' : '🚩'}</Text>
        </View>

        <View style={styles.stopContent}>
          <View style={styles.stopHeaderRow}>
            <View style={styles.titleRow}>
              <Text style={styles.stopTitle}>{item.name}</Text>
              {isAuto ? (
                <View style={styles.autoBadge}>
                  <Text style={styles.autoBadgeText}>Auto</Text>
                </View>
              ) : null}
              {item.isPendingSync ? (
                <View style={styles.pendingSyncBadge}>
                  <Text style={styles.pendingSyncBadgeText}>Pending sync ⌛</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.stopTime}>{dateStr} • {timeStr}</Text>
          </View>

          {item.note ? <Text style={styles.stopNote}>{item.note}</Text> : null}

          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.stopPhoto} />
          ) : null}

          <Text style={styles.stopCreator}>
            {isAuto ? '🤖 Auto-detected Dwell Stop' : `Marked by ${item.displayName || 'Traveler'}`}
            <Text style={styles.stayText}>{stayDurationStr}</Text>
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Trip Stops ({stops.length})</Text>
      <FlatList
        data={stops}
        keyExtractor={(item) => item.id}
        renderItem={renderStopItem}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  listContent: {
    gap: 12,
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderColor: colors.border,
    borderWidth: 1,
  },
  autoStopCard: {
    borderColor: 'rgba(99, 102, 241, 0.4)',
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
  },
  stopIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  autoIconBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
  },
  stopBadgeIcon: {
    fontSize: 20,
  },
  stopContent: {
    flex: 1,
  },
  stopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  stopTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  autoBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  autoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.secondaryLight,
  },
  pendingSyncBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  pendingSyncBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
  },
  stopTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  stopNote: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  stopPhoto: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 8,
  },
  stopCreator: {
    fontSize: 11,
    color: colors.textMuted,
  },
  stayText: {
    color: colors.primaryLight,
    fontWeight: '600',
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    marginTop: 16,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
});
