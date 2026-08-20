import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TripMap } from '../../components/map/TripMap';
import { TripMapRef } from '../../components/map/mapTypes';
import { TripActivityList } from '../../components/trip/TripActivityList';
import { BackgroundPermissionModal } from '../../components/location/BackgroundPermissionModal';
import { MemberRow } from '../../components/trip/MemberRow';
import { colors } from '../../theme/colors';
import { MemberLocation, TripStop } from '../../types/location';
import { TripRoutePoint } from '../../types/route';
import { Trip, TripAlertEvent, TripStatistics } from '../../types/trip';
import { MemberNavigationStatus, PlannedRoute } from '../../types/navigation';
import { TripMemberRowData } from './TripDetailView';
import { TripSettingsScreen } from './TripSettingsScreen';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';

export type WorkspaceTab = 'map' | 'activity' | 'members' | 'alerts' | 'settings';

interface Props {
  trip: Trip;
  tripId: string;
  userId?: string;
  navigation: any;
  locations: MemberLocation[];
  stops: TripStop[];
  routePoints: TripRoutePoint[];
  plannedRoute: PlannedRoute | null;
  navigationStatuses: MemberNavigationStatus[];
  memberRows: TripMemberRowData[];
  activeMemberCount: number;
  pendingCount: number;
  loadingData: boolean;
  showBackgroundPermissionModal: boolean;
  isSharingEnabled: boolean;
  sharingExpiresAt?: number;
  togglingSharing: boolean;
  isOrganizer: boolean;
  mapRef: React.RefObject<TripMapRef | null>;
  userCoords: { lat: number; lng: number } | null;
  targetLat?: number;
  targetLng?: number;
  highlightStopId?: string;
  initialTab?: WorkspaceTab;
  alertEvents: TripAlertEvent[];
  statistics?: TripStatistics;
  onToggleSharing: (enabled: boolean) => void;
  onConfirmAlways: () => void;
  onFallbackForeground: () => void;
  onRetrySync: () => void;
  onTimedSharing: () => void;
  onMarkStop: (lat?: number, lng?: number) => void;
  onReviewStop: (stop: TripStop, action: 'confirm' | 'delete') => Promise<void>;
  onSelectStop: (stop: TripStop) => void;
  onMakeLeader: (member: TripMemberRowData['member']) => void;
  onRemoveMember: (member: TripMemberRowData['member']) => void;
  onLeaveTrip: () => void;
  onStartTrip: () => void;
  onEndTrip: () => void;
}

const tabs: {
  key: WorkspaceTab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'map', label: 'Map', icon: 'map-outline' },
  { key: 'activity', label: 'Activity', icon: 'time-outline' },
  { key: 'members', label: 'Members', icon: 'people-outline' },
  { key: 'alerts', label: 'Alerts', icon: 'notifications-outline' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline' },
];

