import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Share,
  Alert,
  Switch,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useTrips } from '../../context/TripContext';
import { TripMapView, TripMapViewRef } from '../../components/map/TripMapView';
import { StopHistoryList } from '../../components/trip/StopHistoryList';
import { BackgroundPermissionModal } from '../../components/location/BackgroundPermissionModal';
import { registerForPushNotificationsAsync } from '../../services/notifications';
import {
  checkLocationPermissionsStatus,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  cleanupActiveTripState,
  PermissionState,
} from '../../services/backgroundLocation';
import { processLocationForStopDetection } from '../../services/stopDetector';
import { getLocationFreshness } from '../../utils/locationFreshness';
import {
  getOfflineQueue,
  processPendingSyncQueue,
  OfflineSyncItem,
} from '../../services/offlineSyncQueue';
import {
  startTrip,
  endTrip,
  leaveTrip as leaveTripService,
  removeTripMember,
} from '../../services/tripLifecycle';
import { buildTripTimeline } from '../../utils/timelineBuilder';
import { TripTimelineList } from '../../components/trip/TripTimelineList';
import { colors } from '../../theme/colors';
import { Trip, TripMember } from '../../types/trip';
import { MemberLocation, TripStop } from '../../types/location';

interface TripDetailScreenProps {
  route: any;
  navigation: any;
}

