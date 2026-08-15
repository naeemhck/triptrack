import { MemberLocation, TripStop } from '../../types/location';
import { Trip, TripMember } from '../../types/trip';

export const toMillis = (value?: string | null): number | undefined =>
  value ? new Date(value).getTime() : undefined;
export const toIso = (value?: number | null): string | null =>
  value == null ? null : new Date(value).toISOString();

export function mapTrip(row: any, memberIds: string[] = []): Trip {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    inviteCode: row.invite_code,
    memberIds,
    createdBy: row.created_by,
    createdAt: toMillis(row.created_at) || Date.now(),
    status: row.status,
    startedAt: toMillis(row.started_at),
    endedAt: toMillis(row.ended_at),
    routeLeaderUserId: row.route_leader_user_id || undefined,
    warningDistanceMeters: row.warning_distance_meters ?? 200,
    criticalDistanceMeters: row.critical_distance_meters ?? 500,
  };
}

export function mapMember(row: any): TripMember {
  const sharingExpiresAt = toMillis(row.sharing_expires_at);
  return {
    uid: row.user_id,
    displayName: row.profiles?.display_name || 'Traveler',
    avatar: row.profiles?.avatar_url || undefined,
    joinedAt: toMillis(row.joined_at) || Date.now(),
    sharingEnabled:
      Boolean(row.sharing_enabled) && (!sharingExpiresAt || sharingExpiresAt > Date.now()),
    sharingMode: row.sharing_mode,
    lastSeenAt: toMillis(row.last_seen_at),
    sharingExpiresAt,
  };
}

export function mapLocation(row: any): MemberLocation {
  return {
    uid: row.user_id,
    lat: row.latitude,
    lng: row.longitude,
    accuracy: row.accuracy ?? undefined,
    sampledAt: toMillis(row.sampled_at),
    updatedAt: toMillis(row.updated_at) || Date.now(),
    displayName: row.profiles?.display_name,
    avatar: row.profiles?.avatar_url || undefined,
    sharingEnabled:
      (row.trip_members?.sharing_enabled ?? true) &&
      (!row.trip_members?.sharing_expires_at ||
        new Date(row.trip_members.sharing_expires_at).getTime() > Date.now()),
  };
}

export function mapStop(row: any): TripStop {
  return {
    id: row.id,
    uid: row.user_id,
    displayName: row.profiles?.display_name || 'Traveler',
    lat: row.latitude,
    lng: row.longitude,
    name: row.title,
    note: row.note || undefined,
    photoUrl: row.photoUrl,
    photoPath: row.photo_path || undefined,
    autoDetected: row.source === 'automatic',
    type: row.source === 'automatic' ? 'auto' : 'manual',
    createdAt: toMillis(row.arrived_at) || toMillis(row.created_at) || Date.now(),
    departedAt: toMillis(row.departed_at),
    category: row.category || 'general',
    reviewStatus: row.review_status || (row.source === 'automatic' ? 'confirmed' : 'not_required'),
    reviewedAt: toMillis(row.reviewed_at),
    reviewedBy: row.reviewed_by || undefined,
  };
}
