import { MemberLocation, TripStop } from '../../types/location';
import { TripRoutePoint } from '../../types/route';
import { MemberNavigationStatus, PlannedRoute } from '../../types/navigation';

export type MapProvider = 'maplibre' | 'google';

export type CameraTarget = {
  latitude: number;
  longitude: number;
  zoom?: number;
};

export interface TripMapRef {
  animateToLocation: (lat: number, lng: number) => void;
}

export interface TripMapProps {
  locations: MemberLocation[];
  stops: TripStop[];
  routePoints?: TripRoutePoint[];
  routeLeaderUserId?: string;
  plannedRoute?: PlannedRoute | null;
  navigationStatuses?: MemberNavigationStatus[];
  userLocation: { lat: number; lng: number } | null;
  onMarkStop: (lat?: number, lng?: number) => void;
  allowMarkStop?: boolean;
  targetLat?: number;
  targetLng?: number;
  highlightStopId?: string;
  initialCamera?: CameraTarget;
  onCameraChange?: (camera: CameraTarget) => void;
  onMapLoaded?: () => void;
  onMapPress?: (lat: number, lng: number) => void;
  fillParent?: boolean;
}
