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
  const update: Record<string, unknown> = {};
  if (fields.name !== undefined) update.title = fields.name;
  if (fields.note !== undefined) update.note = fields.note;
  if (fields.departedAt !== undefined) update.departed_at = toIso(fields.departedAt);
  if (fields.photoPath !== undefined) update.photo_path = fields.photoPath;
  const { error } = await supabase
    .from('trip_stops')
    .update(update)
    .eq('trip_id', tripId)
    .eq('id', stopId);
  if (error) throw error;
}

export async function listStops(tripId: string): Promise<TripStop[]> {
  const { data, error } = await supabase
    .from('trip_stops')
    .select('*, profiles(display_name,avatar_url)')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Promise.all(
    (data || []).map(async (row) => {
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
}
