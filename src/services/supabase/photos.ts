import { supabase } from '../../config/supabase';

export const STOP_PHOTO_BUCKET = 'trip-stop-photos';
export const stopPhotoPath = (tripId: string, stopId: string) => `${tripId}/${stopId}/photo.jpg`;

export async function uploadStopPhoto(path: string, localUri: string): Promise<void> {
  const response = await fetch(localUri);
  if (!response.ok) throw new Error('Unable to read queued stop photo.');
  const bytes = await response.arrayBuffer();
  const { error } = await supabase.storage.from(STOP_PHOTO_BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
}

export async function getStopPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STOP_PHOTO_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
