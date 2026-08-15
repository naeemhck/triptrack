import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { logger } from '../utils/logger';
import { stopPhotoPath, uploadStopPhoto } from './supabase/photos';
import { assertStopExistsOwned, updateStop } from './supabase/stops';

export const MAX_PENDING_PHOTOS = 20;
const PENDING_MEDIA_DIRECTORY = `${FileSystem.documentDirectory}triptrack-pending-media/`;

export const prepareDurableStopPhoto = async (
  stopId: string,
  localPhotoUri: string,
): Promise<string> => {
  await FileSystem.makeDirectoryAsync(PENDING_MEDIA_DIRECTORY, { intermediates: true });
  const normalized = await ImageManipulator.manipulateAsync(localPhotoUri, [], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const durablePhotoUri = `${PENDING_MEDIA_DIRECTORY}${stopId}.jpg`;
  await FileSystem.copyAsync({ from: normalized.uri, to: durablePhotoUri });
  return durablePhotoUri;
};

export const removeDurableStopPhoto = (localPhotoUri: string): Promise<void> =>
  FileSystem.deleteAsync(localPhotoUri, { idempotent: true });

interface SyncQueuedStopPhotoOptions {
  tripId: string;
  stopId: string;
  uid: string;
  localPhotoUri?: string;
  photoUploaded: boolean;
  remotePath: string | null;
  onUploadComplete: (remotePath: string) => Promise<void>;
}

export const syncQueuedStopPhoto = async ({
  tripId,
  stopId,
  uid,
  localPhotoUri,
  photoUploaded,
  remotePath: existingRemotePath,
  onUploadComplete,
}: SyncQueuedStopPhotoOptions): Promise<void> => {
  await assertStopExistsOwned(tripId, stopId, uid);
  let remotePath = existingRemotePath;

  if (!photoUploaded && localPhotoUri) {
    logger.info('offline_queue.photo_upload_started');
    remotePath = stopPhotoPath(tripId, stopId);
    await uploadStopPhoto(remotePath, localPhotoUri);
    await onUploadComplete(remotePath);
  }

  if (!remotePath) throw new Error('Uploaded photo is missing its remote path.');
  await updateStop(tripId, stopId, { photoPath: remotePath });
  if (localPhotoUri) await removeDurableStopPhoto(localPhotoUri);
};
