import { json, userClient } from '../_shared/client.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const scoped = userClient(authorization);
  const { data: { user }, error: userError } = await scoped.auth.getUser();
  if (userError || !user) return json({ error: 'Invalid session' }, 401);
  const payload = await request.json().catch(() => null);
  const tripId = String(payload?.tripId || '');
  const query = String(payload?.query || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(tripId) || query.length < 2 || query.length > 120) {
    return json({ error: 'Invalid search' }, 400);
  }
  const { data: membership } = await scoped.from('trip_members').select('role,trips!inner(status)')
    .eq('trip_id', tripId).eq('user_id', user.id).maybeSingle();
  if (!membership) return json({ error: 'Trip access denied' }, 403);
  if (membership.role !== 'organizer') return json({ error: 'Organizer required' }, 403);
  if (membership.trips.status === 'completed') return json({ error: 'Completed trip' }, 409);
  const geocodingBase = Deno.env.get('GEOCODING_BASE_URL');
  if (!geocodingBase) return json({ error: 'Place search is not configured', retryable: true }, 503);
  const url = new URL('/api', geocodingBase);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '8');
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    return json({ error: 'Place search unavailable', retryable: true }, 503);
  }
  if (!response.ok) return json({ error: 'Place search failed', retryable: response.status >= 500 }, 502);
  const body = await response.json().catch(() => null);
  const results = (Array.isArray(body?.features) ? body.features : []).slice(0, 8).flatMap((feature: any) => {
    const coordinates = feature?.geometry?.coordinates;
    const longitude = Number(coordinates?.[0]);
    const latitude = Number(coordinates?.[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];
    const properties = feature?.properties || {};
    const label = String(properties.name || properties.street || properties.city || 'Selected place').slice(0, 160);
    const detail = [properties.city, properties.state, properties.country].filter(Boolean).join(', ').slice(0, 200);
    return [{ id: String(properties.osm_id || `${latitude}:${longitude}`), label, detail, latitude, longitude }];
  });
  return json({ results });
});
