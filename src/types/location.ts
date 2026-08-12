export interface MemberLocation {
  uid: string;
  lat: number;
  lng: number;
  updatedAt: number;
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
  autoDetected?: boolean;
  type?: 'manual' | 'auto';
  createdAt: number;
  departedAt?: number;
  notificationSent?: boolean;
  isPendingSync?: boolean;
}
