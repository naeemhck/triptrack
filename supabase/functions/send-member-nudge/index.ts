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
  if (!eventId) return json({ error: 'Missing nudge event' }, 400);

  const admin = adminClient();
  const { data: event, error } = await admin
    .from('member_nudge_events')
    .select(
      'id,trip_id,from_user_id,to_user_id,created_at,' +
        'from_profile:profiles!member_nudge_events_from_user_id_fkey(display_name),' +
        'trips!inner(id,status)',
    )
    .eq('id', eventId)
    .single();
  if (error || !event) return json({ skipped: true });
  if (event.trips?.status !== 'active') return json({ skipped: true });

  // Recipient is the nudge target only; the sender is excluded by design.
  const { data: membership } = await admin
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', event.trip_id)
    .eq('user_id', event.to_user_id)
    .maybeSingle();
  if (!membership) return json({ skipped: true });

  const { data: preference } = await admin
    .from('trip_notification_preferences')
    .select('nudge_enabled')
    .eq('trip_id', event.trip_id)
    .eq('user_id', event.to_user_id)
    .maybeSingle();
  if (preference?.nudge_enabled === false) return json({ delivered: 0 });

  const { data: tokens } = await admin
    .from('push_tokens')
    .select('id,user_id,expo_push_token')
    .eq('user_id', event.to_user_id)
    .eq('enabled', true);
  const fromName = event.from_profile?.display_name || 'A trip member';
  let delivered = 0;

  for (const token of tokens || []) {
    const { data: claim } = await admin
      .from('notification_deliveries')
      .upsert(
        {
          event_type: 'member_nudge',
          event_id: event.id,
          recipient_user_id: token.user_id,
          status: 'claimed',
        },
        { onConflict: 'event_type,event_id,recipient_user_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();
    if (!claim) continue;
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          to: token.expo_push_token,
          title: 'Location check-in',
          body: `${fromName} is asking where you are. Share your location when you can.`,
          data: { tripId: event.trip_id, type: 'nudge', fromUserId: event.from_user_id },
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
