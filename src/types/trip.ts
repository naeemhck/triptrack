export type TripStatus = 'planned' | 'active' | 'completed';

export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  inviteCode: string;
  memberIds: string[];
  createdBy: string;
  createdAt: number;
  status?: TripStatus;
  startedAt?: number;
  endedAt?: number;
  routeLeaderUserId?: string;
}

export interface TripMember {
  uid: string;
  displayName: string;
  avatar?: string;
  joinedAt: number;
  sharingEnabled: boolean;
  sharingMode?: 'always' | 'foreground' | 'off';
  lastSeenAt?: number;
}

export interface InviteCodeLookup {
  code: string;
  tripId: string;
  createdAt: number;
}

export interface TripPreview {
  trip: Trip;
  memberCount: number;
  members: TripMember[];
}
