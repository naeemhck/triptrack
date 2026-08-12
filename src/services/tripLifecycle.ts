/**
 * TripTrack Trip Lifecycle & Member Management Service
 * 
 * ADMINISTRATIVE LIFECYCLE CONTROLS:
 * 1. startTrip: Planned -> Active (sets startedAt = Date.now())
 * 2. endTrip: Active -> Completed (sets endedAt = Date.now(), runs cleanupActiveTripState)
 * 3. leaveTrip: Non-organizer leaves trip; atomic batch update on memberIds & members subcollection
 * 4. removeTripMember: Organizer removes member; atomic batch update
 * 
 * NOTE: Administrative actions require network connectivity.
 */

import { doc, updateDoc, writeBatch, arrayRemove, getDoc } from 'firebase/firestore';
import { db, isMockFirebase } from '../config/firebase';
import { cleanupActiveTripState } from './backgroundLocation';

/**
 * Start a Planned Trip (Organizer only)
 */
export const startTrip = async (tripId: string, currentUid: string): Promise<void> => {
  if (isMockFirebase) {
    console.log(`[Mock] Started trip ${tripId}`);
    return;
  }

  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) {
    throw new Error('Trip does not exist.');
  }

  const tripData = tripSnap.data();
  if (tripData.createdBy !== currentUid) {
    throw new Error('Only the trip organizer can start this trip.');
  }

  if (tripData.status === 'completed') {
    throw new Error('Completed trips cannot be restarted.');
  }

  await updateDoc(tripRef, {
    status: 'active',
    startedAt: Date.now(),
  });

  console.log(`🚀 [Lifecycle] Started trip ${tripId}`);
};

/**
 * End an Active Trip (Organizer only)
 */
export const endTrip = async (tripId: string, currentUid: string): Promise<void> => {
  if (isMockFirebase) {
    console.log(`[Mock] Ended trip ${tripId}`);
    await cleanupActiveTripState(tripId, currentUid);
    return;
  }

  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) {
    throw new Error('Trip does not exist.');
  }

  const tripData = tripSnap.data();
  if (tripData.createdBy !== currentUid) {
    throw new Error('Only the trip organizer can end this trip.');
  }

  await updateDoc(tripRef, {
    status: 'completed',
    endedAt: Date.now(),
  });

  // Local device cleanup
  await cleanupActiveTripState(tripId, currentUid);
  console.log(`🏁 [Lifecycle] Ended trip ${tripId}`);
};

/**
 * Leave a Trip (Non-organizer member)
 */
export const leaveTrip = async (tripId: string, currentUid: string): Promise<void> => {
  if (isMockFirebase) {
    console.log(`[Mock] User ${currentUid} left trip ${tripId}`);
    await cleanupActiveTripState(tripId, currentUid);
    return;
  }

  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) {
    throw new Error('Trip does not exist.');
  }

  const tripData = tripSnap.data();
  if (tripData.createdBy === currentUid) {
    if (tripData.status === 'active') {
      throw new Error('End the trip before leaving.');
    }
  }

  // Atomic batch write for denormalized membership
  const batch = writeBatch(db);
  batch.update(tripRef, {
    memberIds: arrayRemove(currentUid),
  });
  batch.delete(doc(db, 'trips', tripId, 'members', currentUid));

  await batch.commit();

  // Local device cleanup
  await cleanupActiveTripState(tripId, currentUid);
  console.log(`👋 [Lifecycle] User ${currentUid} left trip ${tripId}`);
};

/**
 * Remove a Member (Organizer only)
 */
export const removeTripMember = async (
  tripId: string,
  organizerUid: string,
  targetMemberUid: string
): Promise<void> => {
  if (isMockFirebase) {
    console.log(`[Mock] Organizer removed member ${targetMemberUid} from trip ${tripId}`);
    return;
  }

  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) {
    throw new Error('Trip does not exist.');
  }

  const tripData = tripSnap.data();
  if (tripData.createdBy !== organizerUid) {
    throw new Error('Only the trip organizer can remove members.');
  }

  if (targetMemberUid === organizerUid) {
    throw new Error('Organizers cannot remove themselves. End the trip instead.');
  }

  // Atomic batch write for denormalized membership
  const batch = writeBatch(db);
  batch.update(tripRef, {
    memberIds: arrayRemove(targetMemberUid),
  });
  batch.delete(doc(db, 'trips', tripId, 'members', targetMemberUid));

  await batch.commit();
  console.log(`🛑 [Lifecycle] Organizer removed member ${targetMemberUid} from trip ${tripId}`);
};
