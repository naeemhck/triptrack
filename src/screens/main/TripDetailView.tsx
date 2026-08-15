import React from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BackgroundPermissionModal } from '../../components/location/BackgroundPermissionModal';
import { TripMap } from '../../components/map/TripMap';
import { TripMapRef } from '../../components/map/mapTypes';
import { MemberRow } from '../../components/trip/MemberRow';
import { StopHistoryList } from '../../components/trip/StopHistoryList';
import { TripTimelineList } from '../../components/trip/TripTimelineList';
import { PermissionState } from '../../services/backgroundLocation';
import { colors } from '../../theme/colors';
import { MemberLocation, TripStop } from '../../types/location';
import { MemberRouteStatus, TripRoutePoint } from '../../types/route';
import { Trip, TripMember, TripMemberFilter } from '../../types/trip';
import { LocationFreshnessResult } from '../../utils/locationFreshness';
import { formatTripDateRange } from '../../utils/dateFormat';
import { buildTripTimeline } from '../../utils/timelineBuilder';
import { tripDetailStyles as styles } from './TripDetailScreen.styles';

export interface TripMemberRowData {
  member: TripMember;
  freshness: LocationFreshnessResult;
  active: boolean;
  routeStatus?: MemberRouteStatus;
}

interface TripDetailViewProps {
  activeTrip: Trip;
  activeMemberCount: number;
  displayStops: TripStop[];
  handleConfirmAlways: () => void;
  handleEndTrip: () => void;
  handleFallbackForeground: () => void;
  handleLeaveTrip: () => void;
  handleMakeRouteLeader: (member: TripMember) => void;
  handleManualSyncRetry: () => void;
  handleMarkStop: (lat?: number, lng?: number) => void;
  handleRemoveMember: (member: TripMember) => void;
  handleShareInvite: () => void;
  handleStartTrip: () => void;
  handleToggleSharing: (value: boolean) => void;
  highlightStopId?: string;
  isOrganizer: boolean;
  isSharingEnabled: boolean;
  loadingData: boolean;
  locations: MemberLocation[];
  mapRef: React.RefObject<TripMapRef | null>;
  memberFilter: TripMemberFilter;
  memberRows: TripMemberRowData[];
  members: TripMember[];
  navigation: any;
  pendingCount: number;
  permState: PermissionState;
  routePoints: TripRoutePoint[];
  setMemberFilter: React.Dispatch<React.SetStateAction<TripMemberFilter>>;
  showBgModal: boolean;
  targetLat?: number;
  targetLng?: number;
  togglingSharing: boolean;
  tripId: string;
  userCoords: { lat: number; lng: number } | null;
  userId?: string;
}

