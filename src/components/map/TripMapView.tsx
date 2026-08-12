import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import MapView, { Marker, Callout, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { colors } from '../../theme/colors';
import { MemberLocation, TripStop } from '../../types/location';
import { getLocationFreshness } from '../../utils/locationFreshness';

/**
 * GOOGLE MAPS BILLING SAFETY NOTICE:
 * Google Maps Essentials tier provides 10,000 free map loads/month per-SKU.
 * Set up a spending budget alert in Google Cloud Console (Billing -> Budgets & alerts)
 * as the primary safety net against unexpected usage.
 * 
 * EXPO GO vs DEV BUILD NOTICE:
 * `react-native-maps` with `PROVIDER_GOOGLE` requires a Development Build (`npx expo run:ios/android`)
 * to render full native Google Maps. In Expo Go, fallback map provider is used.
 */

export interface TripMapViewRef {
  animateToLocation: (lat: number, lng: number) => void;
}

interface TripMapViewProps {
  locations: MemberLocation[];
  stops: TripStop[];
  userLocation: { lat: number; lng: number } | null;
  onMarkStop: (lat?: number, lng?: number) => void;
  targetLat?: number;
  targetLng?: number;
  highlightStopId?: string;
}

export const TripMapView = forwardRef<TripMapViewRef, TripMapViewProps>(
  ({ locations, stops, userLocation, onMarkStop, targetLat, targetLng, highlightStopId }, ref) => {
    const mapRef = useRef<MapView | null>(null);

    // Initial default map center (San Francisco fallback)
    const initialRegion: Region = {
      latitude: userLocation?.lat || targetLat || (locations.length ? locations[0].lat : 37.7749),
      longitude: userLocation?.lng || targetLng || (locations.length ? locations[0].lng : -122.4194),
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };

    // Expose imperative camera animation method
    useImperativeHandle(ref, () => ({
      animateToLocation: (lat: number, lng: number) => {
        mapRef.current?.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          },
          1000
        );
      },
    }));

    // Auto-fit bounds on initial load or target coordinate update from notification
    useEffect(() => {
      if (targetLat && targetLng) {
        mapRef.current?.animateToRegion({
          latitude: targetLat,
          longitude: targetLng,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }, 1200);
      } else if (locations.length > 0) {
        const coordinates = locations.map((loc) => ({
          latitude: loc.lat,
          longitude: loc.lng,
        }));
        // Fit coordinates smoothly
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
            animated: true,
          });
        }, 800);
      }
    }, [targetLat, targetLng, locations.length]);

    const handleCenterOnMe = () => {
      if (userLocation) {
        mapRef.current?.animateToRegion({
          latitude: userLocation.lat,
          longitude: userLocation.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }, 1000);
      }
    };

    return (
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
        >
          {/* Member Location Markers */}
          {locations.map((loc) => {
            const freshness = getLocationFreshness(loc.updatedAt, loc.sharingEnabled !== false);

            return (
              <Marker
                key={`loc_${loc.uid}`}
                coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                opacity={freshness.opacity}
              >
                <View
                  style={[
                    styles.memberMarker,
                    freshness.state === 'delayed' && styles.delayedMarker,
                    (freshness.state === 'stale' || freshness.state === 'sharing_off') && styles.staleMarker,
                  ]}
                >
                  <View
                    style={[
                      styles.avatarCircle,
                      freshness.state === 'delayed' && styles.delayedAvatarCircle,
                      freshness.state === 'stale' && styles.staleAvatarCircle,
                      freshness.state === 'sharing_off' && styles.offAvatarCircle,
                    ]}
                  >
                    <Text style={styles.avatarInitial}>
                      {loc.displayName ? loc.displayName.charAt(0).toUpperCase() : 'U'}
                    </Text>
                  </View>
                  <Text style={styles.markerNameBadge} numberOfLines={1}>
                    {loc.displayName || 'Member'}
                  </Text>
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
              </Marker>
            );
          })}

          {/* Marked Stop Markers */}
          {stops.map((stop) => {
            const isHighlighted = highlightStopId === stop.id;
            const isAuto = stop.autoDetected || stop.type === 'auto';

            return (
              <Marker
                key={`stop_${stop.id}`}
                coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                pinColor={isAuto ? '#6366F1' : '#F59E0B'}
              >
                <View
                  style={[
                    styles.stopMarker,
                    isAuto && styles.autoStopMarker,
                    isHighlighted && styles.highlightedStopMarker,
                  ]}
                >
                  <Text style={styles.stopIcon}>{isAuto ? '🤖' : '🚩'}</Text>
                </View>

                <Callout style={styles.stopCallout}>
                  <View style={styles.stopCalloutContainer}>
                    <Text style={styles.stopCalloutTitle}>
                      {isAuto ? `🤖 ${stop.name}` : stop.name}
                    </Text>

                    {stop.photoUrl ? (
                      <Image source={{ uri: stop.photoUrl }} style={styles.stopCalloutImage} />
                    ) : null}

                    {stop.note ? <Text style={styles.stopCalloutNote}>{stop.note}</Text> : null}

                    <Text style={styles.stopCalloutMeta}>
                      {isAuto ? '🤖 Auto-detected' : `Added by ${stop.displayName}`} •{' '}
                      {new Date(stop.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            );
          })}
        </MapView>

        {/* Floating Action Controls */}
        <View style={styles.fabControls}>
          {/* Center on Me FAB */}
          <TouchableOpacity style={styles.fabButton} onPress={handleCenterOnMe}>
            <Text style={styles.fabIcon}>📍</Text>
          </TouchableOpacity>

          {/* Mark a Stop FAB */}
          <TouchableOpacity
            style={[styles.fabButton, styles.fabMarkStop]}
            onPress={() => onMarkStop(userLocation?.lat, userLocation?.lng)}
          >
            <Text style={styles.fabIcon}>🚩</Text>
            <Text style={styles.fabLabel}>Mark Stop</Text>
          </TouchableOpacity>
        </View>

      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    borderColor: colors.border,
    borderWidth: 1,
    marginVertical: 12,
    position: 'relative',
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
