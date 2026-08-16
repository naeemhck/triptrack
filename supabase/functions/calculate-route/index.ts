import { json, userClient } from '../_shared/client.ts';

type Coordinate = { latitude: number; longitude: number; name?: string };

const finiteCoordinate = (value: unknown): value is Coordinate => {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as Coordinate;
  return Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 && coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 && coordinate.longitude <= 180;
};

const instructionFor = (step: any) => {
  const maneuver = step?.maneuver || {};
  const type = String(maneuver.type || 'continue').replaceAll('_', ' ');
  const modifier = String(maneuver.modifier || '').replaceAll('_', ' ');
  const road = String(step?.name || '').trim();
  if (type === 'arrive') return `Arrive${road ? ` at ${road}` : ' at the destination'}`;
  if (type === 'depart') return `Depart${road ? ` on ${road}` : ''}`;
  if (type === 'roundabout' || type === 'rotary') {
    const exit = Number(maneuver.exit);
    return `Enter the roundabout${exit > 0 ? ` and take exit ${exit}` : ''}${road ? ` onto ${road}` : ''}`;
  }
  const action = modifier ? `${type} ${modifier}` : type;
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}${road ? ` onto ${road}` : ''}`;
};

const distanceMeters = (a: number[], b: number[]) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b[1] - a[1]);
  const dLng = radians(b[0] - a[0]);
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const scoped = userClient(authorization);
  const { data: { user }, error: userError } = await scoped.auth.getUser();
  if (userError || !user) return json({ error: 'Invalid session' }, 401);

  const payload = await request.json().catch(() => null);
  const tripId = String(payload?.tripId || '');
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) return json({ error: 'Invalid trip' }, 400);
  const { data: membership, error: membershipError } = await scoped
    .from('trip_members')
    .select('role,trips!inner(status,route_leader_user_id)')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .single();
  if (membershipError || !membership) return json({ error: 'Trip access denied' }, 403);
  if (membership.role !== 'organizer') return json({ error: 'Organizer required' }, 403);
  if (membership.trips.status === 'completed') return json({ error: 'Completed trip' }, 409);

  let origin: Coordinate | null = finiteCoordinate(payload?.origin) ? payload.origin : null;
  const destination: Coordinate | null = finiteCoordinate(payload?.destination) ? payload.destination : null;
  const waypoints: Coordinate[] = Array.isArray(payload?.waypoints) ? payload.waypoints : [];
  if (!destination || waypoints.length > 8 || !waypoints.every(finiteCoordinate)) {
    return json({ error: 'Invalid destination or waypoints' }, 400);
  }
  if (!origin) {
    const leaderId = membership.trips.route_leader_user_id;
    if (!leaderId) return json({ error: 'Choose an origin or assign a Route Leader' }, 400);
    const { data: leaderLocation } = await scoped.from('trip_locations')
      .select('latitude,longitude,sampled_at').eq('trip_id', tripId).eq('user_id', leaderId)
      .gte('sampled_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()).maybeSingle();
    if (!leaderLocation) return json({ error: 'Route Leader needs a fresh location or a pinned origin' }, 409);
    origin = { latitude: leaderLocation.latitude, longitude: leaderLocation.longitude, name: 'Route Leader location' };
  }

  const routingBase = Deno.env.get('ROUTING_BASE_URL');
  if (!routingBase) return json({ error: 'Routing service is not configured', retryable: true }, 503);
  const ordered = [origin, ...waypoints, destination];
  const coordinatePath = ordered.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const url = new URL(`/route/v1/driving/${coordinatePath}`, routingBase);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('annotations', 'false');

  let providerResponse: Response;
  try {
    providerResponse = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch {
    return json({ error: 'Routing service unavailable', retryable: true }, 503);
  }
  if (!providerResponse.ok) return json({ error: 'Routing service rejected the request', retryable: providerResponse.status >= 500 }, 502);
  const provider = await providerResponse.json().catch(() => null);
  const route = provider?.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (provider?.code !== 'Ok' || !route || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 10000) {
    return json({ error: 'No usable driving route was found' }, 422);
  }
  if (!coordinates.every((point: unknown) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))) {
    return json({ error: 'Routing service returned invalid geometry' }, 502);
  }

  let cumulative = 0;
  const points = coordinates.map((point: number[], sequence: number) => {
    if (sequence > 0) cumulative += distanceMeters(coordinates[sequence - 1], point);
    return { sequence, latitude: point[1], longitude: point[0], cumulative_distance_meters: cumulative };
  });
  let stepProgress = 0;
  let stepSequence = 0;
  const steps = (route.legs || []).flatMap((leg: any) => (leg.steps || []).map((step: any) => {
    const location = step?.maneuver?.location;
    const result = {
      sequence: stepSequence++,
      instruction: instructionFor(step).slice(0, 300),
      road_name: String(step?.name || '').slice(0, 160),
      maneuver_type: String(step?.maneuver?.type || 'continue').slice(0, 40),
      maneuver_modifier: step?.maneuver?.modifier ? String(step.maneuver.modifier).slice(0, 40) : null,
      exit_number: Number(step?.maneuver?.exit) > 0 ? Number(step.maneuver.exit) : null,
      latitude: Number(location?.[1]),
      longitude: Number(location?.[0]),
      progress_meters: stepProgress,
      distance_meters: Number(step?.distance || 0),
      duration_seconds: Number(step?.duration || 0),
    };
    stepProgress += result.distance_meters;
    return result;
  })).filter((step: any) => Number.isFinite(step.latitude) && Number.isFinite(step.longitude));

  return json({
    origin,
    destination,
    waypoints: waypoints.map((point, index) => ({ ...point, sequence: index + 1, radius_meters: 75 })),
    geometry: { type: 'LineString', coordinates },
    points,
    steps,
    distanceMeters: Number(route.distance),
    durationSeconds: Number(route.duration),
    routingProvider: 'osrm',
  });
});
