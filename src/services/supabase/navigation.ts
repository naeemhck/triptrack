import { supabase } from '../../config/supabase';
import {
  MemberNavigationStatus,
  PlaceSearchResult,
  PlannedRoute,
  PlannedRoutePoint,
  PlannedRouteStep,
  PlannedRouteWaypoint,
  RouteCoordinate,
  RoutePreview,
} from '../../types/navigation';
import { toMillis } from './mappers';

const mapPoint = (row: any): PlannedRoutePoint => ({
  sequence: row.sequence,
  latitude: row.latitude,
  longitude: row.longitude,
  cumulativeDistanceMeters: row.cumulative_distance_meters,
});

const mapWaypoint = (row: any): PlannedRouteWaypoint => ({
  id: row.id,
  sequence: row.sequence,
  title: row.title,
  latitude: row.latitude,
  longitude: row.longitude,
  radiusMeters: row.radius_meters,
  reachedAt: toMillis(row.reached_at),
});

const mapStep = (row: any): PlannedRouteStep => ({
  id: row.id,
  sequence: row.sequence,
  instruction: row.instruction,
  roadName: row.road_name,
  maneuverType: row.maneuver_type,
  maneuverModifier: row.maneuver_modifier || undefined,
  exitNumber: row.exit_number ?? undefined,
  latitude: row.latitude,
  longitude: row.longitude,
  progressMeters: row.progress_meters,
  distanceMeters: row.distance_meters,
  durationSeconds: row.duration_seconds,
});

export async function searchPlaces(tripId: string, query: string): Promise<PlaceSearchResult[]> {
  const { data, error } = await supabase.functions.invoke('search-places', {
    body: { tripId, query: query.trim() },
  });
  if (error) throw error;
  return (data?.results || []).map((item: any) => ({
    id: item.id,
    title: item.label,
    subtitle: item.detail || undefined,
    latitude: item.latitude,
    longitude: item.longitude,
  }));
}

export async function calculateRoute(
  tripId: string,
  origin: RouteCoordinate | null,
  destination: RouteCoordinate,
  waypoints: RouteCoordinate[],
): Promise<RoutePreview> {
  const { data, error } = await supabase.functions.invoke('calculate-route', {
    body: {
      tripId,
      origin: origin ? { ...origin, name: origin.title } : null,
      destination: { ...destination, name: destination.title },
      waypoints: waypoints.map((point) => ({ ...point, name: point.title })),
    },
  });
  if (error) throw error;
  return {
    origin: {
      latitude: data.origin.latitude,
      longitude: data.origin.longitude,
      title: data.origin.name || origin?.title || 'Route Leader location',
    },
    destination: {
      latitude: data.destination.latitude,
      longitude: data.destination.longitude,
      title: data.destination.name || destination.title || 'Destination',
    },
    geometryGeoJson: data.geometry,
    distanceMeters: data.distanceMeters,
    durationSeconds: data.durationSeconds,
    routingProvider: data.routingProvider,
    points: (data.points || []).map(mapPoint),
    waypoints: (data.waypoints || []).map((point: any) =>
      mapWaypoint({
        ...point,
        title: point.name || `Waypoint ${point.sequence}`,
        radius_meters: point.radius_meters || 75,
      }),
    ),
    steps: (data.steps || []).map(mapStep),
  };
}

