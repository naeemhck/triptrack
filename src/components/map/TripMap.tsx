import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../theme/colors';
import { GoogleTripMap } from './GoogleTripMap';
import { MapLibreTripMap } from './TripMapView';
import { CameraTarget, MapProvider, TripMapProps, TripMapRef } from './mapTypes';

const PROVIDER_KEY = '@triptrack_map_provider';
const googleConfigured = Platform.OS === 'ios'
  ? Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY)
  : Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY);

export const TripMap = forwardRef<TripMapRef, TripMapProps>((props, ref) => {
  const rendererRef = useRef<TripMapRef | null>(null);
  const [provider, setProvider] = useState<MapProvider>('maplibre');
  const [camera, setCamera] = useState<CameraTarget | undefined>(props.initialCamera);
  const [notice, setNotice] = useState<string | null>(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);

  useImperativeHandle(ref, () => ({
    animateToLocation: (lat, lng) => {
      setCamera({ latitude: lat, longitude: lng, zoom: 14 });
      rendererRef.current?.animateToLocation(lat, lng);
    },
  }));

  useEffect(() => {
    if (!googleConfigured) return;
    AsyncStorage.getItem(PROVIDER_KEY).then((saved) => {
      if (saved === 'google' && googleConfigured) setProvider('google');
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!googleConfigured || provider !== 'google' || googleLoaded) return;
    const timer = setTimeout(() => {
      setProvider('maplibre');
      void AsyncStorage.setItem(PROVIDER_KEY, 'maplibre');
      setNotice('Google Maps could not load. Open Map is active.');
      setTimeout(() => setNotice(null), 3500);
    }, 12000);
    return () => clearTimeout(timer);
  }, [provider, googleLoaded]);

  const selectProvider = async (next: MapProvider) => {
    if (next === 'google' && !googleConfigured) {
      setNotice('Google Maps needs to be configured. Open Map remains active.');
      setTimeout(() => setNotice(null), 3500);
      return;
    }
    setGoogleLoaded(false);
    setProvider(next);
    await AsyncStorage.setItem(PROVIDER_KEY, next);
  };

  if (!googleConfigured) {
    return <MapLibreTripMap ref={ref} {...props} />;
  }

  const Renderer = provider === 'google' ? GoogleTripMap : MapLibreTripMap;
  return (
    <View style={styles.wrapper}>
      <Renderer key={provider} ref={rendererRef} {...props} initialCamera={camera} onCameraChange={setCamera} onMapLoaded={() => setGoogleLoaded(true)} />
      <View style={styles.switcher}>
        {(['maplibre', 'google'] as MapProvider[]).map((value) => (
          <TouchableOpacity key={value} style={[styles.option, provider === value && styles.selected]} onPress={() => void selectProvider(value)}>
            <Text style={[styles.label, provider === value && styles.selectedLabel]}>{value === 'maplibre' ? 'Open Map' : 'Google'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  switcher: { position: 'absolute', top: 22, left: 12, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 6, padding: 3, borderWidth: 1, borderColor: colors.border },
  option: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 4 },
  selected: { backgroundColor: colors.primary },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  selectedLabel: { color: '#FFF' },
  notice: { position: 'absolute', top: 62, left: 12, right: 12, backgroundColor: colors.surface, borderColor: colors.warning, borderWidth: 1, borderRadius: 6, padding: 10 },
  noticeText: { color: colors.textPrimary, fontSize: 12 },
});
