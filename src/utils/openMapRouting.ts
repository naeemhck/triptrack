import { PlaceSearchResult, RouteCoordinate, RoutePreview } from '../types/navigation';

export const PUBLIC_OSRM_BASE_URL = 'https://router.project-osrm.org';
export const PUBLIC_PHOTON_BASE_URL = 'https://photon.komoot.io';

const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'TripTrack/2.0',
};

type LonLat = [number, number];

const finiteCoordinate = (value: unknown): value is RouteCoordinate => {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as RouteCoordinate;
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
};

const distanceMeters = (a: number[], b: number[]) => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b[1] - a[1]);
  const dLng = radians(b[0] - a[0]);
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
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

const routingFailureText = (error: unknown, data: unknown): string => {
  const parts = [error, data].flatMap((value) => {
    if (!value) return [];
    if (typeof value === 'string') return [value];
    if (typeof value === 'object') {
      const record = value as { message?: unknown; error?: unknown; context?: unknown };
      return [record.message, record.error, record.context].map((item) =>
        item == null ? '' : typeof item === 'string' ? item : JSON.stringify(item),
      );
    }
    return [String(value)];
  });
  return parts.join(' ').toLowerCase();
};

export const shouldUsePublicRoutingFallback = (error: unknown, data: unknown): boolean => {
  const text = routingFailureText(error, data);
  return (
    text.includes('not configured') ||
    text.includes('unavailable') ||
    text.includes('failed to send') ||
    text.includes('failed to fetch') ||
    text.includes('network request failed') ||
    text.includes('"status":503') ||
    text.includes('status code 503')
  );
};

export async function searchPublicPlaces(query: string): Promise<PlaceSearchResult[]> {
  const url = new URL('/api', PUBLIC_PHOTON_BASE_URL);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', '8');
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Place search is temporarily unavailable. Try again.');
  const body = await response.json().catch(() => null);
  return (Array.isArray(body?.features) ? body.features : [])
    .slice(0, 8)
    .flatMap((feature: any) => {
      const coordinates = feature?.geometry?.coordinates;
      const longitude = Number(coordinates?.[0]);
      const latitude = Number(coordinates?.[1]);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return [];
      }
      const properties = feature?.properties || {};
      const title = String(
        properties.name || properties.street || properties.city || 'Selected place',
      ).slice(0, 160);
      const subtitle = [properties.city, properties.state, properties.country]
        .filter(Boolean)
        .join(', ')
        .slice(0, 200);
      return [
        {
          id: String(properties.osm_id || `${latitude}:${longitude}`),
          title,
          subtitle: subtitle || undefined,
          latitude,
          longitude,
        },
      ];
    });
}

export async function calculatePublicRoute(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  waypoints: RouteCoordinate[] = [],
): Promise<RoutePreview> {
  if (!finiteCoordinate(origin) || !finiteCoordinate(destination)) {
    throw new Error('Pin a valid origin and destination to calculate a route.');
  }
  if (waypoints.length > 8 || !waypoints.every(finiteCoordinate)) {
    throw new Error('A route supports up to eight valid waypoints.');
  }

  const ordered = [origin, ...waypoints, destination];
  const coordinatePath = ordered.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const url = new URL(`/route/v1/driving/${coordinatePath}`, PUBLIC_OSRM_BASE_URL);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('annotations', 'false');

  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error('The routing service could not calculate this route. Try again.');
  const provider = await response.json().catch(() => null);
  const route = provider?.routes?.[0];
  const coordinates = route?.geometry?.coordinates as LonLat[] | undefined;
  if (
    provider?.code !== 'Ok' ||
    !route ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > 10000
  ) {
    throw new Error('No driving route was found between these points. Move a pin and try again.');
  }

  let cumulative = 0;
  const points = coordinates.map((point, sequence) => {
    if (sequence > 0) cumulative += distanceMeters(coordinates[sequence - 1], point);
    return {
      sequence,
      latitude: point[1],
      longitude: point[0],
      cumulativeDistanceMeters: cumulative,
    };
  });
  let stepProgress = 0;
  let stepSequence = 0;
  const steps = (route.legs || [])
    .flatMap((leg: any) =>
      (leg.steps || []).map((step: any) => {
        const location = step?.maneuver?.location;
        const result = {
          sequence: stepSequence++,
          instruction: instructionFor(step).slice(0, 300),
          roadName: String(step?.name || '').slice(0, 160),
          maneuverType: String(step?.maneuver?.type || 'continue').slice(0, 40),
          maneuverModifier: step?.maneuver?.modifier
            ? String(step.maneuver.modifier).slice(0, 40)
            : undefined,
          exitNumber: Number(step?.maneuver?.exit) > 0 ? Number(step.maneuver.exit) : undefined,
          latitude: Number(location?.[1]),
          longitude: Number(location?.[0]),
          progressMeters: stepProgress,
          distanceMeters: Number(step?.distance || 0),
          durationSeconds: Number(step?.duration || 0),
        };
        stepProgress += result.distanceMeters;
        return result;
      }),
    )
    .filter(
      (step: { latitude: number; longitude: number }) =>
        Number.isFinite(step.latitude) && Number.isFinite(step.longitude),
    );

  return {
    origin: {
      latitude: origin.latitude,
      longitude: origin.longitude,
      title: origin.title || 'Origin',
    },
    destination: {
      latitude: destination.latitude,
      longitude: destination.longitude,
      title: destination.title || 'Destination',
    },
    geometryGeoJson: { type: 'LineString', coordinates },
    distanceMeters: Number(route.distance),
    durationSeconds: Number(route.duration),
    routingProvider: 'osrm',
    points,
    waypoints: waypoints.map((point, index) => ({
      sequence: index + 1,
      title: point.title || `Waypoint ${index + 1}`,
      latitude: point.latitude,
      longitude: point.longitude,
      radiusMeters: 75,
    })),
    steps,
  };
}
