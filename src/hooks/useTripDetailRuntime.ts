import { useEffect, useState } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { registerForPushNotificationsAsync } from '../services/notifications';
import {
  checkLocationPermissionsStatus,
  cleanupActiveTripState,
  isBackgroundTrackingRunning,
  PermissionState,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from '../services/backgroundLocation';
import { processLocationForStopDetection } from '../services/stopDetector';
import {
  enqueueLocation,
  getOfflineQueue,
  OfflineSyncItem,
  processPendingSyncQueue,
} from '../services/offlineSyncQueue';
import { listMemberRouteStatuses, listRoutePoints } from '../services/supabase/routes';
import { subscribeToTripTable } from '../services/supabase/realtime';
import { MemberLocation, TripStop } from '../types/location';
import { MemberRouteStatus, TripRoutePoint } from '../types/route';
import { Trip, TripMember, TripMemberFilter } from '../types/trip';
import { UserProfile } from '../types/auth';
import { devLog } from '../utils/devLog';
import { reportError } from '../utils/errorReporting';

type RealtimeListener<T> = (tripId: string, callback: (items: T[]) => void) => () => void;

interface TripDetailRuntimeOptions {
  activeTrip?: Trip;
  listenToTripLocations: RealtimeListener<MemberLocation>;
  listenToTripMembers: RealtimeListener<TripMember>;
  listenToTripStops: RealtimeListener<TripStop>;
  refreshTrips: () => Promise<void>;
  toggleLocationSharing: (
    tripId: string,
    enabled: boolean,
    mode?: 'always' | 'foreground' | 'off',
  ) => Promise<void>;
  tripId?: string;
  user: UserProfile | null;
}

export const useTripDetailRuntime = ({
  activeTrip,
  listenToTripLocations,
  listenToTripMembers,
  listenToTripStops,
  refreshTrips,
  toggleLocationSharing,
  tripId,
  user,
}: TripDetailRuntimeOptions) => {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [routePoints, setRoutePoints] = useState<TripRoutePoint[]>([]);
  const [routeStatuses, setRouteStatuses] = useState<MemberRouteStatus[]>([]);
  const [memberFilter, setMemberFilter] = useState<TripMemberFilter>('all');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [togglingSharing, setTogglingSharing] = useState<boolean>(false);
  const [permState, setPermState] = useState<PermissionState>('denied');
  const [showBgModal, setShowBgModal] = useState<boolean>(false);

  const [, setTickCount] = useState<number>(0);
  const [pendingQueue, setPendingQueue] = useState<OfflineSyncItem[]>([]);

  const myMemberProfile = members.find((m) => m.uid === user?.uid);
  const isSharingEnabled =
    (myMemberProfile?.sharingEnabled ?? false) &&
    (!myMemberProfile?.sharingExpiresAt || myMemberProfile.sharingExpiresAt > Date.now());

  // Reconcile OS permission changes made in Settings with the native task.
  // Wait for canonical membership data so an empty initial render cannot stop
  // a valid task before Realtime/list reads complete.
  useEffect(() => {
    if (!tripId || !user || !activeTrip || !myMemberProfile || loadingData) return;

    let active = true;
    const reconcileBackgroundTracking = async () => {
      try {
        const running = await isBackgroundTrackingRunning();
        if (!active) return;

        if (activeTrip.status === 'active' && isSharingEnabled && permState === 'granted-always') {
          await startBackgroundLocationTracking(
            tripId,
            user,
            activeTrip.name,
            activeTrip.routeLeaderUserId,
            myMemberProfile.sharingExpiresAt,
          );
        } else if (running) {
          await stopBackgroundLocationTracking();
        }
      } catch (error) {
        reportError(error, { operation: 'tripDetail.reconcileBackgroundTracking' });
        if (active) {
          Alert.alert(
            'Background Location Error',
            'TripTrack could not apply the current location permission. Turn sharing off and on to retry.',
          );
        }
      }
    };

    void reconcileBackgroundTracking();
    return () => {
      active = false;
    };
  }, [activeTrip, isSharingEnabled, loadingData, myMemberProfile, permState, tripId, user]);

  // Refresh pending offline queue items
  const refreshQueueState = async () => {
    try {
      const queue = await getOfflineQueue();
      setPendingQueue(queue);
    } catch {
      // ignore
    }
  };

  // Screen-level display timer: ticks once per minute for UI freshness recalculations (no database writes)
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
        devLog(
          '🔄 [App Resumed] Refreshing OS location permission status & flushing offline queue...',
        );
        refreshPermissionState();
      }
    });

    return () => subscription.remove();
  }, [user?.uid]);

  // Cross-device completion & removal cleanup listener
  useEffect(() => {
    if (!activeTrip || !tripId) return;

    const isCompleted = activeTrip.status === 'completed';
    const isMember =
      user?.uid && activeTrip.memberIds ? activeTrip.memberIds.includes(user.uid) : true;

    if (isCompleted || !isMember) {
      devLog(
        `🧹 [Cross-Device Cleanup] Trip ${tripId} status is completed or member removed. Cleaning local state.`,
      );
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

  useEffect(() => {
    if (!tripId) return;
    let mounted = true;
    const refreshRoute = async () => {
      try {
        const [points, statuses] = await Promise.all([
          listRoutePoints(tripId),
          listMemberRouteStatuses(tripId),
        ]);
        if (__DEV__) console.log('[Route QA Tail]', points.slice(-6));
        if (mounted) {
          setRoutePoints(points);
          setRouteStatuses(statuses);
        }
      } catch {
        if (__DEV__) console.warn('[Route] Unable to refresh canonical route state.');
      }
    };
    void refreshRoute();
    const unsubPoints = subscribeToTripTable(
      'trip_route_points',
      tripId,
      () => void refreshRoute(),
    );
    const unsubRoute = subscribeToTripTable('trip_routes', tripId, () => {
      void refreshTrips();
      void refreshRoute();
    });
    const unsubStatuses = subscribeToTripTable(
      'trip_member_route_status',
      tripId,
      () => void refreshRoute(),
    );
    return () => {
      mounted = false;
      unsubPoints();
      unsubRoute();
      unsubStatuses();
    };
  }, [refreshTrips, tripId]);

  // Handle Foreground Location Watcher (used when sharing is ON & permState is foreground-only or backup)
  useEffect(() => {
    if (!isSharingEnabled || !tripId || !user?.uid) return;

    let locationSubscription: Location.LocationSubscription | null = null;

    const processForegroundSample = async (loc: Location.LocationObject) => {
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const accuracy = loc.coords.accuracy ?? undefined;
      setUserCoords({ lat, lng });
      await enqueueLocation(
        tripId,
        user.uid,
        {
          lat,
          lng,
          accuracy,
          sampledAt: loc.timestamp || Date.now(),
        },
        activeTrip?.routeLeaderUserId === user.uid,
      );
      void processPendingSyncQueue(user.uid);
      await processLocationForStopDetection(
        tripId,
        user.uid,
        user.name || 'Traveler',
        lat,
        lng,
        accuracy,
      );
    };

    const startForegroundWatcher = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          await toggleLocationSharing(tripId, false);
          return;
        }

        let initialLoc: Location.LocationObject | null = null;
        try {
          initialLoc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        } catch (error) {
          if (__DEV__)
            console.warn(
              '[Location] Current position unavailable; trying the last known position.',
              error,
            );
          initialLoc = await Location.getLastKnownPositionAsync();
        }
        if (initialLoc?.coords) {
          try {
            await processForegroundSample(initialLoc);
          } catch {
            if (__DEV__) console.warn('[Location] Unable to queue initial foreground sample.');
          }
        }

        // Watch location updates (every 12s or 20m)
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 12000,
            distanceInterval: 20,
          },
          (loc) => {
            void processForegroundSample(loc).catch(() => {
              if (__DEV__) console.warn('[Location] Unable to queue foreground sample.');
            });
          },
        );
      } catch (err) {
        reportError(err, { operation: 'tripDetail.startForegroundWatcher', severity: 'warning' });
      }
    };

    void startForegroundWatcher();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [activeTrip?.routeLeaderUserId, isSharingEnabled, tripId, user?.uid]);

  return {
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
  };
};
