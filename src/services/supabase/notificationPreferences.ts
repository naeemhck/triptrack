import { supabase } from '../../config/supabase';
import {
  DEFAULT_TRIP_NOTIFICATION_PREFERENCES,
  TripNotificationPreferences,
} from '../../types/notifications';

const mapPreferences = (row: any): TripNotificationPreferences => ({
  warningEnabled: row.warning_enabled,
  criticalEnabled: row.critical_enabled,
  stopEnabled: row.stop_enabled,
  staleEnabled: row.stale_enabled,
  memberLeftEnabled: row.member_left_enabled ?? true,
});

const requireUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Your session is no longer valid. Sign in again.');
  return data.user.id;
};

export const getTripNotificationPreferences = async (
  tripId: string,
): Promise<TripNotificationPreferences> => {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('trip_notification_preferences')
    .select('*')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPreferences(data) : { ...DEFAULT_TRIP_NOTIFICATION_PREFERENCES };
};

export const updateTripNotificationPreferences = async (
  tripId: string,
  patch: Partial<TripNotificationPreferences>,
): Promise<TripNotificationPreferences> => {
  const userId = await requireUserId();
  const current = await getTripNotificationPreferences(tripId);
  const next = { ...current, ...patch };
  const { data, error } = await supabase
    .from('trip_notification_preferences')
    .upsert(
      {
        trip_id: tripId,
        user_id: userId,
        warning_enabled: next.warningEnabled,
        critical_enabled: next.criticalEnabled,
        stop_enabled: next.stopEnabled,
        stale_enabled: next.staleEnabled,
        member_left_enabled: next.memberLeftEnabled,
      },
      { onConflict: 'trip_id,user_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return mapPreferences(data);
};