export const TripDetailScreen: React.FC<TripDetailScreenProps> = ({ route, navigation }) => {
  const { tripId, highlightStopId, targetLat, targetLng } = route.params || {};
  const { user } = useAuth();
  const {
    trips,
    leaveTrip,
    listenToTripMembers,
    listenToTripLocations,
    listenToTripStops,
    toggleLocationSharing,
    updateMemberLocation,
  } = useTrips();

  const activeTrip: Trip | undefined = trips.find((t) => t.id === tripId);
  const mapRef = useRef<TripMapViewRef | null>(null);

  const [members, setMembers] = useState<TripMember[]>([]);
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [togglingSharing, setTogglingSharing] = useState<boolean>(false);
  const [permState, setPermState] = useState<PermissionState>('denied');
  const [showBgModal, setShowBgModal] = useState<boolean>(false);

  const [tickCount, setTickCount] = useState<number>(0);
  const [pendingQueue, setPendingQueue] = useState<OfflineSyncItem[]>([]);

  const myMemberProfile = members.find((m) => m.uid === user?.uid);
  const isSharingEnabled = myMemberProfile?.sharingEnabled ?? false;

  // Refresh pending offline queue items
  const refreshQueueState = async () => {
    try {
      const queue = await getOfflineQueue();
      setPendingQueue(queue);
    } catch (e) {
      // ignore
    }
  };

  // Screen-level display timer: ticks once per minute for UI freshness recalculations (0 Firestore writes)
  useEffect(() => {
    refreshQueueState();
    const timer = setInterval(() => {
      setTickCount((prev) => prev + 1);
      refreshQueueState();
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Register push notifications post-auth
  useEffect(() => {
    if (user?.uid) {
      registerForPushNotificationsAsync(user.uid);
    }
  }, [user?.uid]);

  // Check OS Location Permission Status on Mount and on App Resume
  useEffect(() => {
    const refreshPermissionState = async () => {
      const state = await checkLocationPermissionsStatus();
      setPermState(state);
      setTickCount((prev) => prev + 1); // Force immediate freshness recalculation on app resume
      refreshQueueState();
      if (user?.uid) {
        processPendingSyncQueue(user.uid);
      }
    };

    refreshPermissionState();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('🔄 [App Resumed] Refreshing OS location permission status & flushing offline queue...');
        refreshPermissionState();
      }
    });

    return () => subscription.remove();
  }, [user?.uid]);

  // Cross-device completion & removal cleanup listener
  useEffect(() => {
    if (!activeTrip || !tripId) return;

    const isCompleted = activeTrip.status === 'completed';
    const isMember = user?.uid && activeTrip.memberIds ? activeTrip.memberIds.includes(user.uid) : true;

    if (isCompleted || !isMember) {
      console.log(`🧹 [Cross-Device Cleanup] Trip ${tripId} status is completed or member removed. Cleaning local state.`);
      cleanupActiveTripState(tripId, user?.uid);
    }
  }, [activeTrip?.status, activeTrip?.memberIds, tripId, user?.uid]);

  // Realtime listeners for Members, Locations, and Stops
  useEffect(() => {
    if (!tripId) return;
    setLoadingData(true);

    const unsubMembers = listenToTripMembers(tripId, (mList) => {
      setMembers(mList);
    });

    const unsubLocations = listenToTripLocations(tripId, (locList) => {
      setLocations(locList);
    });

    const unsubStops = listenToTripStops(tripId, (stopList) => {
      setStops(stopList);
      setLoadingData(false);
    });

    return () => {
      unsubMembers();
      unsubLocations();
      unsubStops();
    };
  }, [tripId]);

  // Handle Foreground Location Watcher (used when sharing is ON & permState is foreground-only or backup)
  useEffect(() => {
    if (!isSharingEnabled || !tripId || !user?.uid) return;

    let locationSubscription: Location.LocationSubscription | null = null;

    const startForegroundWatcher = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          await toggleLocationSharing(tripId, false);
          return;
        }

        const initialLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (initialLoc?.coords) {
          const lat = initialLoc.coords.latitude;
          const lng = initialLoc.coords.longitude;
          const accuracy = initialLoc.coords.accuracy || undefined;
          setUserCoords({ lat, lng });
          await updateMemberLocation(tripId, lat, lng);
          processLocationForStopDetection(tripId, user.uid, user.name || 'Traveler', lat, lng, accuracy);
        }

        // Watch location updates (every 12s or 20m)
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 12000,
            distanceInterval: 20,
          },
          (loc) => {
            const lat = loc.coords.latitude;
            const lng = loc.coords.longitude;
            const accuracy = loc.coords.accuracy || undefined;
            setUserCoords({ lat, lng });
            updateMemberLocation(tripId, lat, lng);
            processLocationForStopDetection(tripId, user.uid, user.name || 'Traveler', lat, lng, accuracy);
          }
        );
      } catch (err) {
        console.error('Error starting foreground watcher:', err);
      }
    };

    startForegroundWatcher();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [isSharingEnabled, tripId, user?.uid]);

  // Handle camera animation when notification brings user to specific stop
  useEffect(() => {
    if (targetLat && targetLng && mapRef.current) {
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
            ]
          );
          setTogglingSharing(false);
          return;
        }

        // Check if background "Always" permission is granted
        const currentPermState = await checkLocationPermissionsStatus();
        setPermState(currentPermState);

        if (currentPermState === 'granted-always') {
          await startBackgroundLocationTracking(tripId, user, activeTrip?.name);
          await toggleLocationSharing(tripId, true);
        } else {
          // Open pre-prompt explanation modal before requesting Always permission
          setShowBgModal(true);
        }
      } else {
        // Turning OFF sharing
        await stopBackgroundLocationTracking();
        await toggleLocationSharing(tripId, false);
      }
    } catch (err) {
      console.error('Error toggling location sharing:', err);
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
        await startBackgroundLocationTracking(tripId, user, activeTrip?.name);
      } else {
        Alert.alert(
          'Always Location Not Granted',
          'Location sharing is enabled while the app is open. To share when your phone is locked, change permission to "Always" in OS Settings.',
          [
            { text: 'OK', style: 'default' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
      await toggleLocationSharing(tripId, true);
    } catch (err) {
      console.error('Error requesting background location permission:', err);
    }
  };

  // Pre-Prompt Modal: User selected "Share Only While App is Open"
  const handleFallbackForeground = async () => {
    setShowBgModal(false);
    if (!tripId) return;

    const updatedState = await checkLocationPermissionsStatus();
    setPermState(updatedState);
    await toggleLocationSharing(tripId, true);
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
      console.error('Error sharing invite code:', err);
    }
  };

  const handleStartTrip = async () => {
    if (!tripId || !user?.uid) return;
    try {
      await startTrip(tripId, user.uid);
      Alert.alert('Trip Started 🚀', 'Your trip is now active! Members can enable location sharing.');
    } catch (err: any) {
      Alert.alert('Cannot Start Trip', err.message || 'You need an internet connection to start this trip.');
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
              Alert.alert('Trip Ended 🏁', 'The trip is now completed.');
            } catch (err: any) {
              Alert.alert('Cannot End Trip', err.message || 'You need an internet connection to end this trip.');
            }
          },
        },
      ]
    );
  };

  const handleLeaveTrip = () => {
    if (!activeTrip || !user?.uid) return;
    const isOrganizer = activeTrip.createdBy === user.uid;

    if (isOrganizer && activeTrip.status === 'active') {
      Alert.alert('Organizer Notice', 'You are the trip organizer. Please end the trip before leaving.');
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
              Alert.alert('Cannot Leave Trip', err.message || 'You need an internet connection to leave this trip.');
            }
          },
        },
      ]
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
      ]
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

  // Merge remote Firestore stops and local pending queue stops by stopId to prevent duplicate markers
  const pendingTripItems = pendingQueue.filter((i) => i.tripId === tripId);
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

  // Determine sharing visual badge & state description
  let sharingTitle = 'Sharing Off ⚪';
  let sharingSub = 'Turn ON to share your live location during the trip.';
  let badgeStyle = styles.badgeOff;

  if (isSharingEnabled) {
    if (permState === 'granted-always') {
      sharingTitle = 'Sharing (Always) 🟢';
      sharingSub = 'Live updates active even when phone is locked or app is backgrounded.';
      badgeStyle = styles.badgeAlways;
    } else {
      sharingTitle = 'Sharing (App Open Only) 🟡';
      sharingSub = 'Live updates active while app is open. Upgrade to "Always" in Settings for background tracking.';
      badgeStyle = styles.badgeForeground;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
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
              <Text style={styles.pendingSyncBannerSub}>Offline changes will sync when connected.</Text>
            </View>
            <TouchableOpacity style={styles.syncRetryBtn} onPress={handleManualSyncRetry}>
              <Text style={styles.syncRetryBtnText}>Retry 🔄</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('TripList')}>
            <Text style={styles.backBtnText}>← My Trips</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveTrip}>
            <Text style={styles.leaveBtnText}>Leave Trip</Text>
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
            📅 {activeTrip.startDate} → {activeTrip.endDate}
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
              Members can view trip details. Live location sharing starts when the organizer taps "Start Trip".
            </Text>
          </View>
        ) : null}

        {/* Completed Trip Read-Only Banner */}
        {activeTrip.status === 'completed' ? (
          <View style={styles.completedNoticeCard}>
            <Text style={styles.completedNoticeTitle}>Trip Completed 🏁</Text>
            <Text style={styles.completedNoticeSub}>
              This trip is now finished. Location sharing is disabled and all details are preserved as a read-only history item.
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
        {activeTrip.status === 'active' && isSharingEnabled && permState === 'granted-foreground-only' ? (
          <TouchableOpacity
            style={styles.settingsNoticeRow}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.settingsNoticeIcon}>⚙️</Text>
            <Text style={styles.settingsNoticeText}>
              Want background updates when locked? Tap to open OS Settings and set location to "Always".
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Interactive Google Map */}
        <View style={styles.mapHeaderRow}>
          <Text style={styles.mapSectionTitle}>
            {activeTrip.status === 'completed' ? 'Historical Trip Map' : 'Live Trip Map'}
          </Text>
          {activeTrip.status === 'active' ? (
            <TouchableOpacity style={styles.markStopHeaderBtn} onPress={() => handleMarkStop()}>
              <Text style={styles.markStopHeaderBtnText}>+ Mark Stop</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TripMapView
          ref={mapRef}
          locations={locations}
          stops={displayStops}
          userLocation={userCoords}
          onMarkStop={(lat, lng) => activeTrip.status === 'active' && handleMarkStop(lat, lng)}
          targetLat={targetLat}
          targetLng={targetLng}
          highlightStopId={highlightStopId}
        />

        {/* Shareable Invite Code Banner */}
        <View style={styles.inviteBanner}>
          <View style={styles.inviteInfo}>
            <Text style={styles.inviteLabel}>TRIP INVITE CODE</Text>
            <Text style={styles.inviteCode}>{activeTrip.inviteCode}</Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite}>
            <Text style={styles.shareBtnText}>📤 Share Code</Text>
          </TouchableOpacity>
        </View>

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
            <Text style={styles.sectionTitle}>
              Trip Members ({members.length})
            </Text>
            <Text style={styles.realtimeTag}>🟢 Realtime Sync</Text>
          </View>

          {loadingData ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.membersList}>
              {members.map((member) => {
                const isMe = member.uid === user?.uid;
                const isHost = member.uid === activeTrip.createdBy;
                const joinedDateStr = new Date(member.joinedAt || Date.now()).toLocaleDateString();

                const memLoc = locations.find((l) => l.uid === member.uid);
                const freshness = getLocationFreshness(
                  memLoc?.updatedAt,
                  member.sharingEnabled !== false,
                  Date.now(),
                  (memLoc as any)?.sampledAt
                );

                let badgeColor = colors.success;
                let badgeText = `🟢 ${freshness.shortLabel}`;

                if (activeTrip.status === 'completed') {
                  badgeColor = colors.textMuted;
                  badgeText = `🏁 Recorded ${freshness.shortLabel}`;
                } else if (freshness.state === 'delayed') {
                  badgeColor = colors.warning;
                  badgeText = `🟡 ${freshness.shortLabel}`;
                } else if (freshness.state === 'stale') {
                  badgeColor = '#94A3B8';
                  badgeText = `⌛ ${freshness.shortLabel}`;
                } else if (freshness.state === 'sharing_off') {
                  badgeColor = colors.textMuted;
                  badgeText = `⚪ ${freshness.shortLabel}`;
                } else if (freshness.state === 'never_shared') {
                  badgeColor = colors.textMuted;
                  badgeText = `⚪ Waiting`;
                }

                return (
                  <View key={member.uid} style={styles.memberCard}>
                    <View style={styles.memberAvatarCircle}>
                      <Text style={styles.memberInitial}>
                        {member.displayName ? member.displayName.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    </View>

                    <View style={styles.memberMeta}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberName}>{member.displayName}</Text>
                        {isMe && <Text style={styles.youBadge}> (You)</Text>}
                        {isHost && <Text style={styles.hostRoleBadge}> • Host</Text>}
                      </View>
                      <Text style={styles.memberJoinedDate}>Joined {joinedDateStr}</Text>
                    </View>

                    <View style={styles.memberActionsColumn}>
                      <View style={[styles.sharingStatusPill, { backgroundColor: `${badgeColor}20` }]}>
                        <Text style={[styles.sharingStatusText, { color: badgeColor }]}>{badgeText}</Text>
                      </View>

                      {isOrganizer && !isMe && activeTrip.status !== 'completed' ? (
                        <TouchableOpacity
                          style={styles.removeMemberBtn}
                          onPress={() => handleRemoveMember(member)}
                        >
                          <Text style={styles.removeMemberBtnText}>Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  leaveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
  },
  leaveBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tripTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    flex: 1,
  },
  hostBadge: {
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  hostBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryLight,
  },
  tripDates: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sharingToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  badgeAlways: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
  },
  badgeForeground: {
    borderColor: colors.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  badgeOff: {
    borderColor: colors.border,
  },
  sharingToggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  sharingToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sharingToggleSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  settingsNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  settingsNoticeIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  settingsNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#FBBF24',
    lineHeight: 16,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 6,
  },
  mapSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  markStopHeaderBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markStopHeaderBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderRadius: 14,
    padding: 16,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 16,
  },
  inviteInfo: {
    flex: 1,
  },
  inviteLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.secondaryLight,
    letterSpacing: 1,
  },
  inviteCode: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 2,
    marginTop: 2,
  },
  shareBtn: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  shareBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  membersSection: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  realtimeTag: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  membersList: {
    gap: 10,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 12,
    borderColor: colors.border,
    borderWidth: 1,
  },
  memberAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  memberMeta: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  youBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryLight,
  },
  hostRoleBadge: {
    fontSize: 12,
    color: colors.secondaryLight,
  },
  memberJoinedDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  sharingStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sharingStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sharingOn: {
    color: colors.success,
  },
  sharingOff: {
    color: colors.textMuted,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  notFoundText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  pendingSyncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  pendingSyncBannerTextGroup: {
    flex: 1,
    marginRight: 10,
  },
  pendingSyncBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
  },
  pendingSyncBannerSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  syncRetryBtn: {
    backgroundColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  syncRetryBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  startTripBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startTripBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  endTripBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  endTripBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  plannedNoticeCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  plannedNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FBBF24',
    marginBottom: 4,
  },
  plannedNoticeSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  completedNoticeCard: {
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  completedNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  completedNoticeSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  memberActionsColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  removeMemberBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  removeMemberBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.danger,
  },
});
