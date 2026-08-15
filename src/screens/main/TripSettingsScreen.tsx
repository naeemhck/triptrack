import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Slider from '@react-native-community/slider';
import { useTrips } from '../../context/TripContext';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { TripNotificationPreferences } from '../../types/notifications';
import {
  getTripNotificationPreferences,
  updateTripNotificationPreferences,
} from '../../services/supabase/notificationPreferences';
import { updateTripAlertThresholds } from '../../services/supabase/trips';

interface Props {
  route: any;
  navigation: any;
}
type PreferenceKey = keyof TripNotificationPreferences;

const baseSettings: {
  key: PreferenceKey;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}[] = [
  {
    key: 'warningEnabled',
    title: 'Falling behind warning',
    description: '',
    icon: 'warning-outline',
    color: colors.warning,
  },
  {
    key: 'criticalEnabled',
    title: 'Critical separation',
    description: '',
    icon: 'alert-circle-outline',
    color: colors.critical,
  },
  {
    key: 'stopEnabled',
    title: 'New trip stops',
    description: 'Notify me when another member adds a stop.',
    icon: 'flag-outline',
    color: colors.mapAccent,
  },
  {
    key: 'staleEnabled',
    title: 'Delayed member locations',
    description: 'Notify me when a shared location becomes stale.',
    icon: 'time-outline',
    color: colors.link,
  },
  {
    key: 'memberLeftEnabled',
    title: 'Member departures',
    description: 'Notify me when a member leaves or is removed.',
    icon: 'person-remove-outline',
    color: colors.secondaryLight,
  },
];

