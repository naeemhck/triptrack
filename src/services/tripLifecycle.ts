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

import { cleanupActiveTripState } from './backgroundLocation';
import { removeMember, runTripRpc } from './supabase/trips';
import { devLog } from '../utils/devLog';

/**
 * Start a Planned Trip (Organizer only)
 */
export const startTrip = async (tripId: string, currentUid: string): Promise<void> => {
  void currentUid;
  await runTripRpc('start_trip', tripId);

  devLog(`🚀 [Lifecycle] Started trip ${tripId}`);
};

/**
 * End an Active Trip (Organizer only)
 */
export const endTrip = async (tripId: string, currentUid: string): Promise<void> => {
  await runTripRpc('end_trip', tripId);

  // Local device cleanup
  await cleanupActiveTripState(tripId, currentUid);
  devLog(`🏁 [Lifecycle] Ended trip ${tripId}`);
};

/**
 * Leave a Trip (Non-organizer member)
 */
export const leaveTrip = async (tripId: string, currentUid: string): Promise<void> => {
  await runTripRpc('leave_trip', tripId);

  // Local device cleanup
  await cleanupActiveTripState(tripId, currentUid);
  devLog(`👋 [Lifecycle] User ${currentUid} left trip ${tripId}`);
};

/**
 * Remove a Member (Organizer only)
 */
export const removeTripMember = async (
  tripId: string,
  organizerUid: string,
  targetMemberUid: string,
): Promise<void> => {
  void organizerUid;
  await removeMember(tripId, targetMemberUid);
  devLog(`🛑 [Lifecycle] Organizer removed member ${targetMemberUid} from trip ${tripId}`);
};
