export interface MemberLocation {
  uid: string;
  lat: number;
  lng: number;
  updatedAt: number;
  sampledAt?: number;
  displayName?: string;
  avatar?: string;
  accuracy?: number;
  sharingEnabled?: boolean;
}

export interface TripStop {
  id: string;
  uid: string;
  displayName: string;
  lat: number;
  lng: number;
  name: string;
  note?: string;
  photoUrl?: string;
  photoPath?: string;
  autoDetected?: boolean;
  type?: 'manual' | 'auto';
  createdAt: number;
  departedAt?: number;
  notificationSent?: boolean;
  isPendingSync?: boolean;
  category?: StopCategory;
  reviewStatus?: StopReviewStatus;
  reviewedAt?: number;
  reviewedBy?: string;
}

export type StopCategory = 'general' | 'lodging' | 'food' | 'viewpoint' | 'fuel';
export type StopReviewStatus = 'not_required' | 'needs_review' | 'confirmed';
