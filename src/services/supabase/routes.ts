import { supabase } from '../../config/supabase';
import { MemberRouteStatus, TripRoutePoint } from '../../types/route';

export async function listRoutePoints(tripId: string): Promise<TripRoutePoint[]> {
  const { data, error } = await supabase.from('trip_route_points')
    .select('sequence,latitude,longitude,cumulative_distance_meters,sampled_at')
    .eq('trip_id', tripId).order('sequence');
  if (error) throw error;
  return (data || []).map((row) => ({
    sequence: Number(row.sequence), latitude: row.latitude, longitude: row.longitude,
    cumulativeDistanceMeters: row.cumulative_distance_meters,
    sampledAt: new Date(row.sampled_at).getTime(),
  }));
}

export async function listMemberRouteStatuses(tripId: string): Promise<MemberRouteStatus[]> {
  const { data, error } = await supabase.from('trip_member_route_status').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data || []).map((row) => ({
    userId: row.user_id, state: row.state,
    routeProgressMeters: row.route_progress_meters ?? undefined,
    routeDistanceMeters: row.route_distance_meters ?? undefined,
    leaderProgressMeters: row.leader_progress_meters ?? undefined,
    deltaMeters: row.delta_meters ?? undefined,
    sampledAt: row.sampled_at ? new Date(row.sampled_at).getTime() : undefined,
  }));
}

export async function setRouteLeader(tripId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('set_route_leader', { p_trip_id: tripId, p_user_id: userId });
  if (error) throw error;
}
