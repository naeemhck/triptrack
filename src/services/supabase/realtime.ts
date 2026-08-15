import { supabase } from '../../config/supabase';

export type RealtimeTripTable =
  | 'trip_members'
  | 'trip_locations'
  | 'trip_stops'
  | 'trip_routes'
  | 'trip_route_points'
  | 'trip_member_route_status'
  | 'lag_alert_events'
  | 'stale_alert_episodes'
  | 'trip_member_events';

export function subscribeToTripTable(
  table: RealtimeTripTable,
  tripId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`${table}:${tripId}:${Math.random()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `trip_id=eq.${tripId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
