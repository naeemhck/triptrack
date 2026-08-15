import React from 'react';
import { StyleSheet, Text, View, Image, FlatList, TouchableOpacity } from 'react-native';
import { TimelineEvent } from '../../utils/timelineBuilder';
import { colors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

interface TripTimelineListProps {
  events: TimelineEvent[];
  onSelectEvent?: (event: TimelineEvent) => void;
}

export const TripTimelineList: React.FC<TripTimelineListProps> = ({ events, onSelectEvent }) => {
  if (!events || events.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="time-outline" size={30} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No Timeline Events Yet</Text>
        <Text style={styles.emptySub}>Events will appear chronologically as stops are marked.</Text>
      </View>
    );
  }

  const renderItem = ({ item, index }: { item: TimelineEvent; index: number }) => {
    const isLast = index === events.length - 1;
    const dateObj = new Date(item.timestamp);
    const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let icon: React.ComponentProps<typeof Ionicons>['name'] = 'pin-outline';
    let dotColor = colors.primary;

    if (item.type === 'trip_started') {
      icon = 'play-outline';
      dotColor = colors.success;
    } else if (item.type === 'trip_completed') {
      icon = 'checkmark-done-outline';
      dotColor = colors.secondary;
    } else if (item.type === 'stop_departure') {
      icon = 'arrow-forward-outline';
      dotColor = '#3B82F6';
    } else if (item.type === 'stop_arrival') {
      icon = item.badge?.includes('Automatic') ? 'timer-outline' : 'flag-outline';
      dotColor = colors.warning;
    }

    return (
      <TouchableOpacity
        style={styles.timelineRow}
        onPress={() => onSelectEvent && onSelectEvent(item)}
        activeOpacity={item.stop ? 0.7 : 1}
      >
        {/* Left Column: Timestamp */}
        <View style={styles.timeColumn}>
          <Text style={styles.timeText}>{timeStr}</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        {/* Center Line & Node Indicator */}
        <View style={styles.lineColumn}>
          <View style={[styles.nodeDot, { backgroundColor: dotColor }]}>
            <Ionicons name={icon} size={13} color="#FFF" />
          </View>
          {!isLast ? <View style={styles.verticalLine} /> : null}
        </View>

        {/* Right Column: Event Content Card */}
        <View style={styles.contentCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
            {item.badge ? (
              <View style={styles.badgePill}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            ) : null}
          </View>

          {item.subtitle ? <Text style={styles.eventSubtitle}>{item.subtitle}</Text> : null}
          {item.note ? <Text style={styles.eventNote}>{item.note}</Text> : null}

          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.eventPhoto} />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeaderTitle}>Trip Timeline</Text>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEnabled={false}
        contentContainerStyle={styles.listPadding}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 14,
  },
  listPadding: {
    paddingBottom: 10,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timeColumn: {
    width: 65,
    alignItems: 'flex-end',
    paddingRight: 10,
    paddingTop: 2,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dateText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  lineColumn: {
    width: 30,
    alignItems: 'center',
    position: 'relative',
  },
  nodeDot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  nodeIcon: {
    fontSize: 11,
  },
  verticalLine: {
    position: 'absolute',
    top: 24,
    bottom: -16,
    width: 2,
    backgroundColor: colors.border,
    zIndex: 1,
  },
  contentCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    borderColor: colors.border,
    borderWidth: 1,
    marginLeft: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  badgePill: {
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primaryLight,
  },
  eventSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  eventNote: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  eventPhoto: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginTop: 6,
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    marginVertical: 16,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
});
