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
  warningDistanceMeters?: number;
  criticalDistanceMeters?: number;
  memberNames?: string[];
  latestActivity?: string;
}

export interface TripMember {
  uid: string;
  displayName: string;
  avatar?: string;
  joinedAt: number;
  sharingEnabled: boolean;
  sharingMode?: 'always' | 'foreground' | 'off';
  lastSeenAt?: number;
  sharingExpiresAt?: number;
}

export interface TripAlertThresholds {
  warningDistanceMeters: number;
  criticalDistanceMeters: number;
}

export interface TripStatistics {
  elapsedSeconds: number;
  routeDistanceMeters: number;
  stopCount: number;
  stoppedSeconds: number;
  movingSeconds: number;
}

export type TripAlertEventType =
  'warning' | 'critical' | 'stale' | 'member_left' | 'member_removed';

export interface TripAlertEvent {
  id: string;
  type: TripAlertEventType;
  userId: string;
  displayName: string;
  createdAt: number;
  behindMeters?: number;
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

export type TripMemberFilter = 'all' | 'active' | 'inactive';