export const TripDetailView = ({
  activeTrip,
  activeMemberCount,
  displayStops,
  handleConfirmAlways,
  handleEndTrip,
  handleFallbackForeground,
  handleLeaveTrip,
  handleMakeRouteLeader,
  handleManualSyncRetry,
  handleMarkStop,
  handleRemoveMember,
  handleShareInvite,
  handleStartTrip,
  handleToggleSharing,
  highlightStopId,
  isOrganizer,
  isSharingEnabled,
  loadingData,
  locations,
  mapRef,
  memberFilter,
  memberRows,
  members,
  navigation,
  pendingCount,
  permState,
  routePoints,
  setMemberFilter,
  showBgModal,
  targetLat,
  targetLng,
  togglingSharing,
  tripId,
  userCoords,
  userId,
}: TripDetailViewProps) => {
  let sharingTitle = 'Sharing Off';
  let sharingSub = 'Turn ON to share your live location during the trip.';
  let badgeStyle = styles.badgeOff;

  if (isSharingEnabled) {
    if (permState === 'granted-always') {
      sharingTitle = 'Sharing (Always)';
      sharingSub = 'Live updates active even when phone is locked or app is backgrounded.';
      badgeStyle = styles.badgeAlways;
    } else {
      sharingTitle = 'Sharing (App Open Only)';
      sharingSub =
        'Live updates active while app is open. Upgrade to "Always" in Settings for background tracking.';
      badgeStyle = styles.badgeForeground;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Pre-Prompt Background Location Explanation Modal */}
        <BackgroundPermissionModal
          visible={showBgModal}
          onConfirmAlways={handleConfirmAlways}
          onFallbackForeground={handleFallbackForeground}
        />

        {/* Pending Sync Banner */}
        {pendingCount > 0 ? (
          <View style={styles.pendingSyncBanner}>
            <View style={styles.pendingSyncBannerTextGroup}>
              <Text style={styles.pendingSyncBannerTitle}>⌛ Pending Sync ({pendingCount})</Text>
              <Text style={styles.pendingSyncBannerSub}>
                Offline changes will sync when connected.
              </Text>
            </View>
            <TouchableOpacity style={styles.syncRetryBtn} onPress={handleManualSyncRetry}>
              <Text style={styles.syncRetryBtnText}>Retry 🔄</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate('TripList')}
            accessibilityLabel="Back to My Trips"
          >
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>My Trips</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('TripSettings', { tripId })}
            accessibilityLabel="Trip Settings"
          >
            <Ionicons name="settings-outline" size={21} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Main Trip Card Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.tripTitle}>{activeTrip.name}</Text>
            {isOrganizer ? (
              <View style={styles.hostBadge}>
                <Text style={styles.hostBadgeText}>Organizer</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.tripDates}>
            {formatTripDateRange(activeTrip.startDate, activeTrip.endDate)}
          </Text>

          {/* Organizer Lifecycle Actions */}
          {isOrganizer ? (
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
              {activeTrip.status === 'planned' ? (
                <TouchableOpacity style={styles.startTripBtn} onPress={handleStartTrip}>
                  <Text style={styles.startTripBtnText}>Start Trip 🚀</Text>
                </TouchableOpacity>
              ) : null}
              {activeTrip.status === 'active' ? (
                <TouchableOpacity style={styles.endTripBtn} onPress={handleEndTrip}>
                  <Text style={styles.endTripBtnText}>End Trip 🏁</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Planned Trip Notice Banner */}
        {activeTrip.status === 'planned' ? (
          <View style={styles.plannedNoticeCard}>
            <Text style={styles.plannedNoticeTitle}>Trip Planned 📝</Text>
            <Text style={styles.plannedNoticeSub}>
              Members can view trip details. Live location sharing starts when the organizer taps
              "Start Trip".
            </Text>
          </View>
        ) : null}

        {/* Completed Trip Read-Only Banner */}
        {activeTrip.status === 'completed' ? (
          <View style={styles.completedNoticeCard}>
            <Text style={styles.completedNoticeTitle}>Trip Completed 🏁</Text>
            <Text style={styles.completedNoticeSub}>
              This trip is now finished. Location sharing is disabled and all details are preserved
              as a read-only history item.
            </Text>
          </View>
        ) : null}

        {/* Location Sharing Toggle Banner (Active trips only) */}
        {activeTrip.status === 'active' ? (
          <View style={[styles.sharingToggleCard, badgeStyle]}>
            <View style={styles.sharingToggleInfo}>
              <Text style={styles.sharingToggleTitle}>{sharingTitle}</Text>
              <Text style={styles.sharingToggleSub}>{sharingSub}</Text>
            </View>

            {togglingSharing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={isSharingEnabled}
                onValueChange={handleToggleSharing}
                trackColor={{ false: colors.border, true: colors.primaryDark }}
                thumbColor={isSharingEnabled ? colors.primaryLight : '#94A3B8'}
              />
            )}
          </View>
        ) : null}

        {/* Permission Info & OS Settings Link Row */}
        {activeTrip.status === 'active' &&
        isSharingEnabled &&
        permState === 'granted-foreground-only' ? (
          <TouchableOpacity style={styles.settingsNoticeRow} onPress={() => Linking.openSettings()}>
            <Text style={styles.settingsNoticeIcon}>⚙️</Text>
            <Text style={styles.settingsNoticeText}>
              Want background updates when locked? Tap to open OS Settings and set location to
              "Always".
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Provider-neutral trip map */}
        <View style={styles.mapHeaderRow}>
          <Text style={styles.mapSectionTitle}>
            {activeTrip.status === 'completed' ? 'Historical Trip Map' : 'Live Trip Map'}
          </Text>
        </View>

        <TripMap
          ref={mapRef}
          locations={locations}
          stops={displayStops}
          routePoints={routePoints}
          routeLeaderUserId={activeTrip.routeLeaderUserId}
          userLocation={userCoords}
          onMarkStop={(lat, lng) => activeTrip.status === 'active' && handleMarkStop(lat, lng)}
          allowMarkStop={activeTrip.status === 'active'}
          targetLat={targetLat}
          targetLng={targetLng}
          highlightStopId={highlightStopId}
        />

        {/* Shareable Invite Code Banner */}
        {activeTrip.status === 'active' ? (
          <View style={styles.inviteBanner}>
            <View style={styles.inviteInfo}>
              <Text style={styles.inviteLabel}>TRIP INVITE CODE</Text>
              <Text style={styles.inviteCode}>{activeTrip.inviteCode}</Text>
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite}>
              <Ionicons name="share-outline" size={18} color="#FFF" />
              <Text style={styles.shareBtnText}>Share code</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Stop History List Component */}
        <StopHistoryList
          stops={displayStops}
          onSelectStop={(stop) => {
            mapRef.current?.animateToLocation(stop.lat, stop.lng);
          }}
        />

        {/* Trip Chronological Timeline Component */}
        <TripTimelineList
          events={buildTripTimeline(activeTrip, displayStops)}
          onSelectEvent={(event) => {
            if (event.stop) {
              mapRef.current?.animateToLocation(event.stop.lat, event.stop.lng);
            }
          }}
        />

        {/* Member List Section */}
        <View style={styles.membersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trip Members ({members.length})</Text>
            <Text style={styles.realtimeTag}>Realtime sync</Text>
          </View>

          <View style={styles.memberFilters}>
            {(['all', 'active', 'inactive'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.memberFilter,
                  memberFilter === filter && styles.memberFilterSelected,
                ]}
                onPress={() => setMemberFilter(filter)}
              >
                <Text
                  style={[
                    styles.memberFilterText,
                    memberFilter === filter && styles.memberFilterTextSelected,
                  ]}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}{' '}
                  {filter === 'all'
                    ? members.length
                    : filter === 'active'
                      ? activeMemberCount
                      : members.length - activeMemberCount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadingData ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.membersList}>
              {memberRows.map(({ member, freshness, routeStatus }) => {
                const isMe = member.uid === userId;
                const isHost = member.uid === activeTrip.createdBy;
                return (
                  <MemberRow
                    key={member.uid}
                    member={member}
                    freshness={freshness}
                    routeStatus={routeStatus}
                    isMe={isMe}
                    isHost={isHost}
                    isRouteLeader={member.uid === activeTrip.routeLeaderUserId}
                    completed={activeTrip.status === 'completed'}
                    canManage={isOrganizer && activeTrip.status !== 'completed'}
                    onMakeLeader={() => handleMakeRouteLeader(member)}
                    onRemove={() => handleRemoveMember(member)}
                  />
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.tripActionsSection}>
          <Text style={styles.tripActionsTitle}>Trip actions</Text>
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveTrip}>
            <Ionicons name="exit-outline" size={19} color={colors.critical} />
            <Text style={styles.leaveBtnText}>Leave trip</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
