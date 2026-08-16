import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { TripMember } from '../../types/trip';
import { MemberRouteStatus } from '../../types/route';
import { LocationFreshnessResult } from '../../utils/locationFreshness';
import { MemberNavigationStatus } from '../../types/navigation';
import { getMemberColor, getMemberInitials } from '../../utils/memberIdentity';

interface Props {
  member: TripMember;
  freshness: LocationFreshnessResult;
  routeStatus?: MemberRouteStatus;
  isMe: boolean;
  isHost: boolean;
  isRouteLeader: boolean;
  completed: boolean;
  canManage: boolean;
  onMakeLeader: () => void;
  onRemove: () => void;
  warningDistanceMeters?: number;
  criticalDistanceMeters?: number;
  stoppedSince?: number;
  navigationStatus?: MemberNavigationStatus;
}

export const MemberRow = ({
  member,
  freshness,
  routeStatus,
  isMe,
  isHost,
  isRouteLeader,
  completed,
  canManage,
  onMakeLeader,
  onRemove,
  warningDistanceMeters = 200,
  criticalDistanceMeters = 500,
  stoppedSince,
  navigationStatus,
}: Props) => {
  const delta = routeStatus?.deltaMeters;
  let accent: string = colors.success;
  let stateLabel = freshness.shortLabel;
  let distanceLabel: string | undefined;
  let icon: React.ComponentProps<typeof Ionicons>['name'] = 'checkmark-circle-outline';
  if (completed) {
    accent = colors.inactive;
    stateLabel = `Recorded ${freshness.shortLabel}`;
    icon = 'archive-outline';
  } else if (isRouteLeader && (freshness.state === 'fresh' || freshness.state === 'delayed')) {
    accent = colors.roleLeader;
    stateLabel = freshness.state === 'fresh' ? 'Active' : freshness.shortLabel;
    icon = 'navigate-outline';
  } else if (isRouteLeader) {
    accent = colors.inactive;
    stateLabel = freshness.shortLabel;
    icon = 'location-outline';
  } else if (routeStatus?.state === 'OFF_ROUTE') {
    accent = colors.offRoute;
    stateLabel = 'Off route';
    icon = 'trail-sign-outline';
  } else if (!routeStatus || routeStatus.state === 'LOCATION_INACTIVE') {
    accent = colors.inactive;
    stateLabel = 'Location inactive';
    icon = 'location-outline';
  } else if (routeStatus.state === 'ROUTE_UNAVAILABLE') {
    accent = colors.inactive;
    stateLabel = 'Route unavailable';
    icon = 'git-branch-outline';
  } else if (delta !== undefined && delta < 0) {
    accent = colors.link;
    stateLabel = 'Ahead of Route Leader';
    distanceLabel = `${Math.round(Math.abs(delta))} m ahead`;
    icon = 'arrow-up-circle-outline';
  } else if (delta !== undefined) {
    distanceLabel = `${Math.round(delta)} m behind`;
    if (delta >= criticalDistanceMeters) {
      accent = colors.critical;
      stateLabel = 'Critical separation';
      icon = 'alert-circle-outline';
    } else if (delta >= warningDistanceMeters) {
      accent = colors.warning;
      stateLabel = 'Warning separation';
      icon = 'warning-outline';
    } else
      stateLabel = stoppedSince
        ? `Stopped ${Math.max(1, Math.round((Date.now() - stoppedSince) / 60000))}m`
        : 'Moving';
  }
  const initials = getMemberInitials(member.displayName);
  return (
    <View style={[styles.row, { borderLeftColor: accent }]}>
      <View style={[styles.avatar, { backgroundColor: getMemberColor(member.uid) }]}>
        {initials ? (
          <Text style={styles.initials}>{initials}</Text>
        ) : (
          <Ionicons name="person" size={20} color="#FFF" />
        )}
        <View style={[styles.stateDot, { backgroundColor: accent }]} />
      </View>
      <View style={styles.main}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {member.displayName || 'Member'}
            {isMe ? ' (You)' : ''}
          </Text>
          {isRouteLeader ? (
            <View style={styles.role}>
              <Ionicons name="navigate" size={11} color={colors.roleLeader} />
              <Text style={styles.roleText}>Route Leader</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.statusLine}>
          <Ionicons name={icon} size={14} color={accent} />
          <Text style={[styles.status, { color: accent }]}>{stateLabel}</Text>
          {isHost && !isRouteLeader ? <Text style={styles.host}>Organizer</Text> : null}
        </View>
        {distanceLabel ? (
          <Text style={[styles.distance, { color: accent }]}>{distanceLabel}</Text>
        ) : null}
        {navigationStatus?.speedTrustworthy && navigationStatus.smoothedSpeedMps != null ? (
          <Text style={styles.navigationDetail}>
            {Math.round(navigationStatus.smoothedSpeedMps * 3.6)} km/h
            {navigationStatus.remainingDistanceMeters != null
              ? ` · ${(navigationStatus.remainingDistanceMeters / 1000).toFixed(1)} km remaining`
              : ''}
            {navigationStatus.estimatedArrivalAt
              ? ` · ETA ${new Date(navigationStatus.estimatedArrivalAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </Text>
        ) : null}
        {canManage ? (
          <View style={styles.actions}>
            {!isRouteLeader ? (
              <TouchableOpacity style={styles.manageButton} onPress={onMakeLeader}>
                <Ionicons name="navigate-outline" size={16} color={colors.link} />
                <Text style={styles.manageText}>Make leader</Text>
              </TouchableOpacity>
            ) : null}
            {!isMe ? (
              <TouchableOpacity style={styles.removeButton} onPress={onRemove}>
                <Ionicons name="person-remove-outline" size={16} color={colors.critical} />
                <Text style={styles.removeText}>Remove member</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: 8,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  stateDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  main: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  role: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(167,139,250,0.14)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleText: { color: colors.roleLeader, fontSize: 10, fontWeight: '800' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  status: { fontSize: 12, fontWeight: '700' },
  host: { color: colors.textSecondary, fontSize: 11, marginLeft: 4 },
  distance: { fontSize: 18, fontWeight: '800', marginTop: 5 },
  navigationDetail: { color: colors.textSecondary, fontSize: 12, marginTop: 5 },
  actions: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  manageButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  manageText: { color: colors.link, fontSize: 13, fontWeight: '700' },
  removeButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  removeText: { color: colors.critical, fontSize: 13, fontWeight: '700' },
});
