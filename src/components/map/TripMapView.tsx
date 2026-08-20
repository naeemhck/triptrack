import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  CameraRef,
  Callout,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
  SymbolLayer,
} from '@maplibre/maplibre-react-native';
import { colors } from '../../theme/colors';
import { getLocationFreshness } from '../../utils/locationFreshness';
import { TripMapProps, TripMapRef } from './mapTypes';
import { getMemberColor, getMemberInitials } from '../../utils/memberIdentity';

const stopIcon = (category?: string): React.ComponentProps<typeof Ionicons>['name'] => {
  if (category === 'lodging') return 'bed-outline';
  if (category === 'food') return 'restaurant-outline';
  if (category === 'viewpoint') return 'binoculars-outline';
  if (category === 'fuel') return 'car-outline';
  return 'flag-outline';
};

const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const GOOGLE_BLUE = '#1A73E8';

export const MapLibreTripMap = forwardRef<TripMapRef, TripMapProps>(
  (
    {
      locations,
      stops,
      routePoints = [],
      routeLeaderUserId,
      plannedRoute,
      navigationStatuses = [],
      userLocation,
      onMarkStop,
      allowMarkStop,
      targetLat,
      targetLng,
      highlightStopId,
      initialCamera,
      onCameraChange,
      onMapPress,
      fillParent,
    },
    ref,
  ) => {
    const cameraRef = useRef<CameraRef | null>(null);

    // Initial default map center (San Francisco fallback)
    const initialCenter: [number, number] = [
      initialCamera?.longitude ??
        userLocation?.lng ??
        targetLng ??
        (locations.length ? locations[0].lng : -122.4194),
      initialCamera?.latitude ??
        userLocation?.lat ??
        targetLat ??
        (locations.length ? locations[0].lat : 37.7749),
    ];

    // Expose imperative camera animation method
    useImperativeHandle(ref, () => ({
      animateToLocation: (lat: number, lng: number) => {
        cameraRef.current?.setCamera({
          centerCoordinate: [lng, lat],
          zoomLevel: 14,
          animationDuration: 1000,
        });
      },
    }));

    const cameraCenter: [number, number] =
      targetLat !== undefined && targetLng !== undefined
        ? [targetLng, targetLat]
        : locations.length === 1
          ? [locations[0].lng, locations[0].lat]
          : initialCenter;
    const cameraZoom =
      targetLat !== undefined && targetLng !== undefined ? 14 : locations.length === 1 ? 14 : 11;

    // Auto-fit only when there are multiple members to frame.
    useEffect(() => {
      if (targetLat === undefined && targetLng === undefined && locations.length > 1) {
        const lngs = locations.map((loc) => loc.lng);
        const lats = locations.map((loc) => loc.lat);
        const timer = setTimeout(() => {
          cameraRef.current?.fitBounds(
            [Math.max(...lngs), Math.max(...lats)],
            [Math.min(...lngs), Math.min(...lats)],
            60,
            800,
          );
        }, 800);
        return () => clearTimeout(timer);
      }
    }, [targetLat, targetLng, locations.length]);

    useEffect(() => {
      if (!plannedRoute || plannedRoute.points.length < 2) return;
      const lngs = plannedRoute.points.map((point) => point.longitude);
      const lats = plannedRoute.points.map((point) => point.latitude);
      const timer = setTimeout(() => {
        cameraRef.current?.fitBounds(
          [Math.max(...lngs), Math.max(...lats)],
          [Math.min(...lngs), Math.min(...lats)],
          fillParent ? 72 : 48,
          800,
        );
      }, 400);
      return () => clearTimeout(timer);
    }, [fillParent, plannedRoute?.id, plannedRoute?.points.length]);

    const handleCenterOnMe = () => {
      if (userLocation) {
        cameraRef.current?.setCamera({
          centerCoordinate: [userLocation.lng, userLocation.lat],
          zoomLevel: 13,
          animationDuration: 1000,
        });
      }
    };

    return (
      <View style={[styles.container, fillParent && styles.fillParent]}>
        <MapView
          style={styles.map}
          mapStyle={OPENFREEMAP_STYLE_URL}
          attributionEnabled
          logoEnabled={false}
          compassEnabled
          rotateEnabled
          pitchEnabled
          onRegionDidChange={(feature) => {
            const coordinates = (feature.geometry as { coordinates?: unknown[] } | undefined)
              ?.coordinates;
            if (Array.isArray(coordinates) && coordinates.length >= 2) {
              onCameraChange?.({
                longitude: Number(coordinates[0]),
                latitude: Number(coordinates[1]),
                zoom: feature.properties?.zoomLevel,
              });
            }
          }}
          onPress={(feature) => {
            const coordinates = (feature.geometry as { coordinates?: unknown[] } | undefined)
              ?.coordinates;
            if (onMapPress && Array.isArray(coordinates) && coordinates.length >= 2) {
              onMapPress(Number(coordinates[1]), Number(coordinates[0]));
            }
          }}
        >
          {plannedRoute && plannedRoute.points.length > 1 ? (
            <ShapeSource
              id="planned-route"
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: plannedRoute.points.map((point) => [
                    point.longitude,
                    point.latitude,
                  ]),
                },
              }}
            >
              <LineLayer
                id="planned-route-line"
                style={{ lineColor: GOOGLE_BLUE, lineWidth: 7, lineOpacity: 0.92 }}
              />
            </ShapeSource>
          ) : null}
          {routePoints.length > 1 ? (
            <ShapeSource
              id="canonical-route"
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: routePoints.map((point) => [point.longitude, point.latitude]),
                },
              }}
            >
              <LineLayer
                id="canonical-route-line"
                style={{ lineColor: colors.mapAccent, lineWidth: 5, lineOpacity: 0.88 }}
              />
              <SymbolLayer
                id="canonical-route-direction"
                style={{
                  symbolPlacement: 'line',
                  symbolSpacing: 90,
                  iconImage: 'oneway',
                  iconSize: 0.8,
                  iconRotationAlignment: 'map',
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                }}
              />
            </ShapeSource>
          ) : null}
          <Camera ref={cameraRef} centerCoordinate={cameraCenter} zoomLevel={cameraZoom} />
          {/* Member Location Markers */}
          {locations.map((loc, index) => {
            const freshness = getLocationFreshness(loc.updatedAt, loc.sharingEnabled !== false);
            const nearbyBefore = locations
              .slice(0, index)
              .filter(
                (other) =>
                  Math.abs(other.lat - loc.lat) < 0.00007 &&
                  Math.abs(other.lng - loc.lng) < 0.00007,
              ).length;
            const angle = nearbyBefore * 2.4;
            const coordinate: [number, number] = nearbyBefore
              ? [loc.lng + Math.cos(angle) * 0.000035, loc.lat + Math.sin(angle) * 0.000035]
              : [loc.lng, loc.lat];
            const isRouteLeader = loc.uid === routeLeaderUserId;
            const navigation = navigationStatuses.find((status) => status.userId === loc.uid);

            return (
              <PointAnnotation key={`loc_${loc.uid}`} id={`loc_${loc.uid}`} coordinate={coordinate}>
                <View
                  style={[
                    styles.memberMarker,
                    { borderColor: isRouteLeader ? colors.roleLeader : getMemberColor(loc.uid) },
                    freshness.state === 'delayed' && styles.delayedMarker,
                    (freshness.state === 'stale' || freshness.state === 'sharing_off') &&
                      styles.staleMarker,
                  ]}
                >
                  <View
                    style={[
                      styles.avatarCircle,
                      { backgroundColor: getMemberColor(loc.uid) },
                      isRouteLeader && styles.leaderAvatarCircle,
                      freshness.state === 'stale' && styles.staleAvatarCircle,
                      freshness.state === 'sharing_off' && styles.offAvatarCircle,
                    ]}
                  >
                    {getMemberInitials(loc.displayName) ? (
                      <Text style={styles.avatarInitial}>{getMemberInitials(loc.displayName)}</Text>
                    ) : (
                      <Ionicons name="person" size={13} color="#FFF" />
                    )}
                  </View>
                  <View
                    style={[
                      styles.freshnessDot,
                      freshness.state === 'fresh'
                        ? styles.freshDot
                        : freshness.state === 'delayed'
                          ? styles.delayDot
                          : styles.offDot,
                    ]}
                  />
                  {navigation?.speedTrustworthy && navigation.smoothedSpeedMps != null ? (
                    <Text style={styles.speedBadge}>
                      {Math.round(navigation.smoothedSpeedMps * 3.6)} km/h
                    </Text>
                  ) : null}
                </View>

                <Callout style={styles.callout}>
                  <View style={styles.calloutContainer}>
                    <Text style={styles.calloutTitle}>{loc.displayName || 'Traveler'}</Text>
                    <Text style={styles.calloutSub}>
                      {freshness.state === 'fresh'
                        ? `🟢 ${freshness.label}`
                        : freshness.state === 'delayed'
                          ? `🟡 ${freshness.label}`
                          : freshness.state === 'sharing_off'
                            ? `⚪ ${freshness.label}`
                            : `⌛ ${freshness.label}`}
                    </Text>
                  </View>
                </Callout>
              </PointAnnotation>
            );
          })}

          {plannedRoute?.waypoints.map((waypoint) => (
            <PointAnnotation
              key={`waypoint_${waypoint.sequence}`}
              id={`waypoint_${waypoint.sequence}`}
              coordinate={[waypoint.longitude, waypoint.latitude]}
            >
              <View
                style={[
                  styles.stopMarker,
                  { backgroundColor: waypoint.reachedAt ? colors.success : '#3B82F6' },
                ]}
              >
                <Text style={styles.avatarInitial}>{waypoint.sequence}</Text>
              </View>
            </PointAnnotation>
          ))}
          {plannedRoute &&
          (Math.abs(plannedRoute.origin.latitude - plannedRoute.destination.latitude) > 0.00001 ||
            Math.abs(plannedRoute.origin.longitude - plannedRoute.destination.longitude) >
              0.00001) ? (
            <PointAnnotation
              id="planned-origin"
              coordinate={[plannedRoute.origin.longitude, plannedRoute.origin.latitude]}
            >
              <View style={[styles.stopMarker, { backgroundColor: '#34A853' }]}>
                <Ionicons name="navigate" size={16} color="#FFF" />
              </View>
            </PointAnnotation>
          ) : null}
          {plannedRoute ? (
            <PointAnnotation
              id="planned-destination"
              coordinate={[plannedRoute.destination.longitude, plannedRoute.destination.latitude]}
            >
              <View style={[styles.stopMarker, { backgroundColor: '#EA4335' }]}>
                <Ionicons name="flag" size={18} color="#FFF" />
              </View>
            </PointAnnotation>
          ) : null}

          {/* Marked Stop Markers */}
          {stops.map((stop) => {
            const isHighlighted = highlightStopId === stop.id;
            const isAuto = stop.autoDetected || stop.type === 'auto';

            return (
              <PointAnnotation
                key={`stop_${stop.id}`}
                id={`stop_${stop.id}`}
                coordinate={[stop.lng, stop.lat]}
              >
                <View
                  style={[
                    styles.stopMarker,
                    isAuto && styles.autoStopMarker,
                    isHighlighted && styles.highlightedStopMarker,
                  ]}
                >
                  <Ionicons
                    name={isAuto ? 'timer-outline' : stopIcon(stop.category)}
                    size={19}
                    color="#FFF"
                  />
                </View>

                <Callout style={styles.stopCallout}>
                  <View style={styles.stopCalloutContainer}>
                    <Text style={styles.stopCalloutTitle}>{stop.name}</Text>

                    {stop.photoUrl ? (
                      <Image source={{ uri: stop.photoUrl }} style={styles.stopCalloutImage} />
                    ) : null}

                    {stop.note ? <Text style={styles.stopCalloutNote}>{stop.note}</Text> : null}

                    <Text style={styles.stopCalloutMeta}>
                      {isAuto ? 'Automatic stop' : `Added by ${stop.displayName}`} ·{' '}
                      {new Date(stop.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </Callout>
              </PointAnnotation>
            );
          })}
        </MapView>

        {/* Floating Action Controls */}
        <View style={[styles.fabControls, fillParent && styles.fabRaised]}>
          {/* Center on Me FAB */}
          <TouchableOpacity style={styles.fabButton} onPress={handleCenterOnMe}>
            <Ionicons name="locate-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Mark a Stop FAB */}
          {allowMarkStop !== false ? (
            <TouchableOpacity
              style={[styles.fabButton, styles.fabMarkStop]}
              onPress={() => onMarkStop(userLocation?.lat, userLocation?.lng)}
            >
              <Ionicons name="flag-outline" size={18} color="#FFF" />
              <Text style={styles.fabLabel}>Mark Stop</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  },
);

MapLibreTripMap.displayName = 'MapLibreTripMap';

const styles = StyleSheet.create({
  speedBadge: {
    position: 'absolute',
    top: 34,
    minWidth: 48,
    textAlign: 'center',
    color: '#FFF',
    backgroundColor: colors.surface,
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  container: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    borderColor: colors.border,
    borderWidth: 1,
    marginVertical: 12,
    position: 'relative',
  },
  fillParent: {
    flex: 1,
    height: undefined,
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
    marginVertical: 0,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  memberMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderColor: colors.primary,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  staleMarker: {
    borderColor: colors.textMuted,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
  },
  delayedMarker: {
    borderColor: colors.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  leaderAvatarCircle: { borderWidth: 2, borderColor: colors.roleLeader },
  delayedAvatarCircle: {
    backgroundColor: colors.warning,
  },
  staleAvatarCircle: {
    backgroundColor: '#64748B',
  },
  offAvatarCircle: {
    backgroundColor: '#475569',
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  markerNameBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    maxWidth: 90,
  },
  freshnessDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  freshDot: { backgroundColor: colors.success },
  delayDot: { backgroundColor: colors.warning },
  offDot: { backgroundColor: colors.inactive },
  stopMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F59E0B',
    borderColor: '#FFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoStopMarker: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondaryLight,
  },
  highlightedStopMarker: {
    borderColor: colors.primaryLight,
    borderWidth: 3,
    transform: [{ scale: 1.2 }],
  },
  stopIcon: {
    fontSize: 18,
  },
  callout: {
    width: 180,
  },
  calloutContainer: {
    padding: 6,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.background,
  },
  calloutSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  stopCallout: {
    width: 200,
  },
  stopCalloutContainer: {
    padding: 6,
  },
  stopCalloutTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.background,
    marginBottom: 4,
  },
  stopCalloutImage: {
    width: '100%',
    height: 90,
    borderRadius: 6,
    marginVertical: 4,
  },
  stopCalloutNote: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 4,
  },
  stopCalloutMeta: {
    fontSize: 10,
    color: colors.textMuted,
  },
  fabControls: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  fabRaised: {
    bottom: 168,
  },
  fabButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabMarkStop: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  fabIcon: {
    fontSize: 16,
  },
  fabLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
});