export async function savePlannedRoute(tripId: string, route: RoutePreview): Promise<string> {
  const { data, error } = await supabase.rpc('save_trip_planned_route', {
    p_trip_id: tripId,
    p_origin_latitude: route.origin.latitude,
    p_origin_longitude: route.origin.longitude,
    p_origin_name: route.origin.title,
    p_destination_latitude: route.destination.latitude,
    p_destination_longitude: route.destination.longitude,
    p_destination_name: route.destination.title,
    p_geometry_geojson: route.geometryGeoJson,
    p_distance_meters: route.distanceMeters,
    p_duration_seconds: route.durationSeconds,
    p_routing_provider: route.routingProvider,
    p_points: route.points.map((point) => ({
      sequence: point.sequence,
      latitude: point.latitude,
      longitude: point.longitude,
      cumulative_distance_meters: point.cumulativeDistanceMeters,
    })),
    p_waypoints: route.waypoints.map((point, sequence) => ({
      sequence: sequence + 1,
      title: point.title,
      latitude: point.latitude,
      longitude: point.longitude,
      radius_meters: point.radiusMeters || 75,
    })),
    p_steps: route.steps.map((step) => ({
      sequence: step.sequence,
      instruction: step.instruction,
      road_name: step.roadName,
      maneuver_type: step.maneuverType,
      maneuver_modifier: step.maneuverModifier || null,
      exit_number: step.exitNumber || null,
      latitude: step.latitude,
      longitude: step.longitude,
      progress_meters: step.progressMeters,
      distance_meters: step.distanceMeters,
      duration_seconds: step.durationSeconds,
    })),
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getCurrentPlannedRoute(tripId: string): Promise<PlannedRoute | null> {
  const { data: route, error } = await supabase
    .from('trip_planned_routes')
    .select('*')
    .eq('trip_id', tripId)
    .eq('is_current', true)
    .maybeSingle();
  if (error) throw error;
  if (!route) return null;
  const [points, waypoints, steps] = await Promise.all([
    supabase
      .from('trip_planned_route_points')
      .select('*')
      .eq('route_id', route.id)
      .order('sequence'),
    supabase.from('trip_route_waypoints').select('*').eq('route_id', route.id).order('sequence'),
    supabase.from('trip_route_steps').select('*').eq('route_id', route.id).order('sequence'),
  ]);
  const childError = points.error || waypoints.error || steps.error;
  if (childError) throw childError;
  return {
    id: route.id,
    tripId: route.trip_id,
    version: route.version,
    isCurrent: route.is_current,
    origin: {
      latitude: route.origin_latitude,
      longitude: route.origin_longitude,
      title: route.origin_name,
    },
    destination: {
      latitude: route.destination_latitude,
      longitude: route.destination_longitude,
      title: route.destination_name,
    },
    distanceMeters: route.distance_meters,
    durationSeconds: route.duration_seconds,
    routingProvider: route.routing_provider,
    createdAt: toMillis(route.created_at) || Date.now(),
    points: (points.data || []).map(mapPoint),
    waypoints: (waypoints.data || []).map(mapWaypoint),
    steps: (steps.data || []).map(mapStep),
  };
}

export async function listNavigationStatuses(tripId: string): Promise<MemberNavigationStatus[]> {
  const { data, error } = await supabase
    .from('trip_member_navigation_status')
    .select('*')
    .eq('trip_id', tripId);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    tripId: row.trip_id,
    userId: row.user_id,
    routeId: row.route_id,
    state: row.navigation_state,
    progressMeters: row.planned_route_progress_meters ?? undefined,
    routeDistanceMeters: row.route_distance_meters ?? undefined,
    remainingDistanceMeters: row.remaining_distance_meters ?? undefined,
    nextStepSequence: row.next_step_sequence ?? undefined,
    speedMps: row.speed_mps ?? undefined,
    smoothedSpeedMps: row.smoothed_speed_mps ?? undefined,
    heading: row.heading ?? undefined,
    leaderSpeedDeltaMps: row.leader_speed_delta_mps ?? undefined,
    leaderDistanceDeltaMeters: row.leader_distance_delta_meters ?? undefined,
    estimatedArrivalAt: toMillis(row.estimated_arrival_at),
    speedTrustworthy: row.speed_trustworthy,
    speedDifferenceWarning: row.speed_difference_warning,
    fallingBehindPredicted: row.falling_behind_predicted,
    rerouteSuggested: row.reroute_suggested,
    sampledAt: toMillis(row.sampled_at),
  }));
}
