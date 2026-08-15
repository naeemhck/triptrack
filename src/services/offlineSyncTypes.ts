export type OfflineOperationType =
  | 'latest_location'
  | 'leader_route_sample'
  | 'manual_stop'
  | 'auto_stop'
  | 'stop_update'
  | 'stop_photo';

export type SyncItemStatus =
  'pending' | 'processing' | 'synced' | 'failed' | 'manual_retry_required';

export interface OfflineSyncItem {
  id: string;
  operationType: OfflineOperationType;
  tripId: string;
  uid: string;
  createdAt: number;
  sampledAt?: number;
  attempts: number;
  nextRetryAt: number;
  status: SyncItemStatus;
  processingStartedAt?: number;
  leaseExpiresAt?: number;
  payload: any;
  localPhotoUri?: string;
  error?: string;
}
