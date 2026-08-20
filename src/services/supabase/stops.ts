import { supabase } from '../../config/supabase';
import { TripStop } from '../../types/location';
import { mapStop, toIso } from './mappers';
import { getStopPhotoUrl } from './photos';

export async function upsertStop(tripId: string, stop: TripStop): Promise<void> {
  const { error } = await supabase.from('trip_stops').insert({
    id: stop.id,
    trip_id: tripId,
    user_id: stop.uid,
    latitude: stop.lat,
    longitude: stop.lng,
    title: stop.name,
    note: stop.note || null,
    source: stop.autoDetected || stop.type === 'auto' ? 'automatic' : 'manual',
    arrived_at: toIso(stop.createdAt),
    departed_at: toIso(stop.departedAt),
    photo_path: stop.photoPath || null,
    category: stop.category || 'general',
    review_status: stop.autoDetected || stop.type === 'auto' ? 'needs_review' : 'not_required',
  });
  if (!error) return;

  // Stable queue IDs make retries idempotent. A duplicate is successful only
  // when the existing canonical row belongs to the same trip and owner.
  if (error.code === '23505') {
    const { data: existing, error: readError } = await supabase
      .from('trip_stops')
      .select('trip_id,user_id')
      .eq('id', stop.id)
      .maybeSingle();
    if (!readError && existing?.trip_id === tripId && existing.user_id === stop.uid) return;
  }

  throw error;
}

export async function reviewAutomaticStop(
  tripId: string,
  stopId: string,
  action: 'confirm' | 'delete',
  fields: Pick<Partial<TripStop>, 'name' | 'note' | 'category' | 'departedAt'> = {},
): Promise<void> {
  const { error } = await supabase.rpc('review_trip_stop', {
    p_trip_id: tripId,
    p_stop_id: stopId,
    p_action: action,
    p_title: fields.name ?? null,
    p_note: fields.note ?? null,
    p_category: fields.category ?? null,
    p_departed_at: toIso(fields.departedAt),
  });
  if (error) throw error;
}

export async function assertStopExistsOwned(
  tripId: string,
  stopId: string,
  uid: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('trip_stops')
    .select('id')
    .eq('id', stopId)
    .eq('trip_id', tripId)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Photo upload is waiting for its parent stop to synchronize.');
}

export async function updateStop(
  tripId: string,
  stopId: string,
  fields: Partial<TripStop>,
): Promise<void> {
  const { error } = await supabase.rpc('update_own_trip_stop', {
    p_trip_id: tripId,
    p_stop_id: stopId,
    p_title: fields.name ?? null,
    p_note: fields.note ?? null,
    p_departed_at: toIso(fields.departedAt),
    p_photo_path: fields.photoPath ?? null,
  });
  if (error) throw error;
}

const STOP_LIST_SELECT = '*, profiles!user_id(display_name,avatar_url)';

async function fetchStopRows(tripId: string) {
  const embedded = await supabase
    .from('trip_stops')
    .select(STOP_LIST_SELECT)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (!embedded.error) return embedded.data || [];

  // trip_stops has two FKs to profiles (owner + reviewer). If the embed hint
  // is unavailable, still return stop rows so Activity is not empty.
  const fallback = await supabase
    .from('trip_stops')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (fallback.error) throw embedded.error;
  return fallback.data || [];
}

export async function listStops(tripId: string): Promise<TripStop[]> {
  const rows = await fetchStopRows(tripId);
  const stops = await Promise.all(
    rows.map(async (row) => {
      const stop = mapStop(row);
      if (!stop.photoPath) return stop;

      try {
        return { ...stop, photoUrl: await getStopPhotoUrl(stop.photoPath) };
      } catch (photoError) {
        console.error('[Stop Service] Failed to load an attached stop photo:', photoError);
        return stop;
      }
    }),
  );
  return stops.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
