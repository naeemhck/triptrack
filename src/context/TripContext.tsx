import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { MemberLocation, TripStop } from '../types/location';
import { Trip, TripMember, TripPreview } from '../types/trip';
import { stopBackgroundLocationTracking } from '../services/backgroundLocation';
import { listLocations, upsertLocation } from '../services/supabase/locations';
import * as Crypto from 'expo-crypto';
import { subscribeToTripTable } from '../services/supabase/realtime';
import { listStops } from '../services/supabase/stops';
import {
  createTrip as createSupabaseTrip,
  getTripPreview,
  joinTrip,
  listMembers,
  listTrips,
  runTripRpc,
  setSharing,
} from '../services/supabase/trips';
import { useAuth } from './AuthContext';

interface TripContextType {
  trips: Trip[];
  loadingTrips: boolean;
  pendingInviteCode: string | null;
  setPendingInviteCode: (code: string | null) => void;
  refreshTrips: () => Promise<void>;
  createTrip: (name: string, startDate: string, endDate: string) => Promise<Trip>;
  getTripPreviewByCode: (code: string) => Promise<TripPreview>;
  joinTripByCode: (code: string) => Promise<Trip>;
  leaveTrip: (tripId: string) => Promise<void>;
  getTripMembers: (tripId: string) => Promise<TripMember[]>;
  listenToTripMembers: (tripId: string, callback: (members: TripMember[]) => void) => () => void;
  updateMemberLocation: (tripId: string, lat: number, lng: number) => Promise<void>;
  toggleLocationSharing: (tripId: string, enabled: boolean) => Promise<void>;
  listenToTripLocations: (
    tripId: string,
    callback: (locations: MemberLocation[]) => void,
  ) => () => void;
  listenToTripStops: (tripId: string, callback: (stops: TripStop[]) => void) => () => void;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const currentUserId = useRef<string | null>(user?.uid || null);
  currentUserId.current = user?.uid || null;

  const refreshTrips = async () => {
    if (!user) {
      setTrips([]);
      setLoadingTrips(false);
      return;
    }
    const expectedUserId = user.uid;
    try {
      const nextTrips = await listTrips();
      if (currentUserId.current === expectedUserId) setTrips(nextTrips);
    } catch (error) {
      console.error('[Trips] Unable to load trips.', error);
    } finally {
      setLoadingTrips(false);
    }
  };

  useEffect(() => {
    setTrips([]);
    setPendingInviteCode(null);
    setLoadingTrips(true);
    void refreshTrips();
  }, [user?.uid]);

  const createTrip = async (name: string, startDate: string, endDate: string) => {
    const trip = await createSupabaseTrip(name, startDate, endDate);
    await refreshTrips();
    return trip;
  };

  const joinTripByCode = async (code: string) => {
    const trip = await joinTrip(code);
    await refreshTrips();
    return trip;
  };

  const leaveTrip = async (tripId: string) => {
    await stopBackgroundLocationTracking();
    await runTripRpc('leave_trip', tripId);
    await refreshTrips();
  };

  const listenToTripMembers = (tripId: string, callback: (members: TripMember[]) => void) => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await listMembers(tripId);
        if (active) callback(next);
      } catch {
        if (__DEV__) console.warn('[Realtime] Unable to refresh trip members.');
      }
    };
    void refresh();
    const unsubscribe = subscribeToTripTable('trip_members', tripId, () => void refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  };

  const updateMemberLocation = async (tripId: string, lat: number, lng: number) => {
    if (!user) throw new Error('Authentication required.');
    await upsertLocation(
      tripId,
      user.uid,
      { lat, lng, accuracy: 50, sampledAt: Date.now() },
      Crypto.randomUUID(),
    );
  };

  const toggleLocationSharing = async (tripId: string, enabled: boolean) => {
    await setSharing(tripId, enabled, enabled ? 'always' : 'off');
  };

  const listenToTripLocations = (
    tripId: string,
    callback: (locations: MemberLocation[]) => void,
  ) => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await listLocations(tripId);
        if (active) callback(next);
      } catch {
        if (__DEV__) console.warn('[Realtime] Unable to refresh trip locations.');
      }
    };
    void refresh();
    const unsubscribe = subscribeToTripTable('trip_locations', tripId, () => void refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  };

  const listenToTripStops = (tripId: string, callback: (stops: TripStop[]) => void) => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await listStops(tripId);
        if (active) callback(next);
      } catch {
        if (__DEV__) console.warn('[Realtime] Unable to refresh trip stops.');
      }
    };
    void refresh();
    const unsubscribe = subscribeToTripTable('trip_stops', tripId, () => void refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  };

  return (
    <TripContext.Provider
      value={{
        trips,
        loadingTrips,
        pendingInviteCode,
        setPendingInviteCode,
        refreshTrips,
        createTrip,
        getTripPreviewByCode: getTripPreview,
        joinTripByCode,
        leaveTrip,
        getTripMembers: listMembers,
        listenToTripMembers,
        updateMemberLocation,
        toggleLocationSharing,
        listenToTripLocations,
        listenToTripStops,
      }}
    >
      {children}
    </TripContext.Provider>
  );
};

export const useTrips = () => {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrips must be used within a TripProvider');
  return context;
};
