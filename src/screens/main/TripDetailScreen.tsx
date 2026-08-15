import React, { useEffect, useRef } from 'react';
import { Text, View, TouchableOpacity, Share, Alert, Linking } from 'react-native';
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
import { Trip, TripMember } from '../../types/trip';
import { TripStop } from '../../types/location';
import { setRouteLeader } from '../../services/supabase/routes';
import { tripDetailStyles as styles } from './TripDetailScreen.styles';
import { TripDetailView } from './TripDetailView';
import { useTripDetailRuntime } from '../../hooks/useTripDetailRuntime';
import { reportError } from '../../utils/errorReporting';

interface TripDetailScreenProps {
  route: any;
  navigation: any;
}

export const TripDetailScreen: React.FC<TripDetailScreenProps> = ({ route, navigation }) => {
  const { tripId, highlightStopId, targetLat, targetLng } = route.params || {};
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
    setMemberFilter,
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

  // Handle camera animation when notification brings user to specific stop
  useEffect(() => {
    if (targetLat !== undefined && targetLng !== undefined && mapRef.current) {
      mapRef.current.animateToLocation(targetLat, targetLng);
    }
  }, [targetLat, targetLng]);

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
          await toggleLocationSharing(tripId, true);
          await startBackgroundLocationTracking(
            tripId,
            user,
            activeTrip?.name,
            activeTrip?.routeLeaderUserId,
          );
        } else {
          // Open pre-prompt explanation modal before requesting Always permission
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
      await toggleLocationSharing(tripId, true);
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

  const handleShareInvite = async () => {
    if (!activeTrip) return;
    const deepLink = `triptrack://join/${activeTrip.inviteCode}`;
    const webFallback = `https://triptrack.app/join/${activeTrip.inviteCode}`;

    try {
      await Share.share({
        title: `Join our trip: ${activeTrip.name}`,
        message: `Hey! Join our group trip "${activeTrip.name}" on TripTrack using code: ${activeTrip.inviteCode}\n\nTap to join: ${deepLink}\nOr web fallback: ${webFallback}`,
      });
    } catch (err) {
      reportError(err, { operation: 'tripDetail.shareInvite', severity: 'warning' });
    }
  };

  const handleStartTrip = async () => {
    if (!tripId || !user?.uid) return;
    try {
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

  const isOrganizer = activeTrip.createdBy === user?.uid;

  // Merge remote Supabase stops and local pending queue stops by stopId to prevent duplicate markers
  const pendingTripItems = pendingQueue.filter((i) => i.tripId === tripId && i.uid === user?.uid);
  const pendingStops: TripStop[] = pendingTripItems
    .filter((i) => i.operationType === 'manual_stop' || i.operationType === 'auto_stop')
    .map((i) => ({ ...(i.payload as TripStop), isPendingSync: true }));

  const mergedStopsMap = new Map<string, TripStop>();
  stops.forEach((s) => mergedStopsMap.set(s.id, s));
  pendingStops.forEach((s) => {
    if (!mergedStopsMap.has(s.id)) {
      mergedStopsMap.set(s.id, s);
    }
  });
  const displayStops = Array.from(mergedStopsMap.values());
  const pendingCount = pendingTripItems.length;

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
    <TripDetailView
      activeTrip={activeTrip}
      activeMemberCount={activeMemberCount}
      displayStops={displayStops}
      handleConfirmAlways={handleConfirmAlways}
      handleEndTrip={handleEndTrip}
      handleFallbackForeground={handleFallbackForeground}
      handleLeaveTrip={handleLeaveTrip}
      handleMakeRouteLeader={handleMakeRouteLeader}
      handleManualSyncRetry={handleManualSyncRetry}
      handleMarkStop={handleMarkStop}
      handleRemoveMember={handleRemoveMember}
      handleShareInvite={handleShareInvite}
      handleStartTrip={handleStartTrip}
      handleToggleSharing={handleToggleSharing}
      highlightStopId={highlightStopId}
      isOrganizer={isOrganizer}
      isSharingEnabled={isSharingEnabled}
      loadingData={loadingData}
      locations={locations}
      mapRef={mapRef}
      memberFilter={memberFilter}
      memberRows={memberRows}
      members={members}
      navigation={navigation}
      pendingCount={pendingCount}
      permState={permState}
      routePoints={routePoints}
      setMemberFilter={setMemberFilter}
      showBgModal={showBgModal}
      targetLat={targetLat}
      targetLng={targetLng}
      togglingSharing={togglingSharing}
      tripId={tripId}
      userCoords={userCoords}
      userId={user?.uid}
    />
  );
};