const durationLabel = (seconds = 0) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const TripWorkspaceView = (props: Props) => {
  const [tab, setTab] = useState<WorkspaceTab>(props.initialTab || 'map');
  const warningDistance = props.trip.warningDistanceMeters ?? 200;
  const criticalDistance = props.trip.criticalDistanceMeters ?? 500;
  const elapsed =
    props.statistics?.elapsedSeconds ||
    (props.trip.startedAt ? Math.max(0, (Date.now() - props.trip.startedAt) / 1000) : 0);
  const inviteLink = `triptrack://join/${props.trip.inviteCode}`;
  const myNavigation = props.navigationStatuses.find((item) => item.userId === props.userId);
  const leaderNavigation = props.navigationStatuses.find(
    (item) => item.userId === props.trip.routeLeaderUserId,
  );
  const nextStep = props.plannedRoute?.steps.find(
    (item) => item.sequence === myNavigation?.nextStepSequence,
  );
  const trustedSpeeds = props.navigationStatuses
    .filter((item) => item.speedTrustworthy && item.smoothedSpeedMps != null)
    .map((item) => item.smoothedSpeedMps as number);
  const groupAverageSpeed = trustedSpeeds.length
    ? trustedSpeeds.reduce((total, speed) => total + speed, 0) / trustedSpeeds.length
    : undefined;
  const guidance = props.navigationStatuses.some(
    (item) => item.rerouteSuggested || item.state === 'OFF_ROUTE',
  )
    ? 'Regroup'
    : props.navigationStatuses.some(
          (item) => item.fallingBehindPredicted || item.speedDifferenceWarning,
        )
      ? 'Ease pace'
      : 'Hold pace';

  const content = () => {
    if (tab === 'map')
      return (
        <View style={styles.mapScreen}>
          <TripMap
            ref={props.mapRef}
            fillParent
            locations={props.locations}
            stops={props.stops}
            routePoints={props.routePoints}
            routeLeaderUserId={props.trip.routeLeaderUserId}
            plannedRoute={props.plannedRoute}
            navigationStatuses={props.navigationStatuses}
            userLocation={props.userCoords}
            onMarkStop={props.onMarkStop}
            allowMarkStop={props.trip.status === 'active'}
            targetLat={props.targetLat}
            targetLng={props.targetLng}
            highlightStopId={props.highlightStopId}
          />
          <View style={styles.mapTopOverlay} pointerEvents="box-none">
            {props.pendingCount ? (
              <TouchableOpacity style={styles.mapChip} onPress={props.onRetrySync}>
                <Text style={styles.pending}>
                  {props.pendingCount} stop update{props.pendingCount === 1 ? '' : 's'} waiting to
                  sync · Tap to retry
                </Text>
              </TouchableOpacity>
            ) : null}
            {props.loadingData ? <ActivityIndicator color={colors.primary} /> : null}
            {props.trip.status === 'planned' ? (
              <View style={styles.plannedCard}>
                <View style={styles.flex}>
                  <Text style={styles.plannedTitle}>Trip Planned 📝</Text>
                  <Text style={styles.sub}>
                    {props.trip.routeLeaderUserId
                      ? `Leader: ${props.memberRows.find((r) => r.member.uid === props.trip.routeLeaderUserId)?.member.displayName || 'Assigned'}`
                      : 'No Route Leader assigned yet.'}
                  </Text>
                  <Text style={styles.sub}>
                    Live location sharing starts when the trip is started.
                  </Text>
                </View>
                {props.isOrganizer ? (
                  <TouchableOpacity style={styles.startTripButton} onPress={props.onStartTrip}>
                    <Ionicons name="play" size={18} color="#FFF" />
                    <Text style={styles.primaryText}>Start Trip 🚀</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {props.trip.status === 'active' ? (
              <View style={styles.sharingCard}>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>
                    {props.isSharingEnabled ? 'Location sharing on' : 'Location sharing off'}
                  </Text>
                  <Text style={styles.sub}>
                    {props.sharingExpiresAt
                      ? `Ends ${new Date(props.sharingExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Choose indefinite or timed sharing.'}
                  </Text>
                </View>
                {props.togglingSharing ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Switch value={props.isSharingEnabled} onValueChange={props.onToggleSharing} />
                )}
              </View>
            ) : null}
            {props.trip.status === 'active' && props.isSharingEnabled ? (
              <TouchableOpacity style={styles.mapChip} onPress={props.onTimedSharing}>
                <Ionicons name="timer-outline" size={16} color={colors.primaryLight} />
                <Text style={styles.secondaryText}>Share for 2 hours</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.mapBottomOverlay} pointerEvents="box-none">
            {props.plannedRoute ? (
              <View style={styles.navigationCard}>
                <View style={styles.navigationHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.navigationEyebrow}>NAVIGATION · {guidance}</Text>
                    <Text style={styles.navigationTitle} numberOfLines={2}>
                      {nextStep?.instruction ||
                        `Continue to ${props.plannedRoute.destination.title}`}
                    </Text>
                    <Text style={styles.sub}>
                      {myNavigation?.remainingDistanceMeters != null
                        ? `${(myNavigation.remainingDistanceMeters / 1000).toFixed(1)} km remaining`
                        : `${(props.plannedRoute.distanceMeters / 1000).toFixed(1)} km planned`}
                      {nextStep
                        ? ` · next in ${Math.max(0, Math.round(nextStep.progressMeters - (myNavigation?.progressMeters || 0)))} m`
                        : ''}
                    </Text>
                  </View>
                  <Ionicons name="navigate" size={30} color={colors.link} />
                </View>
                <View style={styles.navigationStats}>
                  <Text style={styles.navigationMetric}>
                    Leader{' '}
                    {leaderNavigation?.speedTrustworthy && leaderNavigation.smoothedSpeedMps != null
                      ? `${Math.round(leaderNavigation.smoothedSpeedMps * 3.6)} km/h`
                      : '--'}
                  </Text>
                  <Text style={styles.navigationMetric}>
                    Group{' '}
                    {groupAverageSpeed != null
                      ? `${Math.round(groupAverageSpeed * 3.6)} km/h`
                      : '--'}
                  </Text>
                  <Text style={styles.navigationMetric}>
                    Actual {((props.statistics?.routeDistanceMeters || 0) / 1000).toFixed(1)} km
                  </Text>
                </View>
              </View>
            ) : props.isOrganizer && props.trip.status !== 'completed' ? (
              <Text style={styles.empty}>
                No planned route. Actual trip tracking continues normally.
              </Text>
            ) : null}
            {props.isOrganizer && props.trip.status !== 'completed' ? (
              <TouchableOpacity
                style={styles.routePlannerButton}
                onPress={() => props.navigation.navigate('RoutePlanner', { tripId: props.tripId })}
              >
                <Ionicons name="git-branch-outline" size={18} color="#FFF" />
                <Text style={styles.primaryText}>
                  {props.plannedRoute ? 'Edit or reroute' : 'Plan route'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    if (tab === 'activity')
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.stats}>
            <Stat
              label="Distance"
              value={`${((props.statistics?.routeDistanceMeters || 0) / 1000).toFixed(1)} km`}
            />
            <Stat label="Elapsed" value={durationLabel(elapsed)} />
            <Stat label="Stopped" value={durationLabel(props.statistics?.stoppedSeconds)} />
            <Stat label="Stops" value={String(props.stops.length)} />
          </View>
          {props.pendingCount ? (
            <TouchableOpacity onPress={props.onRetrySync}>
              <Text style={styles.pending}>
                {props.pendingCount} stop update{props.pendingCount === 1 ? '' : 's'} waiting to
                sync · Tap to retry
              </Text>
            </TouchableOpacity>
          ) : null}
          {props.trip.status === 'active' ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => props.onMarkStop()}>
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.primaryText}>Mark stop</Text>
            </TouchableOpacity>
          ) : null}
          <TripActivityList
            stops={props.stops}
            isOrganizer={props.isOrganizer}
            onSelect={(stop) => {
              props.onSelectStop(stop);
              setTab('map');
            }}
            onReview={props.onReviewStop}
          />
        </ScrollView>
      );
    if (tab === 'members')
      return (
        <ScrollView contentContainerStyle={styles.content}>
          {props.trip.status === 'planned' ? (
            <View style={styles.plannedBanner}>
              <Ionicons name="information-circle-outline" size={20} color={colors.link} />
              <Text style={styles.plannedBannerText}>
                {props.isOrganizer
                  ? 'Assign a Route Leader or manage members below before starting the trip.'
                  : 'Trip planned. The organizer can designate the Route Leader before start.'}
              </Text>
            </View>
          ) : null}
          <Text style={styles.sectionTitle}>
            {props.activeMemberCount} active · {props.memberRows.length} members
          </Text>
          <View style={styles.qr}>
            <QRCode
              value={inviteLink}
              size={116}
              backgroundColor={colors.surface}
              color={colors.textPrimary}
            />
            <Text style={styles.sectionTitle}>{props.trip.inviteCode}</Text>
            <Text style={styles.sub}>Scan to join this trip</Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => void Clipboard.setStringAsync(props.trip.inviteCode)}
            >
              <Ionicons name="copy-outline" size={16} color={colors.link} />
              <Text style={styles.secondaryText}>Copy code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.invite}
              onPress={() =>
                void Share.share({
                  title: `Join ${props.trip.name}`,
                  message: `Join ${props.trip.name} with code ${props.trip.inviteCode}\n${inviteLink}`,
                })
              }
            >
              <Ionicons name="share-social-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.secondaryText}>Share invite</Text>
            </TouchableOpacity>
          </View>
          {props.memberRows.map(({ member, freshness, routeStatus }) => (
            <MemberRow
              key={member.uid}
              member={member}
              freshness={freshness}
              routeStatus={routeStatus}
              navigationStatus={props.navigationStatuses.find((item) => item.userId === member.uid)}
              isMe={member.uid === props.userId}
              isHost={member.uid === props.trip.createdBy}
              isRouteLeader={member.uid === props.trip.routeLeaderUserId}
              completed={props.trip.status === 'completed'}
              canManage={props.isOrganizer && props.trip.status !== 'completed'}
              warningDistanceMeters={warningDistance}
              criticalDistanceMeters={criticalDistance}
              stoppedSince={
                props.stops.find(
                  (stop) => stop.uid === member.uid && stop.autoDetected && !stop.departedAt,
                )?.createdAt
              }
              onMakeLeader={() => props.onMakeLeader(member)}
              onRemove={() => props.onRemoveMember(member)}
            />
          ))}
          <TouchableOpacity style={styles.leave} onPress={props.onLeaveTrip}>
            <Text style={styles.leaveText}>Leave trip</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    if (tab === 'alerts')
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Live status</Text>
          {props.navigationStatuses
            .filter(
              (status) =>
                status.fallingBehindPredicted ||
                status.speedDifferenceWarning ||
                status.rerouteSuggested,
            )
            .map((status) => (
              <TouchableOpacity
                key={`navigation_${status.userId}`}
                style={styles.alertRow}
                onPress={() => setTab('map')}
              >
                <Ionicons
                  name={status.rerouteSuggested ? 'git-branch-outline' : 'speedometer-outline'}
                  size={20}
                  color={status.rerouteSuggested ? colors.critical : colors.warning}
                />
                <View style={styles.flex}>
                  <Text style={styles.alertTitle}>
                    {props.memberRows.find((row) => row.member.uid === status.userId)?.member
                      .displayName || 'Member'}
                  </Text>
                  <Text style={styles.sub}>
                    {status.rerouteSuggested
                      ? 'Route deviation requires organizer review'
                      : status.fallingBehindPredicted
                        ? 'Warning separation predicted within 2 minutes'
                        : 'Sustained speed difference'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          {props.memberRows
            .filter((row) => row.routeStatus?.deltaMeters || row.freshness.state !== 'fresh')
            .map(({ member, routeStatus, freshness }) => (
              <TouchableOpacity
                key={member.uid}
                style={styles.alertRow}
                onPress={() => setTab('map')}
              >
                <Ionicons
                  name={
                    routeStatus?.deltaMeters && routeStatus.deltaMeters >= criticalDistance
                      ? 'alert-circle'
                      : 'warning-outline'
                  }
                  size={20}
                  color={
                    routeStatus?.deltaMeters && routeStatus.deltaMeters >= criticalDistance
                      ? colors.critical
                      : colors.warning
                  }
                />
                <View>
                  <Text style={styles.alertTitle}>{member.displayName}</Text>
                  <Text style={styles.sub}>
                    {routeStatus?.deltaMeters != null
                      ? `${Math.round(routeStatus.deltaMeters)} m behind`
                      : freshness.label}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          <Text style={styles.sectionTitle}>Recent alerts</Text>
          {props.alertEvents.length ? (
            props.alertEvents.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.alertRow}
                onPress={() => setTab(event.type.startsWith('member_') ? 'members' : 'map')}
              >
                <Ionicons
                  name={
                    event.type === 'critical'
                      ? 'alert-circle'
                      : event.type === 'stale'
                        ? 'time-outline'
                        : event.type.startsWith('member_')
                          ? 'person-remove-outline'
                          : 'warning-outline'
                  }
                  size={20}
                  color={event.type === 'critical' ? colors.critical : colors.warning}
                />
                <View>
                  <Text style={styles.alertTitle}>{event.displayName}</Text>
                  <Text style={styles.sub}>
                    {event.type.replaceAll('_', ' ')}
                    {event.behindMeters ? ` · ${event.behindMeters} m` : ''} ·{' '}
                    {new Date(event.createdAt).toLocaleString()}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.empty}>No alerts recorded.</Text>
          )}
        </ScrollView>
      );
    return (
      <TripSettingsScreen
        route={{ params: { tripId: props.tripId } }}
        navigation={{ ...props.navigation, goBack: () => setTab('map') }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => props.navigation.navigate('TripList')}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.flex}>
          <View style={styles.titleLine}>
            <Text style={styles.title} numberOfLines={1}>
              {props.trip.name}
            </Text>
            <Text style={[styles.status, props.trip.status === 'active' && styles.active]}>
              {props.trip.status}
            </Text>
          </View>
          <Text style={styles.sub}>
            {props.trip.inviteCode} · {props.memberRows.length} members · {props.stops.length} stops
            · {durationLabel(elapsed)}
          </Text>
        </View>
        {props.isOrganizer && props.trip.status === 'planned' ? (
          <TouchableOpacity onPress={props.onStartTrip}>
            <Ionicons name="play-circle" size={28} color={colors.success} />
          </TouchableOpacity>
        ) : null}
        {props.isOrganizer && props.trip.status === 'active' ? (
          <TouchableOpacity onPress={props.onEndTrip}>
            <Ionicons name="stop-circle" size={28} color={colors.critical} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.body}>{content()}</View>
      <View style={styles.tabBar}>
        {tabs.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.tab}
            onPress={() => setTab(item.key)}
            accessibilityState={{ selected: tab === item.key }}
          >
            <Ionicons
              name={tab === item.key ? (item.icon.replace('-outline', '') as any) : item.icon}
              size={21}
              color={tab === item.key ? colors.primaryLight : colors.textMuted}
            />
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <BackgroundPermissionModal
        visible={props.showBackgroundPermissionModal}
        onConfirmAlways={props.onConfirmAlways}
        onFallbackForeground={props.onFallbackForeground}
      />
    </SafeAreaView>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.sub}>{label}</Text>
  </View>
);
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 14, paddingBottom: 24, gap: 12 },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  status: { color: colors.textMuted, fontSize: 10, textTransform: 'uppercase' },
  active: { color: colors.success },
  sub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  mapScreen: { flex: 1, backgroundColor: colors.background },
  mapTopOverlay: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    gap: 8,
  },
  mapBottomOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    gap: 8,
  },
  mapChip: {
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sharingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  routePlannerButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 24,
    backgroundColor: colors.primaryAction,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 4 },
  pending: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  primaryButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    backgroundColor: colors.primaryAction,
  },
  primaryText: { color: '#FFF', fontWeight: '800' },
  secondaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderActive,
  },
  secondaryText: { color: colors.primaryLight, fontWeight: '700', fontSize: 13 },
  navigationCard: {
    padding: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.link,
    borderRadius: 16,
  },
  navigationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navigationEyebrow: { color: colors.link, fontSize: 10, fontWeight: '800' },
  navigationTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 3 },
  navigationStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  navigationMetric: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  invite: {
    minHeight: 46,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  stats: { flexDirection: 'row', gap: 6 },
  stat: {
    flex: 1,
    minHeight: 62,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
  alertRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alertTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  empty: {
    color: colors.textPrimary,
    textAlign: 'center',
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  leave: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  leaveText: { color: colors.critical, fontWeight: '700' },
  tabBar: {
    height: 64,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabText: { color: colors.textMuted, fontSize: 10 },
  tabTextActive: { color: colors.primaryLight, fontWeight: '800' },
  qr: {
    alignItems: 'center',
    gap: 4,
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  plannedCard: {
    padding: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  plannedTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  startTripButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: colors.success,
  },
  plannedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderActive,
  },
  plannedBannerText: { flex: 1, color: colors.textSecondary, fontSize: 12 },
});
