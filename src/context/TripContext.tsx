import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { MemberLocation, TripStop } from '../types/location';
import { Trip, TripMember, TripPreview } from '../types/trip';
import { listLocations } from '../services/supabase/locations';
import { subscribeToTripTable, RealtimeTripTable } from '../services/supabase/realtime';
import { listStops } from '../services/supabase/stops';
import {
  createTrip as createSupabaseTrip,
  getTripPreview,
  joinTrip,
  listMembers,
  listTrips,
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
  toggleLocationSharing: (
    tripId: string,
    enabled: boolean,
    mode?: 'always' | 'foreground' | 'off',
  ) => Promise<void>;
  listenToTripMembers: (tripId: string, callback: (members: TripMember[]) => void) => () => void;
  listenToTripLocations: (
    tripId: string,
    callback: (locations: MemberLocation[]) => void,
  ) => () => void;
  listenToTripStops: (tripId: string, callback: (stops: TripStop[]) => void) => () => void;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

/**
 * Shared listener body for the trip-scoped realtime tables: fetch the full
 * list once on subscribe, refetch on any table change, stop cleanly on
 * unsubscribe. `active` guards the callback against post-unsubscribe fetches.
 */
const listenToTripTable = <T,>(
  table: RealtimeTripTable,
  fetcher: (tripId: string) => Promise<T[]>,
  tripId: string,
  callback: (items: T[]) => void,
): (() => void) => {
  let active = true;
  const refresh = async () => {
    try {
      const next = await fetcher(tripId);
      if (active) callback(next);
    } catch {
      if (__DEV__) console.warn(`[Realtime] Unable to refresh ${table}.`);
    }
  };
  void refresh();
  const unsubscribe = subscribeToTripTable(table, tripId, () => void refresh());
  return () => {
    active = false;
    unsubscribe();
  };
};

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

  const toggleLocationSharing = async (
    tripId: string,
    enabled: boolean,
    mode?: 'always' | 'foreground' | 'off',
  ) => {
    await setSharing(tripId, enabled, enabled ? mode || 'always' : 'off');
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
        toggleLocationSharing,
        listenToTripMembers: (tripId, callback) =>
          listenToTripTable('trip_members', listMembers, tripId, callback),
        listenToTripLocations: (tripId, callback) =>
          listenToTripTable('trip_locations', listLocations, tripId, callback),
        listenToTripStops: (tripId, callback) =>
          listenToTripTable('trip_stops', listStops, tripId, callback),
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