export const TripSettingsScreen = ({ route, navigation }: Props) => {
  const { tripId } = route.params || {};
  const { trips, refreshTrips } = useTrips();
  const { user } = useAuth();
  const trip = trips.find((item) => item.id === tripId);
  const [preferences, setPreferences] = useState<TripNotificationPreferences | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warningMeters, setWarningMeters] = useState(trip?.warningDistanceMeters || 200);
  const [criticalMeters, setCriticalMeters] = useState(trip?.criticalDistanceMeters || 500);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const settings = baseSettings.map((item) => ({
    ...item,
    description:
      item.key === 'warningEnabled'
        ? `Notify me when a member reaches ${trip?.warningDistanceMeters ?? 200} m behind.`
        : item.key === 'criticalEnabled'
          ? `Notify me when a member reaches ${trip?.criticalDistanceMeters ?? 500} m behind.`
          : item.description,
  }));

  const load = async () => {
    if (!tripId) return;
    setLoadError(null);
    try {
      const [next, permission] = await Promise.all([
        getTripNotificationPreferences(tripId),
        Notifications.getPermissionsAsync(),
      ]);
      setPreferences(next);
      setPermissionGranted(permission.granted);
    } catch {
      setLoadError('TripTrack could not load notification settings.');
    }
  };

  useEffect(() => {
    void load();
  }, [tripId]);

  const toggle = async (key: PreferenceKey, enabled: boolean) => {
    if (!preferences || savingKey) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: enabled });
    setSavingKey(key);
    try {
      const saved = await updateTripNotificationPreferences(tripId, { [key]: enabled });
      setPreferences(saved);
    } catch {
      setPreferences(previous);
      Alert.alert('Setting not saved', 'Check your connection and try again.');
    } finally {
      setSavingKey(null);
    }
  };

  if (!trip)
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.error}>Trip not found or access has ended.</Text>
          <TouchableOpacity style={styles.retry} onPress={() => navigation.goBack()}>
            <Text style={styles.retryText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.back}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back to trip"
          >
            <Ionicons name="arrow-back" size={21} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Trip Settings</Text>
            <Text style={styles.tripName} numberOfLines={1}>
              {trip.name}
            </Text>
          </View>
        </View>

        {!permissionGranted ? (
          <TouchableOpacity style={styles.permissionNotice} onPress={() => Linking.openSettings()}>
            <Ionicons name="notifications-off-outline" size={21} color={colors.warning} />
            <View style={styles.noticeText}>
              <Text style={styles.noticeTitle}>Device notifications are off</Text>
              <Text style={styles.noticeDescription}>
                These preferences will be saved, but Android must also allow TripTrack
                notifications.
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.link} />
          </TouchableOpacity>
        ) : null}

        <Text style={styles.sectionTitle}>Push notifications</Text>
        <Text style={styles.sectionDescription}>
          Choose what you receive for this trip. Separation status remains visible in the app.
        </Text>
        {loadError ? (
          <View style={styles.center}>
            <Text style={styles.error}>{loadError}</Text>
            <TouchableOpacity style={styles.retry} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !preferences ? (
          <ActivityIndicator color={colors.primaryAction} style={styles.loader} />
        ) : (
          <View style={styles.list}>
            {settings.map((item) => (
              <View key={item.key} style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: `${item.color}1F` }]}>
                  <Ionicons name={item.icon} size={22} color={item.color} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowDescription}>{item.description}</Text>
                </View>
                {savingKey === item.key ? (
                  <ActivityIndicator color={colors.primaryAction} />
                ) : (
                  <Switch
                    value={preferences[item.key]}
                    disabled={savingKey !== null}
                    onValueChange={(value) => void toggle(item.key, value)}
                    trackColor={{ false: colors.border, true: colors.primaryDark }}
                    thumbColor={preferences[item.key] ? colors.primaryLight : colors.inactive}
                  />
                )}
              </View>
            ))}
          </View>
        )}
        {trip.createdBy === user?.uid && trip.status !== 'completed' ? (
          <View style={styles.thresholds}>
            <Text style={styles.sectionTitle}>Separation thresholds</Text>
            <Text style={styles.sectionDescription}>
              Trip-wide values are managed by the organizer. Changes reconcile silently.
            </Text>
            <Text style={styles.rowTitle}>Warning · {warningMeters} m</Text>
            <Slider
              minimumValue={100}
              maximumValue={400}
              step={50}
              value={warningMeters}
              onValueChange={(value) => {
                setWarningMeters(value);
                setCriticalMeters((current) => Math.max(current, value + 100));
              }}
              minimumTrackTintColor={colors.warning}
              maximumTrackTintColor={colors.border}
            />
            <Text style={styles.rowTitle}>Critical · {criticalMeters} m</Text>
            <Slider
              minimumValue={Math.max(300, warningMeters + 100)}
              maximumValue={2000}
              step={50}
              value={criticalMeters}
              onValueChange={(value) => setCriticalMeters(Math.max(value, warningMeters + 100))}
              minimumTrackTintColor={colors.critical}
              maximumTrackTintColor={colors.border}
            />
            <TouchableOpacity
              style={styles.saveThresholds}
              disabled={savingThresholds}
              onPress={async () => {
                setSavingThresholds(true);
                try {
                  await updateTripAlertThresholds(tripId, {
                    warningDistanceMeters: warningMeters,
                    criticalDistanceMeters: Math.max(criticalMeters, warningMeters + 100),
                  });
                  await refreshTrips();
                } catch {
                  Alert.alert(
                    'Thresholds not saved',
                    'Only the organizer can change valid thresholds for an active or planned trip.',
                  );
                } finally {
                  setSavingThresholds(false);
                }
              }}
            >
              {savingThresholds ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveThresholdsText}>Save thresholds</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  tripName: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  permissionNotice: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: 'rgba(251,191,36,0.08)',
    marginBottom: 24,
  },
  noticeText: { flex: 1 },
  noticeTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  noticeDescription: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 3 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 5,
    marginBottom: 14,
  },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  row: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  rowDescription: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 3 },
  loader: { marginTop: 32 },
  center: { alignItems: 'center', paddingVertical: 30 },
  error: { fontSize: 13, color: colors.critical, textAlign: 'center' },
  thresholds: { marginTop: 24, gap: 8 },
  saveThresholds: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveThresholdsText: { color: '#FFF', fontWeight: '800' },
  retry: {
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  retryText: { color: colors.link, fontWeight: '700' },
});
