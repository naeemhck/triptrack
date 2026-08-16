export type NavigationState =
  | 'ON_ROUTE'
  | 'FALLING_BEHIND'
  | 'AHEAD'
  | 'STOPPED'
  | 'OFF_ROUTE'
  | 'LOCATION_STALE'
  | 'ROUTE_UNAVAILABLE';

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
  title?: string;
}

export interface PlaceSearchResult extends RouteCoordinate {
  id: string;
  title: string;
  subtitle?: string;
}

export interface PlannedRoutePoint extends RouteCoordinate {
  sequence: number;
  cumulativeDistanceMeters: number;
}

export interface PlannedRouteWaypoint extends RouteCoordinate {
  id?: string;
  sequence: number;
  title: string;
  radiusMeters: number;
  reachedAt?: number;
}

export interface PlannedRouteStep extends RouteCoordinate {
  id?: string;
  sequence: number;
  instruction: string;
  roadName: string;
  maneuverType: string;
  maneuverModifier?: string;
  exitNumber?: number;
  progressMeters: number;
  distanceMeters: number;
  durationSeconds: number;
}

export interface PlannedRoute {
  id: string;
  tripId: string;
  version: number;
  isCurrent: boolean;
  origin: RouteCoordinate & { title: string };
  destination: RouteCoordinate & { title: string };
  distanceMeters: number;
  durationSeconds: number;
  routingProvider: string;
  createdAt: number;
  points: PlannedRoutePoint[];
  waypoints: PlannedRouteWaypoint[];
  steps: PlannedRouteStep[];
}

export interface RoutePreview extends Omit<
  PlannedRoute,
  'id' | 'tripId' | 'version' | 'isCurrent' | 'createdAt'
> {
  geometryGeoJson: { type: 'LineString'; coordinates: [number, number][] };
}

export interface MemberNavigationStatus {
  tripId: string;
  userId: string;
  routeId: string;
  state: NavigationState;
  progressMeters?: number;
  routeDistanceMeters?: number;
  remainingDistanceMeters?: number;
  nextStepSequence?: number;
  speedMps?: number;
  smoothedSpeedMps?: number;
  heading?: number;
  leaderSpeedDeltaMps?: number;
  leaderDistanceDeltaMeters?: number;
  estimatedArrivalAt?: number;
  speedTrustworthy: boolean;
  speedDifferenceWarning: boolean;
  fallingBehindPredicted: boolean;
  rerouteSuggested: boolean;
  sampledAt?: number;
}

export type ConvoyGuidance = 'Hold pace' | 'Ease pace' | 'Regroup';
