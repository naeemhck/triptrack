import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TripMap } from '../../components/map/TripMap';
import { useTrips } from '../../context/TripContext';
import {
  calculateRoute,
  getCurrentPlannedRoute,
  savePlannedRoute,
  searchPlaces,
} from '../../services/supabase/navigation';
import { colors } from '../../theme/colors';
import { PlaceSearchResult, RouteCoordinate, RoutePreview } from '../../types/navigation';
import { reportError } from '../../utils/errorReporting';

type SelectionTarget = 'origin' | 'destination' | 'waypoint';

export const RoutePlannerScreen = ({ route, navigation }: any) => {
  const tripId = route.params?.tripId as string;
  const reroute = route.params?.reroute === true;
  const { trips } = useTrips();
  const trip = trips.find((item) => item.id === tripId);
  const [origin, setOrigin] = useState<RouteCoordinate | null>(null);
  const [destination, setDestination] = useState<RouteCoordinate | null>(null);
  const [waypoints, setWaypoints] = useState<RouteCoordinate[]>([]);
  const [target, setTarget] = useState<SelectionTarget>('destination');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getCurrentPlannedRoute(tripId)
      .then((current) => {
        if (!current) return;
        setOrigin(reroute ? null : current.origin);
        setDestination(current.destination);
        setWaypoints(current.waypoints.filter((point) => !point.reachedAt));
      })
      .catch((error) => reportError(error, { operation: 'routePlanner.load' }));
  }, [reroute, tripId]);

  const mapRoute = useMemo(
    () =>
      preview
        ? {
            ...preview,
            id: 'preview',
            tripId,
            version: 0,
            isCurrent: true,
            createdAt: Date.now(),
          }
        : null,
    [preview, tripId],
  );

  const selectCoordinate = (coordinate: RouteCoordinate) => {
    const selected = { ...coordinate, title: coordinate.title || 'Pinned location' };
    if (target === 'origin') setOrigin(selected);
    else if (target === 'destination') setDestination(selected);
    else if (waypoints.length < 8) setWaypoints((current) => [...current, selected]);
    else Alert.alert('Waypoint limit', 'A route supports up to eight waypoints.');
    setResults([]);
    setQuery('');
    setPreview(null);
  };

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await searchPlaces(tripId, query));
    } catch (error) {
      reportError(error, { operation: 'routePlanner.search' });
      Alert.alert('Search unavailable', 'Place search is temporarily unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const createPreview = async () => {
    if (!destination) {
      Alert.alert('Destination required', 'Search for or pin a destination first.');
      return;
    }
    setBusy(true);
    try {
      setPreview(await calculateRoute(tripId, origin, destination, waypoints));
    } catch (error) {
      reportError(error, { operation: 'routePlanner.calculate' });
      Alert.alert(
        'Route unavailable',
        'The routing service could not calculate this route. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmRoute = () => {
    if (!preview) return;
    Alert.alert(
      'Use this route?',
      'This creates a new route version and preserves prior route history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save route',
          onPress: async () => {
            setBusy(true);
            try {
              await savePlannedRoute(tripId, preview);
              navigation.goBack();
            } catch (error) {
              reportError(error, { operation: 'routePlanner.save' });
              Alert.alert(
                'Route not saved',
                'TripTrack could not save this route. No trip data was changed.',
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.empty}>Trip unavailable.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.title}>Plan route</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {trip.name}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.segment}>
          {(['origin', 'destination', 'waypoint'] as SelectionTarget[]).map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.segmentItem, target === item && styles.segmentActive]}
              onPress={() => setTarget(item)}
            >
              <Text style={[styles.segmentText, target === item && styles.segmentTextActive]}>
                {item === 'waypoint' ? 'Waypoint' : item[0].toUpperCase() + item.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${target}`}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => void runSearch()}
          />
          <TouchableOpacity style={styles.searchButton} onPress={() => void runSearch()}>
            <Ionicons name="search" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
        {target === 'origin' ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setOrigin(null);
              setPreview(null);
            }}
          >
            <Ionicons name="navigate-outline" size={18} color={colors.primaryLight} />
            <Text style={styles.secondaryText}>Use fresh Route Leader location</Text>
          </TouchableOpacity>
        ) : null}
        {results.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.result}
            onPress={() => selectCoordinate(item)}
          >
            <Ionicons name="location-outline" size={18} color={colors.link} />
            <View style={styles.flex}>
              <Text style={styles.resultTitle}>{item.title}</Text>
              {item.subtitle ? <Text style={styles.sub}>{item.subtitle}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
        <Text style={styles.mapHint}>Tap the map to set the selected route point.</Text>
        <View style={styles.map}>
          <TripMap
            locations={[]}
            stops={[]}
            routePoints={[]}
            plannedRoute={mapRoute}
            userLocation={null}
            onMarkStop={() => undefined}
            allowMarkStop={false}
            onMapPress={(latitude, longitude) => selectCoordinate({ latitude, longitude })}
            initialCamera={destination ? { ...destination, zoom: 11 } : undefined}
          />
        </View>
        <RoutePoint label="Origin" value={origin?.title || 'Fresh Route Leader location'} />
        {waypoints.map((point, index) => (
          <View key={`${point.latitude}:${point.longitude}:${index}`} style={styles.waypoint}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {index + 1}. {point.title}
            </Text>
            <View style={styles.waypointActions}>
              <IconButton
                name="arrow-up"
                disabled={index === 0}
                onPress={() => setWaypoints((items) => move(items, index, index - 1))}
              />
              <IconButton
                name="arrow-down"
                disabled={index === waypoints.length - 1}
                onPress={() => setWaypoints((items) => move(items, index, index + 1))}
              />
              <IconButton
                name="trash-outline"
                onPress={() => {
                  setWaypoints((items) => items.filter((_, itemIndex) => itemIndex !== index));
                  setPreview(null);
                }}
              />
            </View>
          </View>
        ))}
        <RoutePoint label="Destination" value={destination?.title || 'Not selected'} />
        {preview ? (
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{(preview.distanceMeters / 1000).toFixed(1)} km</Text>
            <Text style={styles.sub}>
              {Math.round(preview.durationSeconds / 60)} min · {preview.steps.length} maneuvers
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={preview ? confirmRoute : createPreview}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Ionicons name={preview ? 'checkmark' : 'git-branch-outline'} size={20} color="#FFF" />
          )}
          <Text style={styles.primaryText}>{preview ? 'Confirm route' : 'Preview route'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const move = <T,>(items: T[], from: number, to: number) => {
  if (to < 0 || to >= items.length) return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
};

const IconButton = ({
  name,
  onPress,
  disabled,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
}) => (
  <TouchableOpacity style={styles.iconButton} onPress={onPress} disabled={disabled}>
    <Ionicons name={name} size={18} color={disabled ? colors.inactive : colors.textPrimary} />
  </TouchableOpacity>
);

const RoutePoint = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.routePoint}>
    <Text style={styles.pointLabel}>{label}</Text>
    <Text style={styles.resultTitle} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: { padding: 14, gap: 10, paddingBottom: 36 },
  flex: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  sub: { color: colors.textSecondary, fontSize: 12 },
  empty: { color: colors.textSecondary, padding: 20 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 6, padding: 3 },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textMuted, fontWeight: '700' },
  segmentTextActive: { color: '#FFF' },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    color: colors.textPrimary,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  secondaryText: { color: colors.primaryLight, fontWeight: '700' },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  mapHint: { color: colors.textMuted, fontSize: 12 },
  map: { minHeight: 320 },
  routePoint: {
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pointLabel: { color: colors.link, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  waypoint: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingLeft: 12,
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  waypointActions: { flexDirection: 'row' },
  summary: {
    padding: 14,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.link,
  },
  summaryValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
