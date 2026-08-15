import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  prepareDurableStopPhoto,
  removeDurableStopPhoto,
  syncQueuedStopPhoto,
} from '../offlineSyncPhotos';
import { stopPhotoPath, uploadStopPhoto } from '../supabase/photos';
import { assertStopExistsOwned, updateStop } from '../supabase/stops';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(),
}));
jest.mock('../supabase/photos', () => ({ stopPhotoPath: jest.fn(), uploadStopPhoto: jest.fn() }));
jest.mock('../supabase/stops', () => ({
  assertStopExistsOwned: jest.fn(),
  updateStop: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('offline photo durability and recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      uri: 'file:///cache/a.jpg',
    });
    (stopPhotoPath as jest.Mock).mockReturnValue('trips/trip-1/stops/stop-1/photo.jpg');
  });

  it('normalizes and copies a selected photo into application storage', async () => {
    await expect(prepareDurableStopPhoto('stop-1', 'content://photo')).resolves.toBe(
      'file:///documents/triptrack-pending-media/stop-1.jpg',
    );
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith('content://photo', [], {
      compress: 0.85,
      format: 'jpeg',
    });
    expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
  });

  it('persists upload completion before attaching the database path', async () => {
    const onUploadComplete = jest.fn().mockResolvedValue(undefined);
    await syncQueuedStopPhoto({
      tripId: 'trip-1',
      stopId: 'stop-1',
      uid: 'user-1',
      localPhotoUri: 'file:///documents/photo.jpg',
      photoUploaded: false,
      remotePath: null,
      onUploadComplete,
    });
    expect(assertStopExistsOwned).toHaveBeenCalledTimes(1);
    expect(uploadStopPhoto).toHaveBeenCalledTimes(1);
    expect(onUploadComplete.mock.invocationCallOrder[0]).toBeLessThan(
      (updateStop as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  });

  it('does not re-upload a binary after partial success', async () => {
    await syncQueuedStopPhoto({
      tripId: 'trip-1',
      stopId: 'stop-1',
      uid: 'user-1',
      localPhotoUri: 'file:///documents/photo.jpg',
      photoUploaded: true,
      remotePath: 'trips/trip-1/stops/stop-1/photo.jpg',
      onUploadComplete: jest.fn(),
    });
    expect(uploadStopPhoto).not.toHaveBeenCalled();
    expect(updateStop).toHaveBeenCalledTimes(1);
  });

  it('removes durable media idempotently', async () => {
    await removeDurableStopPhoto('file:///documents/photo.jpg');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///documents/photo.jpg', {
      idempotent: true,
    });
  });
});
