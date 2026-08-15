import { adminClient, json } from '../_shared/client.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return json({ error: 'Unauthorized' }, 401);
  const admin = adminClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const { data: locations, error } = await admin.from('trip_locations')
    .select('trip_id,user_id,sampled_at,trip_members!inner(sharing_enabled,sharing_expires_at),trips!inner(status)')
    .lt('sampled_at', cutoff).eq('trip_members.sharing_enabled', true)
    .or(`sharing_expires_at.is.null,sharing_expires_at.gt.${now}`, { referencedTable: 'trip_members' })
    .eq('trips.status', 'active');
  if (error) return json({ error: 'Query failed' }, 500);

  let episodesCreated = 0;
  let delivered = 0;
  for (const location of locations || []) {
    const { data: current } = await admin.from('trip_locations')
      .select('trip_id,user_id,sampled_at,trip_members!inner(sharing_enabled,sharing_expires_at),trips!inner(status)')
      .eq('trip_id', location.trip_id).eq('user_id', location.user_id)
      .eq('trip_members.sharing_enabled', true).eq('trips.status', 'active')
      .or(`sharing_expires_at.is.null,sharing_expires_at.gt.${now}`, { referencedTable: 'trip_members' })
      .lt('sampled_at', cutoff).maybeSingle();
    if (!current || current.sampled_at !== location.sampled_at) continue;

    const episodeId = `${location.trip_id}:${location.user_id}:${location.sampled_at}`;
    const { data: episode } = await admin.from('stale_alert_episodes').upsert({
      id: episodeId, trip_id: location.trip_id, stale_user_id: location.user_id, sampled_at: location.sampled_at,
    }, { onConflict: 'id', ignoreDuplicates: true }).select('id').maybeSingle();
    if (episode) episodesCreated += 1;

    const { data: members } = await admin.from('trip_members').select('user_id')
      .eq('trip_id', location.trip_id).neq('user_id', location.user_id);
    const memberIds = (members || []).map((member) => member.user_id);
    const preferenceResult = memberIds.length ? await admin.from('trip_notification_preferences')
      .select('user_id,stale_enabled').eq('trip_id', location.trip_id).in('user_id', memberIds) : { data: [], error: null };
    if (preferenceResult.error) return json({ error: 'Preference query failed' }, 500);
    const preferences = preferenceResult.data;
    const disabledIds = new Set((preferences || []).filter((row) => row.stale_enabled === false).map((row) => row.user_id));
    const recipientIds = memberIds.filter((userId) => !disabledIds.has(userId));
    if (recipientIds.length === 0) continue;

    const { data: tokens } = await admin.from('push_tokens')
      .select('id,user_id,expo_push_token').in('user_id', recipientIds).eq('enabled', true);
    for (const token of tokens || []) {
      const { data: claim, error: claimError } = await admin.from('notification_deliveries').upsert({
        event_type: 'location_stale', event_id: episodeId,
        recipient_user_id: token.user_id, status: 'claimed',
      }, { onConflict: 'event_type,event_id,recipient_user_id', ignoreDuplicates: true }).select('id').maybeSingle();
      if (claimError || !claim) continue;

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            to: token.expo_push_token,
            title: 'Location update delayed',
            body: 'A trip member has not shared a recent location.',
            data: { tripId: location.trip_id, staleUserId: location.user_id },
          }),
        });
        const result = await response.json();
        const ticket = result?.data;
        if (!response.ok || ticket?.status === 'error') {
          const code = ticket?.details?.error || 'ExpoPushError';
          await admin.from('notification_deliveries').update({ status: 'failed', error_code: code }).eq('id', claim.id);
          if (code === 'DeviceNotRegistered') {
            await admin.from('push_tokens').update({ enabled: false }).eq('id', token.id);
          }
          continue;
        }
        await admin.from('notification_deliveries').update({
          status: 'sent', expo_ticket_id: ticket?.id, sent_at: new Date().toISOString(),
        }).eq('id', claim.id);
        delivered += 1;
      } catch {
        await admin.from('notification_deliveries').update({ status: 'failed', error_code: 'NetworkError' }).eq('id', claim.id);
      }
    }
  }
  return json({ episodesCreated, delivered });
});
