export type RouteMatchState = 'ON_ROUTE' | 'OFF_ROUTE' | 'LOCATION_INACTIVE' | 'ROUTE_UNAVAILABLE';

export interface TripRoutePoint {
  sequence: number;
  latitude: number;
  longitude: number;
  cumulativeDistanceMeters: number;
  sampledAt: number;
}

export interface MemberRouteStatus {
  userId: string;
  state: RouteMatchState;
  routeProgressMeters?: number;
  routeDistanceMeters?: number;
  leaderProgressMeters?: number;
  deltaMeters?: number;
  sampledAt?: number;
}
