import { supabase } from '../../config/supabase';
import {
  Trip,
  TripAlertEvent,
  TripAlertThresholds,
  TripPreview,
  TripStatistics,
} from '../../types/trip';
import { mapMember, mapTrip } from './mappers';
import { inviteCodeSchema, tripCreateSchema } from '../../validation/schemas';

const memberSelect = '*, profiles(display_name, avatar_url)';

export async function listTrips(): Promise<Trip[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('trip_members')
    .select('trip_id,user_id,profiles(display_name)');
  if (membershipError) throw membershipError;
  const tripIds = [...new Set((memberships || []).map((row) => row.trip_id))];
  if (tripIds.length === 0) return [];
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .in('id', tripIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const { data: stops, error: stopsError } = await supabase
    .from('trip_stops')
    .select('trip_id,title,created_at')
    .in('trip_id', tripIds)
    .order('created_at', { ascending: false });
  if (stopsError) throw stopsError;
  const { data: locations, error: locationsError } = await supabase
    .from('trip_locations')
    .select('trip_id,updated_at')
    .in('trip_id', tripIds)
    .order('updated_at', { ascending: false });
  if (locationsError) throw locationsError;
  return (data || []).map((row) => {
    const trip = mapTrip(
      row,
      (memberships || []).filter((m) => m.trip_id === row.id).map((m) => m.user_id),
    );
    const tripMemberships = (memberships || []).filter((m) => m.trip_id === row.id);
    trip.memberNames = tripMemberships.map((m: any) => m.profiles?.display_name || 'Member');
    const latestStop = (stops || []).find((stop) => stop.trip_id === row.id);
    const latestLocation = (locations || []).find((location) => location.trip_id === row.id);
    const stopTime = latestStop ? new Date(latestStop.created_at).getTime() : 0;
    const locationTime = latestLocation ? new Date(latestLocation.updated_at).getTime() : 0;
    trip.latestActivity =
      latestStop && stopTime >= locationTime
        ? `Last stop: ${latestStop.title}`
        : latestLocation
          ? `Location updated ${new Date(locationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : trip.status === 'active'
            ? 'Live trip in progress'
            : 'No recorded activity yet';
    return trip;
  });
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
  const { error } = await supabase.rpc('set_trip_sharing', {
    p_trip_id: tripId,
    p_mode: enabled ? mode : 'off',
    p_duration_minutes: null,
  });
  if (error) throw error;
}

export async function setTimedSharing(
  tripId: string,
  mode: 'always' | 'foreground',
): Promise<void> {
  const { error } = await supabase.rpc('set_trip_sharing', {
    p_trip_id: tripId,
    p_mode: mode,
    p_duration_minutes: 120,
  });
  if (error) throw error;
}

export async function updateTripAlertThresholds(
  tripId: string,
  thresholds: TripAlertThresholds,
): Promise<void> {
  const { error } = await supabase.rpc('update_trip_alert_thresholds', {
    p_trip_id: tripId,
    p_warning_meters: thresholds.warningDistanceMeters,
    p_critical_meters: thresholds.criticalDistanceMeters,
  });
  if (error) throw error;
}

export async function getTripStatistics(tripId: string): Promise<TripStatistics> {
  const { data, error } = await supabase.rpc('get_trip_statistics', { p_trip_id: tripId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    elapsedSeconds: Number(row?.elapsed_seconds || 0),
    routeDistanceMeters: Number(row?.route_distance_meters || 0),
    stopCount: Number(row?.stop_count || 0),
    stoppedSeconds: Number(row?.stopped_seconds || 0),
    movingSeconds: Number(row?.moving_seconds || 0),
  };
}

export async function listTripAlertEvents(tripId: string): Promise<TripAlertEvent[]> {
  const { data, error } = await supabase.rpc('list_trip_alert_events', {
    p_trip_id: tripId,
    p_limit: 50,
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    type: row.event_type,
    userId: row.user_id,
    displayName: row.display_name || 'Member',
    createdAt: new Date(row.created_at).getTime(),
    behindMeters: row.behind_meters == null ? undefined : Number(row.behind_meters),
  }));
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
