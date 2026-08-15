import { supabase } from '../../config/supabase';
import { MemberLocation } from '../../types/location';
import { mapLocation, toIso } from './mappers';

export async function upsertLocation(
  tripId: string,
  userId: string,
  location: Partial<MemberLocation> & { sampledAt?: number },
  sampleId: string,
  routeCandidate = false
): Promise<void> {
  const { error } = await supabase.rpc('submit_trip_location', {
    p_trip_id: tripId,
    p_sample_id: sampleId,
    p_latitude: location.lat,
    p_longitude: location.lng,
    p_accuracy: location.accuracy ?? null,
    p_sampled_at: toIso(location.sampledAt || Date.now()),
    p_route_candidate: routeCandidate,
  });
  if (error) throw error;
}

export async function listLocations(tripId: string): Promise<MemberLocation[]> {
  const { data, error } = await supabase.from('trip_locations').select('*, profiles(display_name,avatar_url), trip_members(sharing_enabled)').eq('trip_id', tripId);
  if (error) throw error;
  return (data || []).map(mapLocation);
}
