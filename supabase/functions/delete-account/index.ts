import { adminClient, json, userClient } from '../_shared/client.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const scoped = userClient(authorization);
  const { data: { user }, error: userError } = await scoped.auth.getUser();
  if (userError || !user) return json({ error: 'Invalid session' }, 401);

  const admin = adminClient();
  const { data: organizerRows } = await admin.from('trip_members').select('trip_id,trips!inner(status)').eq('user_id', user.id).eq('role', 'organizer');
  if ((organizerRows || []).some((row) => row.trips.status === 'active')) {
    return json({ error: 'End active trips you organize before deleting your account.' }, 409);
  }
  const { data: leaderTrip } = await admin.from('trips').select('id').eq('status', 'active')
    .eq('route_leader_user_id', user.id).limit(1).maybeSingle();
  if (leaderTrip) return json({ error: 'Transfer Route Leader before deleting your account.' }, 409);

  const deletedLabel = `Deleted Traveler ${user.id.slice(0, 6)}`;
  const steps = [
    admin.from('trip_locations').delete().eq('user_id', user.id),
    admin.from('push_tokens').delete().eq('user_id', user.id),
    admin.from('trip_members').delete().eq('user_id', user.id).eq('role', 'member'),
    admin.from('profiles').update({ display_name: deletedLabel, avatar_url: null }).eq('id', user.id),
  ];
  const results = await Promise.all(steps);
  if (results.some((result) => result.error)) return json({ error: 'Account cleanup was incomplete.' }, 500);

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
  if (authDeleteError) return json({ error: 'Authentication account deletion failed.' }, 500);
  return json({ success: true });
});
