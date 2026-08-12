import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, isMockFirebase } from '../config/firebase';
import { stopBackgroundLocationTracking } from '../services/backgroundLocation';
import { useAuth } from './AuthContext';
import { Trip, TripMember, TripPreview } from '../types/trip';
import { MemberLocation, TripStop } from '../types/location';

interface TripContextType {
  trips: Trip[];
  loadingTrips: boolean;
  pendingInviteCode: string | null;
  setPendingInviteCode: (code: string | null) => void;
  createTrip: (name: string, startDate: string, endDate: string) => Promise<Trip>;
  getTripPreviewByCode: (code: string) => Promise<TripPreview>;
  joinTripByCode: (code: string) => Promise<Trip>;
  leaveTrip: (tripId: string) => Promise<void>;
  getTripMembers: (tripId: string) => Promise<TripMember[]>;
  listenToTripMembers: (tripId: string, callback: (members: TripMember[]) => void) => () => void;
  updateMemberLocation: (tripId: string, lat: number, lng: number) => Promise<void>;
  toggleLocationSharing: (tripId: string, enabled: boolean) => Promise<void>;
  listenToTripLocations: (tripId: string, callback: (locations: MemberLocation[]) => void) => () => void;
  createTripStop: (
    tripId: string,
    name: string,
    note?: string,
    imageUri?: string,
    lat?: number,
    lng?: number
  ) => Promise<TripStop>;
  listenToTripStops: (tripId: string, callback: (stops: TripStop[]) => void) => () => void;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

// Helper function to generate human-readable short invite code
const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TRIP-${rand}`;
};

// Initial mock trips & locations for instant demonstration
const MOCK_INITIAL_TRIPS: Trip[] = [
  {
    id: 'mock-trip-1',
    name: 'Coastal Highway Roadtrip 🌊',
    startDate: '2026-08-15',
    endDate: '2026-08-20',
    inviteCode: 'TRIP-7X2A',
    memberIds: ['mock-user-1', 'demo-user-1'],
    createdBy: 'demo-user-1',
    createdAt: Date.now() - 86400000 * 2,
  },
];

const MOCK_INITIAL_MEMBERS: Record<string, TripMember[]> = {
  'mock-trip-1': [
    {
      uid: 'demo-user-1',
      displayName: 'Alex River (Host)',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=alex',
      joinedAt: Date.now() - 86400000 * 2,
      sharingEnabled: true,
    },
    {
      uid: 'mock-user-1',
      displayName: 'Taylor Swift',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=taylor',
      joinedAt: Date.now() - 86400000,
      sharingEnabled: true,
    },
  ],
};

const MOCK_INITIAL_LOCATIONS: Record<string, MemberLocation[]> = {
  'mock-trip-1': [
    {
      uid: 'demo-user-1',
      displayName: 'Alex River',
      lat: 37.7749,
      lng: -122.4194,
      updatedAt: Date.now(),
    },
    {
      uid: 'mock-user-1',
      displayName: 'Taylor Swift',
      lat: 37.7833,
      lng: -122.4167,
      updatedAt: Date.now() - 600000, // >5 mins ago (stale example)
    },
  ],
};

const MOCK_INITIAL_STOPS: Record<string, TripStop[]> = {
  'mock-trip-1': [
    {
      id: 'stop-101',
      uid: 'demo-user-1',
      displayName: 'Alex River',
      lat: 37.7785,
      lng: -122.4180,
      name: 'Blue Bottle Cafe ☕',
      note: 'Great cold brew & pastries before hitting the highway!',
      createdAt: Date.now() - 3600000,
    },
  ],
};

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState<boolean>(true);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  // In-memory state for mock mode
  const [localTrips, setLocalTrips] = useState<Trip[]>(MOCK_INITIAL_TRIPS);
  const [localMembers, setLocalMembers] = useState<Record<string, TripMember[]>>(MOCK_INITIAL_MEMBERS);
  const [localLocations, setLocalLocations] = useState<Record<string, MemberLocation[]>>(MOCK_INITIAL_LOCATIONS);
  const [localStops, setLocalStops] = useState<Record<string, TripStop[]>>(MOCK_INITIAL_STOPS);

  // Realtime Firestore Listener for User's Trips
  useEffect(() => {
    if (!user) {
      setTrips([]);
      setLoadingTrips(false);
      return;
    }

    if (isMockFirebase) {
      const userMockTrips = localTrips.filter((t) =>
        t.memberIds.includes(user.uid) || t.createdBy === user.uid
      );
      setTrips(userMockTrips);
      setLoadingTrips(false);
      return;
    }

    setLoadingTrips(true);
    const tripsQuery = query(
      collection(db, 'trips'),
      where('memberIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(
      tripsQuery,
      (snapshot: any) => {
        const loadedTrips: Trip[] = snapshot.docs.map((d: any) => ({
          id: d.id,
          ...d.data(),
        })) as Trip[];
        setTrips(loadedTrips);
        setLoadingTrips(false);
      },
      (err: any) => {
        console.error('Error fetching user trips:', err);
        setLoadingTrips(false);
      }
    );

    return () => unsubscribe();
  }, [user, isMockFirebase, localTrips]);

  // Create a new Trip
  const createTrip = async (name: string, startDate: string, endDate: string): Promise<Trip> => {
    if (!user) throw new Error('User must be signed in to create a trip.');

    const inviteCode = generateInviteCode();
    const tripId = `trip_${Date.now()}`;
    const newTrip: Trip = {
      id: tripId,
      name,
      startDate,
      endDate,
      inviteCode,
      memberIds: [user.uid],
      createdBy: user.uid,
      createdAt: Date.now(),
      status: 'planned',
    };

    const creatorMember: TripMember = {
      uid: user.uid,
      displayName: user.name || 'Trip Organizer',
      avatar: user.avatar,
      joinedAt: Date.now(),
      sharingEnabled: true,
    };

    if (isMockFirebase) {
      setLocalTrips((prev) => [newTrip, ...prev]);
      setLocalMembers((prev) => ({
        ...prev,
        [tripId]: [creatorMember],
      }));
      return newTrip;
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'trips', tripId), newTrip);
    batch.set(doc(db, 'trips', tripId, 'members', user.uid), creatorMember);
    batch.set(doc(db, 'inviteCodes', inviteCode.toUpperCase()), {
      code: inviteCode.toUpperCase(),
      tripId,
      createdAt: Date.now(),
    });
    await batch.commit();

    return newTrip;
  };

  // Get trip preview by invite code
  const getTripPreviewByCode = async (code: string): Promise<TripPreview> => {
    const formattedCode = code.trim().toUpperCase();

    if (isMockFirebase) {
      const foundTrip = localTrips.find((t) => t.inviteCode.toUpperCase() === formattedCode);
      if (!foundTrip) throw new Error(`Invalid invite code: ${formattedCode}`);
      const members = localMembers[foundTrip.id] || [];
      return {
        trip: foundTrip,
        memberCount: members.length,
        members,
      };
    }

    const inviteDocRef = doc(db, 'inviteCodes', formattedCode);
    const inviteSnap = await getDoc(inviteDocRef);

    let targetTripId: string;

    if (inviteSnap.exists()) {
      targetTripId = inviteSnap.data().tripId;
    } else {
      const tripQuery = query(collection(db, 'trips'), where('inviteCode', '==', formattedCode));
      const querySnap = await getDocs(tripQuery);
      if (querySnap.empty) {
        throw new Error(`No trip found matching invite code "${formattedCode}".`);
      }
      targetTripId = querySnap.docs[0].id;
    }

    const tripSnap = await getDoc(doc(db, 'trips', targetTripId));
    if (!tripSnap.exists()) throw new Error('Trip document no longer exists.');

    const tripData = { id: tripSnap.id, ...tripSnap.data() } as Trip;
    const membersSnap = await getDocs(collection(db, 'trips', targetTripId, 'members'));
    const membersList = membersSnap.docs.map((d: any) => d.data() as TripMember);

    return {
      trip: tripData,
      memberCount: membersList.length,
      members: membersList,
    };
  };

  // Join a trip via code
  const joinTripByCode = async (code: string): Promise<Trip> => {
    if (!user) throw new Error('User must be signed in to join a trip.');

    const preview = await getTripPreviewByCode(code);
    const targetTrip = preview.trip;

    if (targetTrip.memberIds.includes(user.uid)) {
      return targetTrip;
    }

    const newMember: TripMember = {
      uid: user.uid,
      displayName: user.name || 'Trip Member',
      avatar: user.avatar,
      joinedAt: Date.now(),
      sharingEnabled: false,
    };

    if (isMockFirebase) {
      setLocalTrips((prev) =>
        prev.map((t) =>
          t.id === targetTrip.id
            ? { ...t, memberIds: [...t.memberIds, user.uid] }
            : t
        )
      );
      setLocalMembers((prev) => ({
        ...prev,
        [targetTrip.id]: [...(prev[targetTrip.id] || []), newMember],
      }));
      return {
        ...targetTrip,
        memberIds: [...targetTrip.memberIds, user.uid],
      };
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'trips', targetTrip.id, 'members', user.uid), newMember);
    batch.update(doc(db, 'trips', targetTrip.id), {
      memberIds: arrayUnion(user.uid),
    });
    await batch.commit();

    return {
      ...targetTrip,
      memberIds: [...targetTrip.memberIds, user.uid],
    };
  };

  // Leave trip
  const leaveTrip = async (tripId: string): Promise<void> => {
    if (!user) return;
    try {
      await stopBackgroundLocationTracking();
    } catch (e) {
      // ignore
    }

    if (isMockFirebase) {
      setLocalTrips((prev) =>
        prev.map((t) =>
          t.id === tripId
            ? { ...t, memberIds: t.memberIds.filter((id) => id !== user.uid) }
            : t
        )
      );
      setLocalMembers((prev) => ({
        ...prev,
        [tripId]: (prev[tripId] || []).filter((m) => m.uid !== user.uid),
      }));
      return;
    }

    await deleteDoc(doc(db, 'trips', tripId, 'members', user.uid));
    await updateDoc(doc(db, 'trips', tripId), {
      memberIds: arrayRemove(user.uid),
    });
  };

  // Get trip members list
  const getTripMembers = async (tripId: string): Promise<TripMember[]> => {
    if (isMockFirebase) {
      return localMembers[tripId] || [];
    }
    const snap = await getDocs(collection(db, 'trips', tripId, 'members'));
    return snap.docs.map((d: any) => d.data() as TripMember);
  };

  // Listen to members in realtime
  const listenToTripMembers = (
    tripId: string,
    callback: (members: TripMember[]) => void
  ): (() => void) => {
    if (isMockFirebase) {
      callback(localMembers[tripId] || []);
      return () => {};
    }

    const membersRef = collection(db, 'trips', tripId, 'members');
    const unsubscribe = onSnapshot(membersRef, (snapshot: any) => {
      const list = snapshot.docs.map((d: any) => d.data() as TripMember);
      callback(list);
    });

    return unsubscribe;
  };

  // Update member live location: trips/{tripId}/locations/{user.uid}
  const updateMemberLocation = async (tripId: string, lat: number, lng: number): Promise<void> => {
    if (!user) return;

    const locData: MemberLocation = {
      uid: user.uid,
      lat,
      lng,
      updatedAt: Date.now(),
      displayName: user.name || 'Traveler',
      avatar: user.avatar,
    };

    if (isMockFirebase) {
      setLocalLocations((prev) => {
        const currentList = prev[tripId] || [];
        const filtered = currentList.filter((l) => l.uid !== user.uid);
        return {
          ...prev,
          [tripId]: [locData, ...filtered],
        };
      });
      return;
    }

    await setDoc(doc(db, 'trips', tripId, 'locations', user.uid), locData);
    await updateDoc(doc(db, 'trips', tripId, 'members', user.uid), {
      lastSeenAt: Date.now(),
    });
  };

  // Toggle location sharing state
  const toggleLocationSharing = async (tripId: string, enabled: boolean): Promise<void> => {
    if (!user) return;

    if (isMockFirebase) {
      setLocalMembers((prev) => {
        const list = prev[tripId] || [];
        return {
          ...prev,
          [tripId]: list.map((m) => (m.uid === user.uid ? { ...m, sharingEnabled: enabled } : m)),
        };
      });
      return;
    }

    await updateDoc(doc(db, 'trips', tripId, 'members', user.uid), {
      sharingEnabled: enabled,
    });
  };

  // Listen to member locations in realtime
  const listenToTripLocations = (
    tripId: string,
    callback: (locations: MemberLocation[]) => void
  ): (() => void) => {
    if (isMockFirebase) {
      callback(localLocations[tripId] || []);
      return () => {};
    }

    const locsRef = collection(db, 'trips', tripId, 'locations');
    const unsubscribe = onSnapshot(locsRef, (snapshot: any) => {
      const list = snapshot.docs.map((d: any) => d.data() as MemberLocation);
      callback(list);
    });

    return unsubscribe;
  };

  // Create a marked stop (with optional photo upload to Firebase Storage)
  const createTripStop = async (
    tripId: string,
    name: string,
    note?: string,
    imageUri?: string,
    lat?: number,
    lng?: number
  ): Promise<TripStop> => {
    if (!user) throw new Error('User must be logged in to mark a stop.');

    const stopId = `stop_${Date.now()}`;
    let photoUrl: string | undefined = undefined;

    // Upload photo to Firebase Storage if provided
    if (imageUri) {
      if (isMockFirebase) {
        photoUrl = imageUri; // fallback local image preview
      } else {
        try {
          const response = await fetch(imageUri);
          const blob = await response.blob();
          const storageRef = ref(storage, `trips/${tripId}/stops/${stopId}.jpg`);
          await uploadBytes(storageRef, blob);
          photoUrl = await getDownloadURL(storageRef);
        } catch (uploadErr) {
          console.error('Error uploading stop photo to Firebase Storage:', uploadErr);
        }
      }
    }

    const stopData: TripStop = {
      id: stopId,
      uid: user.uid,
      displayName: user.name || 'Traveler',
      lat: lat || 37.7749,
      lng: lng || -122.4194,
      name,
      note: note || '',
      photoUrl,
      createdAt: Date.now(),
    };

    if (isMockFirebase) {
      setLocalStops((prev) => ({
        ...prev,
        [tripId]: [stopData, ...(prev[tripId] || [])],
      }));
      return stopData;
    }

    await setDoc(doc(db, 'trips', tripId, 'stops', stopId), stopData);
    return stopData;
  };

  // Listen to trip stops in realtime
  const listenToTripStops = (
    tripId: string,
    callback: (stops: TripStop[]) => void
  ): (() => void) => {
    if (isMockFirebase) {
      callback(localStops[tripId] || []);
      return () => {};
    }

    const stopsRef = collection(db, 'trips', tripId, 'stops');
    const unsubscribe = onSnapshot(stopsRef, (snapshot: any) => {
      const list = snapshot.docs.map((d: any) => d.data() as TripStop);
      // Sort by createdAt descending
      list.sort((a: TripStop, b: TripStop) => b.createdAt - a.createdAt);
      callback(list);
    });

    return unsubscribe;
  };

  return (
    <TripContext.Provider
      value={{
        trips,
        loadingTrips,
        pendingInviteCode,
        setPendingInviteCode,
        createTrip,
        getTripPreviewByCode,
        joinTripByCode,
        leaveTrip,
        getTripMembers,
        listenToTripMembers,
        updateMemberLocation,
        toggleLocationSharing,
        listenToTripLocations,
        createTripStop,
        listenToTripStops,
      }}
    >
      {children}
    </TripContext.Provider>
  );
};

export const useTrips = () => {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error('useTrips must be used within a TripProvider');
  }
  return context;
};
