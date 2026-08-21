import { supabase } from '../../config/supabase';

export const NUDGE_RATE_LIMIT_MS = 5 * 60 * 1000;

export interface MemberNudgeEvent {
  id: string;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  createdAt: string;
}

const mapNudge = (row: any): MemberNudgeEvent => ({
  id: row.id,
  tripId: row.trip_id,
  fromUserId: row.from_user_id,
  toUserId: row.to_user_id,
  createdAt: row.created_at,
});

/** Send a "where are you?" nudge; rejects when the rate limit or checks fail. */
export const nudgeMember = async (tripId: string, toUserId: string): Promise<string> => {
  const { data, error } = await supabase.rpc('send_member_nudge', {
    p_trip_id: tripId,
    p_to_user_id: toUserId,
  });
  if (error) throw error;
  return data as string;
};

/** Nudges visible to this user (RLS: trip members only). */
export const listTripNudges = async (tripId: string): Promise<MemberNudgeEvent[]> => {
  const { data, error } = await supabase
    .from('member_nudge_events')
    .select('id,trip_id,from_user_id,to_user_id,created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(mapNudge);
};

/** True while the from -> to rate-limit window is still open. */
export const isNudgeRateLimited = (
  nudges: MemberNudgeEvent[],
  fromUserId: string,
  toUserId: string,
  now: number = Date.now(),
): boolean =>
  nudges.some(
    (nudge) =>
      nudge.fromUserId === fromUserId &&
      nudge.toUserId === toUserId &&
      now - new Date(nudge.createdAt).getTime() < NUDGE_RATE_LIMIT_MS,
  );
