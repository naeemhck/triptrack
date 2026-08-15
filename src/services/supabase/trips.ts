import { supabase } from '../../config/supabase';
import { Trip, TripPreview } from '../../types/trip';
import { mapMember, mapTrip } from './mappers';
import { inviteCodeSchema, tripCreateSchema } from '../../validation/schemas';

const memberSelect = '*, profiles(display_name, avatar_url)';

export async function listTrips(): Promise<Trip[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('trip_members')
    .select('trip_id,user_id');
  if (membershipError) throw membershipError;
  const tripIds = [...new Set((memberships || []).map((row) => row.trip_id))];
  if (tripIds.length === 0) return [];
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .in('id', tripIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) =>
    mapTrip(
      row,
      (memberships || []).filter((m) => m.trip_id === row.id).map((m) => m.user_id),
    ),
  );
}

export async function createTrip(
  name: string,
  startDate?: string,
  endDate?: string,
): Promise<Trip> {
  const tripInput = tripCreateSchema.parse({ name, startDate, endDate });
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: tripInput.name,
    p_start_date: tripInput.startDate || null,
    p_end_date: tripInput.endDate || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapTrip(row, [row.created_by]);
}

export async function getTripPreview(inviteCode: string): Promise<TripPreview> {
  const normalizedCode = inviteCodeSchema.parse(inviteCode);
  const { data: joined, error: joinError } = await supabase.rpc('preview_trip', {
    p_invite_code: normalizedCode,
  });
  if (joinError) throw joinError;
  const tripRow = Array.isArray(joined) ? joined[0] : joined;
  const members = await listMembers(tripRow.id);
  return {
    trip: mapTrip(
      tripRow,
      members.map((m) => m.uid),
    ),
    members,
    memberCount: members.length,
  };
}

export async function joinTrip(inviteCode: string): Promise<Trip> {
  const normalizedCode = inviteCodeSchema.parse(inviteCode);
  const { data, error } = await supabase.rpc('join_trip', { p_invite_code: normalizedCode });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const members = await listMembers(row.id);
  return mapTrip(
    row,
    members.map((m) => m.uid),
  );
}

export async function listMembers(tripId: string) {
  const { data, error } = await supabase
    .from('trip_members')
    .select(memberSelect)
    .eq('trip_id', tripId)
    .order('joined_at');
  if (error) throw error;
  return (data || []).map(mapMember);
}

export async function setSharing(
  tripId: string,
  enabled: boolean,
  mode: 'always' | 'foreground' | 'off' = enabled ? 'always' : 'off',
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required.');
  const { error } = await supabase
    .from('trip_members')
    .update({ sharing_enabled: enabled, sharing_mode: enabled ? mode : 'off' })
    .eq('trip_id', tripId)
    .eq('user_id', user.id);
  if (error) throw error;
}

export async function runTripRpc(
  name: 'start_trip' | 'end_trip' | 'leave_trip',
  tripId: string,
): Promise<void> {
  const { error } = await supabase.rpc(name, { p_trip_id: tripId });
  if (error) throw error;
}

export async function removeMember(tripId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_trip_member', {
    p_trip_id: tripId,
    p_user_id: userId,
  });
  if (error) throw error;
}
