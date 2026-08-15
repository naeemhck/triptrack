import { adminClient, json } from '../_shared/client.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expectedSecret = Deno.env.get('DATABASE_WEBHOOK_SECRET');
  if (!expectedSecret || request.headers.get('x-triptrack-webhook-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const payload = await request.json().catch(() => null);
  const eventId = payload?.record?.id;
  if (!eventId) return json({ error: 'Missing alert event' }, 400);

  const admin = adminClient();
  const { data: event, error } = await admin.from('lag_alert_events')
    .select('id,trip_id,user_id,level,behind_meters,trips!inner(status),profiles!lag_alert_events_user_id_fkey(display_name)')
    .eq('id', eventId).single();
  if (error || !event || event.trips.status !== 'active') return json({ skipped: true });

  const { data: membership } = await admin.from('trip_members').select('user_id')
    .eq('trip_id', event.trip_id).eq('user_id', event.user_id).maybeSingle();
  if (!membership) return json({ skipped: true });

  const { data: members } = await admin.from('trip_members').select('user_id')
    .eq('trip_id', event.trip_id).neq('user_id', event.user_id);
  const memberIds = (members || []).map((member) => member.user_id);
  const preferenceColumn = event.level === 'critical' ? 'critical_enabled' : 'warning_enabled';
  const preferenceResult = memberIds.length ? await admin.from('trip_notification_preferences')
    .select(`user_id,${preferenceColumn}`).eq('trip_id', event.trip_id).in('user_id', memberIds) : { data: [], error: null };
  if (preferenceResult.error) return json({ error: 'Preference query failed' }, 500);
  const preferences = preferenceResult.data;
  const disabledIds = new Set((preferences || []).filter((row: any) => row[preferenceColumn] === false).map((row) => row.user_id));
  const recipientIds = memberIds.filter((userId) => !disabledIds.has(userId));
  if (!recipientIds.length) return json({ delivered: 0 });
  const { data: tokens } = await admin.from('push_tokens').select('id,user_id,expo_push_token')
    .in('user_id', recipientIds).eq('enabled', true);
  const name = event.profiles?.display_name || 'A trip member';
  const title = event.level === 'critical' ? `${name} is far behind` : `${name} is falling behind`;
  const body = event.level === 'critical'
    ? `${name} is now ${event.behind_meters} m behind the Route Leader.`
    : `${name} is ${event.behind_meters} m behind the Route Leader.`;
  let delivered = 0;

  for (const token of tokens || []) {
    const { data: claim } = await admin.from('notification_deliveries').upsert({
      event_type: `route_lag_${event.level}`, event_id: event.id,
      recipient_user_id: token.user_id, status: 'claimed',
    }, { onConflict: 'event_type,event_id,recipient_user_id', ignoreDuplicates: true }).select('id').maybeSingle();
    if (!claim) continue;
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ to: token.expo_push_token, title, body,
          data: { tripId: event.trip_id, lagUserId: event.user_id, level: event.level } }),
      });
      const result = await response.json();
      const ticket = result?.data;
      if (!response.ok || ticket?.status === 'error') {
        const code = ticket?.details?.error || 'ExpoPushError';
        await admin.from('notification_deliveries').update({ status: 'failed', error_code: code }).eq('id', claim.id);
        if (code === 'DeviceNotRegistered') await admin.from('push_tokens').update({ enabled: false }).eq('id', token.id);
        continue;
      }
      await admin.from('notification_deliveries').update({ status: 'sent', expo_ticket_id: ticket?.id,
        sent_at: new Date().toISOString() }).eq('id', claim.id);
      delivered += 1;
    } catch {
      await admin.from('notification_deliveries').update({ status: 'failed', error_code: 'NetworkError' }).eq('id', claim.id);
    }
  }
  return json({ delivered });
});
