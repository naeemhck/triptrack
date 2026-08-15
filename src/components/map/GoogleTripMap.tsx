import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { colors } from '../../theme/colors';
import { getLocationFreshness } from '../../utils/locationFreshness';
import { TripMapProps, TripMapRef } from './mapTypes';
import { Ionicons } from '@expo/vector-icons';

const stopIcon = (category?: string): React.ComponentProps<typeof Ionicons>['name'] =>
  category === 'lodging'
    ? 'bed-outline'
    : category === 'food'
      ? 'restaurant-outline'
      : category === 'viewpoint'
        ? 'binoculars-outline'
        : category === 'fuel'
          ? 'car-outline'
          : 'flag-outline';

const deltasForZoom = (zoom = 14) => {
  const latitudeDelta = 360 / Math.pow(2, zoom);
  return { latitudeDelta, longitudeDelta: latitudeDelta };
};

export const GoogleTripMap = forwardRef<TripMapRef, TripMapProps>((props, ref) => {
  const mapRef = useRef<MapView | null>(null);
  const first =
    props.initialCamera ??
    (props.targetLat !== undefined && props.targetLng !== undefined
      ? { latitude: props.targetLat, longitude: props.targetLng, zoom: 14 }
      : props.userLocation
        ? { latitude: props.userLocation.lat, longitude: props.userLocation.lng, zoom: 13 }
        : props.locations.length
          ? { latitude: props.locations[0].lat, longitude: props.locations[0].lng, zoom: 14 }
          : { latitude: 37.7749, longitude: -122.4194, zoom: 11 });
  const initialRegion: Region = {
    latitude: first.latitude,
    longitude: first.longitude,
    ...deltasForZoom(first.zoom),
  };

  useImperativeHandle(ref, () => ({
    animateToLocation: (latitude, longitude) => {
      mapRef.current?.animateToRegion({ latitude, longitude, ...deltasForZoom(14) }, 800);
    },
  }));

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onMapLoaded={props.onMapLoaded}
        onRegionChangeComplete={(region) =>
          props.onCameraChange?.({
            latitude: region.latitude,
            longitude: region.longitude,
            zoom: Math.log2(360 / region.latitudeDelta),
          })
        }
      >
        {props.routePoints && props.routePoints.length > 1 ? (
          <Polyline
            coordinates={props.routePoints.map((point) => ({
              latitude: point.latitude,
              longitude: point.longitude,
            }))}
            strokeColor={colors.primary}
            strokeWidth={5}
          />
        ) : null}
        {props.locations.map((location) => {
          const freshness = getLocationFreshness(
            location.updatedAt,
            location.sharingEnabled !== false,
          );
          return (
            <Marker
              key={`member_${location.uid}`}
              coordinate={{ latitude: location.lat, longitude: location.lng }}
            >
              <View style={[styles.member, freshness.state !== 'fresh' && styles.stale]}>
                <Text style={styles.initial}>
                  {location.displayName?.charAt(0).toUpperCase() || 'U'}
                </Text>
                <View
                  style={[
                    styles.dot,
                    freshness.state === 'fresh' ? styles.dotFresh : styles.dotStale,
                  ]}
                />
              </View>
              <Callout>
                <Text>
                  {location.displayName || 'Traveler'} - {freshness.label}
                </Text>
              </Callout>
            </Marker>
          );
        })}
        {props.stops.map((stop) => (
          <Marker
            key={`stop_${stop.id}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={stop.name}
            description={stop.note || `Added by ${stop.displayName}`}
          >
            <View
              style={[styles.stopPin, props.highlightStopId === stop.id && styles.stopPinActive]}
            >
              <Ionicons name={stopIcon(stop.category)} size={17} color="#FFF" />
            </View>
          </Marker>
        ))}
      </MapView>
      <View style={styles.actions}>
        <Text
          style={styles.action}
          onPress={() =>
            props.userLocation &&
            mapRef.current?.animateToRegion(
              {
                latitude: props.userLocation.lat,
                longitude: props.userLocation.lng,
                ...deltasForZoom(13),
              },
              800,
            )
          }
        >
          📍
        </Text>
        {props.allowMarkStop !== false ? (
          <Text
            style={[styles.action, styles.stop]}
            onPress={() => props.onMarkStop(props.userLocation?.lat, props.userLocation?.lng)}
          >
            🚩 Mark Stop
          </Text>
        ) : null}
      </View>
    </View>
  );
});

GoogleTripMap.displayName = 'GoogleTripMap';

const styles = StyleSheet.create({
  container: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    borderColor: colors.border,
    borderWidth: 1,
    marginVertical: 12,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 2,
    borderRadius: 18,
    padding: 5,
  },
  stale: { opacity: 0.55, borderColor: colors.textMuted },
  initial: {
    color: '#FFF',
    backgroundColor: colors.primary,
    fontWeight: '700',
    padding: 5,
    borderRadius: 12,
  },
  name: { color: colors.textPrimary, fontWeight: '700', marginHorizontal: 6, maxWidth: 90 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 2 },
  dotFresh: { backgroundColor: colors.success },
  dotStale: { backgroundColor: colors.inactive },
  stopPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warning,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  stopPinActive: { backgroundColor: colors.primary },
  actions: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 8 },
  action: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    color: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: '700',
  },
  stop: { backgroundColor: colors.primary },
});
