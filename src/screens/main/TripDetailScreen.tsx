import React, { useEffect, useRef, useState } from 'react';
import { Text, View, TouchableOpacity, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useTrips } from '../../context/TripContext';
import { TripMapRef } from '../../components/map/mapTypes';
import {
  checkLocationPermissionsStatus,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from '../../services/backgroundLocation';
import { getLocationFreshness } from '../../utils/locationFreshness';
import { processPendingSyncQueue, clearTripQueueForUser } from '../../services/offlineSyncQueue';
import {
  startTrip,
  endTrip,
  leaveTrip as leaveTripService,
  removeTripMember,
} from '../../services/tripLifecycle';
import { Trip, TripAlertEvent, TripMember, TripStatistics } from '../../types/trip';
import { setRouteLeader } from '../../services/supabase/routes';
import { tripDetailStyles as styles } from './TripDetailScreen.styles';
import { TripWorkspaceView, WorkspaceTab } from './TripWorkspaceView';
import { useTripDetailRuntime } from '../../hooks/useTripDetailRuntime';
import { reportError } from '../../utils/errorReporting';
import {
  getTripStatistics,
  listTripAlertEvents,
  setTimedSharing,
} from '../../services/supabase/trips';
import { reviewAutomaticStop } from '../../services/supabase/stops';
import { subscribeToTripTable } from '../../services/supabase/realtime';
import {
  listTripNudges,
  MemberNudgeEvent,
  nudgeMember,
} from '../../services/supabase/memberNudges';
import { rememberActiveTrip } from '../../services/tripWorkspacePersistence';
import { countDurablePendingSync, mergeStopsWithPendingQueue } from '../../utils/tripStopDisplay';

interface TripDetailScreenProps {
  route: any;
  navigation: any;
}

export const TripDetailScreen: React.FC<TripDetailScreenProps> = ({ route, navigation }) => {
  const { tripId, highlightStopId, targetLat, targetLng, targetUserId, initialTab } =
    route.params || {};
  const { user } = useAuth();
  const {
    trips,
    refreshTrips,
    listenToTripMembers,
    listenToTripLocations,
    listenToTripStops,
    toggleLocationSharing,
  } = useTrips();

  const activeTrip: Trip | undefined = trips.find((t) => t.id === tripId);
  const mapRef = useRef<TripMapRef | null>(null);
  const promptedReroute = useRef<string | null>(null);
  const [alertEvents, setAlertEvents] = useState<TripAlertEvent[]>([]);
  const [statistics, setStatistics] = useState<TripStatistics>();
  const [recentNudges, setRecentNudges] = useState<MemberNudgeEvent[]>([]);
  const [nudgingMemberId, setNudgingMemberId] = useState<string | null>(null);
  const isOrganizer = activeTrip?.createdBy === user?.uid;

  useEffect(() => {
    if (tripId && activeTrip?.status === 'active') void rememberActiveTrip(tripId);
  }, [activeTrip?.status, tripId]);

  const {
    isSharingEnabled,
    loadingData,
    locations,
    memberFilter,
    members,
    pendingQueue,
    permState,
    refreshQueueState,
    routePoints,
    routeStatuses,
    plannedRoute,
    navigationStatuses,
    setPermState,
    setShowBgModal,
    setTogglingSharing,
    showBgModal,
    stops,
    togglingSharing,
    userCoords,
  } = useTripDetailRuntime({
    activeTrip,
    listenToTripLocations,
    listenToTripMembers,
    listenToTripStops,
    refreshTrips,
    toggleLocationSharing,
    tripId,
    user,
  });

  useEffect(() => {
    const leaderStatus = navigationStatuses.find(
      (status) => status.userId === activeTrip?.routeLeaderUserId,
    );
    if (
      !isOrganizer ||
      !plannedRoute ||
      !leaderStatus?.rerouteSuggested ||
      promptedReroute.current === plannedRoute.id
    )
      return;
    promptedReroute.current = plannedRoute.id;
    Alert.alert(
      'Route deviation detected',
      'The Route Leader is materially off the planned route. Review a route from the current leader location?',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Review route',
          onPress: () => navigation.navigate('RoutePlanner', { tripId, reroute: true }),
        },
      ],
    );
  }, [
    activeTrip?.routeLeaderUserId,
    isOrganizer,
    navigation,
    navigationStatuses,
    plannedRoute,
    tripId,
  ]);

  useEffect(() => {
    if (!tripId) return;
    let active = true;
    const refreshWorkspaceData = async () => {
      const [nextAlerts, nextStats] = await Promise.all([
        listTripAlertEvents(tripId),
        getTripStatistics(tripId),
      ]);
      if (active) {
        setAlertEvents(nextAlerts);
        setStatistics(nextStats);
      }
    };
    void refreshWorkspaceData().catch((error) =>
      reportError(error, { operation: 'tripWorkspace.refreshSummary', severity: 'warning' }),
    );
    const unsubLag = subscribeToTripTable(
      'lag_alert_events',
      tripId,
      () => void refreshWorkspaceData(),
    );
    const unsubMember = subscribeToTripTable(
      'trip_member_events',
      tripId,
      () => void refreshWorkspaceData(),
    );
    const unsubStale = subscribeToTripTable(
      'stale_alert_episodes',
      tripId,
      () => void refreshWorkspaceData(),
    );
    const unsubStops = subscribeToTripTable(
      'trip_stops',
      tripId,
      () => void refreshWorkspaceData(),
    );
    const refreshNudges = () =>
      listTripNudges(tripId)
        .then(setRecentNudges)
        .catch((error) =>
          reportError(error, { operation: 'tripWorkspace.refreshNudges', severity: 'warning' }),
        );
    void refreshNudges();
    const unsubNudges = subscribeToTripTable(
      'member_nudge_events',
      tripId,
      () => void refreshNudges(),
    );
    return () => {
      active = false;
      unsubLag();
      unsubMember();
      unsubStale();
      unsubStops();
      unsubNudges();
    };
  }, [tripId]);

  // Handle camera animation when notification brings user to specific stop
  useEffect(() => {
    if (targetLat !== undefined && targetLng !== undefined && mapRef.current) {
      mapRef.current.animateToLocation(targetLat, targetLng);
    }
  }, [targetLat, targetLng]);

  useEffect(() => {
    if (!targetUserId || !mapRef.current) return;
    const target = locations.find((location) => location.uid === targetUserId);
    if (target) mapRef.current.animateToLocation(target.lat, target.lng);
  }, [locations, targetUserId]);

  // Toggle Sharing Handler
  const handleToggleSharing = async (value: boolean) => {
    if (!tripId || !user) return;
    setTogglingSharing(true);

    try {
      if (value) {
        // Request foreground permission first
        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted') {
          Alert.alert(
            'Permission Denied',
            'Location permission is required to share your position. Tap "Open OS Settings" to enable location.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open OS Settings', onPress: () => Linking.openSettings() },
            ],
          );
          setTogglingSharing(false);
          return;
        }

        // Check if background "Always" permission is granted
        const currentPermState = await checkLocationPermissionsStatus();
        setPermState(currentPermState);

        if (currentPermState === 'granted-always') {
          await toggleLocationSharing(tripId, true, 'foreground');
          await startBackgroundLocationTracking(
            tripId,
            user,
            activeTrip?.name,
            activeTrip?.routeLeaderUserId,
          );
        } else {
          setShowBgModal(true);
        }
      } else {
        // Turning OFF sharing
        await stopBackgroundLocationTracking();
        await processPendingSyncQueue(user.uid);
        await toggleLocationSharing(tripId, false);
        await clearTripQueueForUser(tripId, user.uid);
      }
    } catch (err) {
      reportError(err, { operation: 'tripDetail.toggleSharing' });
      if (value) {
        try {
          await stopBackgroundLocationTracking();
        } catch {
          /* already reported below */
        }
        try {
          await toggleLocationSharing(tripId, false);
        } catch {
          /* preserve original error */
        }
      }
      Alert.alert(
        'Location Sharing Error',
        'TripTrack could not update sharing. Check your connection and try again.',
      );
    } finally {
      setTogglingSharing(false);
    }
  };

  // Pre-Prompt Modal: User confirmed "Enable Always Access"
  const handleConfirmAlways = async () => {
    setShowBgModal(false);
    if (!tripId || !user) return;

    try {
      const bgRes = await Location.requestBackgroundPermissionsAsync();
      const updatedState = await checkLocationPermissionsStatus();
      setPermState(updatedState);

      if (bgRes.status === 'granted' || updatedState === 'granted-always') {
        await toggleLocationSharing(tripId, true);
        await startBackgroundLocationTracking(
          tripId,
          user,
          activeTrip?.name,
          activeTrip?.routeLeaderUserId,
        );
      } else {
        Alert.alert(
          'Always Location Not Granted',
          'Location sharing is enabled while the app is open. To share when your phone is locked, change permission to "Always" in OS Settings.',
          [
            { text: 'OK', style: 'default' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
      }
      if (bgRes.status !== 'granted' && updatedState !== 'granted-always') {
        await toggleLocationSharing(tripId, true);
      }
    } catch (err) {
      reportError(err, { operation: 'tripDetail.requestBackgroundPermission' });
      try {
        await stopBackgroundLocationTracking();
      } catch {
        /* already reported below */
      }
      try {
        await toggleLocationSharing(tripId, false);
      } catch {
        /* preserve original error */
      }
      Alert.alert(
        'Location Sharing Error',
        'TripTrack could not enable sharing. Check your connection and try again.',
      );
    }
  };

  // Pre-Prompt Modal: User selected "Share Only While App is Open"
  const handleFallbackForeground = async () => {
    setShowBgModal(false);
    if (!tripId) return;

    try {
      const updatedState = await checkLocationPermissionsStatus();
      setPermState(updatedState);
      await toggleLocationSharing(tripId, true, 'foreground');
    } catch {
      Alert.alert(
        'Location Sharing Error',
        'TripTrack could not enable sharing. Check your connection and try again.',
      );
    }
  };

  const handleMarkStop = (lat?: number, lng?: number) => {
    if (!tripId) return;
    navigation.navigate('CreateStop', {
      tripId,
      initialLat: lat || userCoords?.lat || (locations.length ? locations[0].lat : 37.7749),
      initialLng: lng || userCoords?.lng || (locations.length ? locations[0].lng : -122.4194),
    });
  };

  const handleTimedSharing = async () => {
    if (!tripId || !user) return;
    setTogglingSharing(true);
    try {
      const mode = permState === 'granted-always' ? 'always' : 'foreground';
      await setTimedSharing(tripId, mode);
      if (mode === 'always') {
        await startBackgroundLocationTracking(
          tripId,
          user,
          activeTrip?.name,
          activeTrip?.routeLeaderUserId,
          Date.now() + 120 * 60 * 1000,
        );
      }
    } catch (error) {
      reportError(error, { operation: 'tripWorkspace.timedSharing' });
      Alert.alert('Timed sharing not enabled', 'Check your connection and location permission.');
    } finally {
      setTogglingSharing(false);
    }
  };

  const handleStartTrip = async () => {
    if (!tripId || !user?.uid) return;
    try {
      // Route planning uses the Route Leader position as the start location,
      // so location access must exist before the trip can start.
      let permissionState = await checkLocationPermissionsStatus();
      if (permissionState === 'denied') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location access needed',
            'TripTrack needs location access before starting the trip. The planned route starts at the Route Leader position, and members see each other on the map.',
            [
              { text: 'Open settings', onPress: () => Linking.openSettings() },
              { text: 'Cancel', style: 'cancel' },
            ],
          );
          return;
        }
        permissionState = await checkLocationPermissionsStatus();
      }
      setPermState(permissionState);

      if (!activeTrip?.routeLeaderUserId) {
        await setRouteLeader(tripId, user.uid);
      }
      await startTrip(tripId, user.uid);
      await refreshTrips();
      Alert.alert(
        'Trip Started 🚀',
        'Your trip is now active! Members can enable location sharing.',
      );
    } catch (err: any) {
      Alert.alert(
        'Cannot Start Trip',
        err.message || 'You need an internet connection to start this trip.',
      );
    }
  };

  const handleEndTrip = async () => {
    if (!tripId || !user?.uid) return;
    Alert.alert(
      'End Trip?',
      'Ending the trip will complete location tracking for all members and convert this trip into a read-only history item.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Trip',
          style: 'destructive',
          onPress: async () => {
            try {
              await endTrip(tripId, user.uid);
              await refreshTrips();
              Alert.alert('Trip Ended 🏁', 'The trip is now completed.');
            } catch (err: any) {
              Alert.alert(
                'Cannot End Trip',
                err.message || 'You need an internet connection to end this trip.',
              );
            }
          },
        },
      ],
    );
  };

  const handleLeaveTrip = () => {
    if (!activeTrip || !user?.uid) return;
    const isOrganizer = activeTrip.createdBy === user.uid;

    if (isOrganizer && activeTrip.status === 'active') {
      Alert.alert(
        'Organizer Notice',
        'You are the trip organizer. Please end the trip before leaving.',
      );
      return;
    }

    Alert.alert(
      'Leave Trip?',
      `Are you sure you want to leave "${activeTrip.name}"? You will stop sharing location with this group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave Trip',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveTripService(tripId, user.uid);
              navigation.navigate('TripList');
            } catch (err: any) {
              Alert.alert(
                'Cannot Leave Trip',
                err.message || 'You need an internet connection to leave this trip.',
              );
            }
          },
        },
      ],
    );
  };

  const handleNudgeMember = async (targetMember: TripMember) => {
    if (!tripId || !user?.uid || nudgingMemberId) return;
    setNudgingMemberId(targetMember.uid);
    try {
      await nudgeMember(tripId, targetMember.uid);
      setRecentNudges(await listTripNudges(tripId));
    } catch (error: any) {
      Alert.alert(
        'Check-in not sent',
        error?.message || 'The nudge could not be sent. Try again in a few minutes.',
      );
    } finally {
      setNudgingMemberId(null);
    }
  };

  const handleRemoveMember = (targetMember: TripMember) => {
    if (!tripId || !user?.uid) return;
    Alert.alert(
      'Remove Member?',
      `Remove ${targetMember.displayName} from this trip? They will lose access to live updates and trip details.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeTripMember(tripId, user.uid, targetMember.uid);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove member.');
            }
          },
        },
      ],
    );
  };

  if (!activeTrip) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundText}>Trip not found or you have left this trip.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('TripList')}>
            <Text style={styles.backBtnText}>← Back to Trips</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const myMemberProfile = members.find((member) => member.uid === user?.uid);

  const displayStops = mergeStopsWithPendingQueue(stops, pendingQueue, tripId, user?.uid);
  const pendingCount = countDurablePendingSync(pendingQueue, tripId, user?.uid);

  const handleManualSyncRetry = async () => {
    if (user?.uid) {
      await processPendingSyncQueue(user.uid);
      refreshQueueState();
    }
  };

  const handleMakeRouteLeader = (member: TripMember) => {
    Alert.alert(
      'Make Route Leader',
      `Use ${member.displayName} to extend the canonical trip route?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await setRouteLeader(tripId, member.uid);
              await refreshTrips();
            } catch (error: any) {
              Alert.alert(
                'Route Leader Not Changed',
                error?.message || 'The member could not be matched safely to the route.',
              );
            }
          },
        },
      ],
    );
  };

  const allMemberRows = members
    .map((member) => {
      const location = locations.find((item) => item.uid === member.uid);
      const freshness = getLocationFreshness(
        location?.updatedAt,
        member.sharingEnabled !== false,
        Date.now(),
        location?.sampledAt,
      );
      const active = freshness.state === 'fresh' || freshness.state === 'delayed';
      return {
        member,
        freshness,
        active,
        routeStatus: routeStatuses.find((item) => item.userId === member.uid),
      };
    })
    .sort((a, b) => {
      const leaderOrder =
        Number(b.member.uid === activeTrip.routeLeaderUserId) -
        Number(a.member.uid === activeTrip.routeLeaderUserId);
      if (leaderOrder) return leaderOrder;
      const rank = (row: typeof a) =>
        !row.active ? 3 : row.routeStatus?.state === 'OFF_ROUTE' ? 2 : 1;
      const stateOrder = rank(a) - rank(b);
      if (stateOrder) return stateOrder;
      const bucketA = Math.round(Math.max(0, a.routeStatus?.deltaMeters ?? 0) / 25);
      const bucketB = Math.round(Math.max(0, b.routeStatus?.deltaMeters ?? 0) / 25);
      return bucketA - bucketB || a.member.joinedAt - b.member.joinedAt;
    });
  const memberRows = allMemberRows.filter(
    (row) => memberFilter === 'all' || (memberFilter === 'active' ? row.active : !row.active),
  );
  const activeMemberCount = allMemberRows.filter((row) => row.active).length;

  return (
    <TripWorkspaceView
      trip={activeTrip}
      activeMemberCount={activeMemberCount}
      stops={displayStops}
      onEndTrip={handleEndTrip}
      onLeaveTrip={handleLeaveTrip}
      onMakeLeader={handleMakeRouteLeader}
      onMarkStop={handleMarkStop}
      onRemoveMember={handleRemoveMember}
      onNudgeMember={handleNudgeMember}
      recentNudges={recentNudges}
      nudgingMemberId={nudgingMemberId}
      onStartTrip={handleStartTrip}
      onToggleSharing={handleToggleSharing}
      onTimedSharing={handleTimedSharing}
      onReviewStop={async (stop, action) => reviewAutomaticStop(tripId, stop.id, action)}
      onSelectStop={(stop) => mapRef.current?.animateToLocation(stop.lat, stop.lng)}
      highlightStopId={highlightStopId}
      isOrganizer={isOrganizer}
      isSharingEnabled={isSharingEnabled}
      locations={locations}
      mapRef={mapRef}
      memberRows={memberRows}
      navigation={navigation}
      pendingCount={pendingCount}
      loadingData={loadingData}
      showBackgroundPermissionModal={showBgModal}
      onConfirmAlways={handleConfirmAlways}
      onFallbackForeground={handleFallbackForeground}
      onRetrySync={handleManualSyncRetry}
      routePoints={routePoints}
      plannedRoute={plannedRoute}
      navigationStatuses={navigationStatuses}
      targetLat={targetLat}
      targetLng={targetLng}
      togglingSharing={togglingSharing}
      tripId={tripId}
      userCoords={userCoords}
      userId={user?.uid}
      sharingExpiresAt={myMemberProfile?.sharingExpiresAt}
      initialTab={initialTab as WorkspaceTab | undefined}
      alertEvents={alertEvents}
      statistics={statistics}
    />
  );
};
