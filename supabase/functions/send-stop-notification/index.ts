import { adminClient, json } from '../_shared/client.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const webhookSecret = Deno.env.get('DATABASE_WEBHOOK_SECRET');
  if (!webhookSecret || request.headers.get('x-triptrack-webhook-secret') !== webhookSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const payload = await request.json();
  const stopId = payload?.record?.id;
  if (!stopId) return json({ error: 'Missing stop record' }, 400);

  const admin = adminClient();
  const { data: stop, error: stopError } = await admin.from('trip_stops')
    .select('id,trip_id,user_id,title,latitude,longitude,trips!inner(status)')
    .eq('id', stopId).single();
  if (stopError || !stop || stop.trips.status !== 'active') return json({ skipped: true });

  const { data: members } = await admin.from('trip_members').select('user_id')
    .eq('trip_id', stop.trip_id).neq('user_id', stop.user_id);
  const memberIds = (members || []).map((member) => member.user_id);
  const preferenceResult = memberIds.length ? await admin.from('trip_notification_preferences')
    .select('user_id,stop_enabled').eq('trip_id', stop.trip_id).in('user_id', memberIds) : { data: [], error: null };
  if (preferenceResult.error) return json({ error: 'Preference query failed' }, 500);
  const preferences = preferenceResult.data;
  const disabledIds = new Set((preferences || []).filter((row) => row.stop_enabled === false).map((row) => row.user_id));
  const recipientIds = memberIds.filter((userId) => !disabledIds.has(userId));
  if (recipientIds.length === 0) return json({ delivered: 0 });

  const { data: tokens } = await admin.from('push_tokens')
    .select('id,user_id,expo_push_token').in('user_id', recipientIds).eq('enabled', true);
  let delivered = 0;

  for (const token of tokens || []) {
    const { data: claim, error: claimError } = await admin.from('notification_deliveries').upsert({
      event_type: 'stop_created', event_id: stop.id, recipient_user_id: token.user_id, status: 'claimed',
    }, { onConflict: 'event_type,event_id,recipient_user_id', ignoreDuplicates: true }).select('id').maybeSingle();
    if (claimError || !claim) continue;

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          to: token.expo_push_token,
          title: 'Trip stop added',
          body: stop.title,
          data: { tripId: stop.trip_id, stopId: stop.id, lat: stop.latitude, lng: stop.longitude },
        }),
      });
      const result = await response.json();
      const ticket = result?.data;
      if (!response.ok || ticket?.status === 'error') {
        const code = ticket?.details?.error || 'ExpoPushError';
        await admin.from('notification_deliveries').update({ status: 'failed', error_code: code }).eq('id', claim.id);
        if (code === 'DeviceNotRegistered') await admin.from('push_tokens').update({ enabled: false }).eq('id', token.id);
        continue;
      }
      await admin.from('notification_deliveries').update({ status: 'sent', expo_ticket_id: ticket?.id, sent_at: new Date().toISOString() }).eq('id', claim.id);
      delivered += 1;
    } catch {
      await admin.from('notification_deliveries').update({ status: 'failed', error_code: 'NetworkError' }).eq('id', claim.id);
    }
  }
  return json({ delivered });
});
