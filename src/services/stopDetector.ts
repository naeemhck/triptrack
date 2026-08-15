/**
 * TripTrack Automatic Dwell-Time Stop Detector Service
 *
 * ALGORITHM & THRESHOLDS:
 * - Candidate Dwell Radius: 75 meters (STOP_RADIUS_METERS)
 * - Candidate Reset: If movement > 75m before 5 minutes, reset candidate
 * - Dwell Time Threshold: 5 minutes (DWELL_TIME_THRESHOLD_MS)
 * - Departure Radius: 150 meters (STOP_RESUME_DISTANCE_METERS for active confirmed stops)
 * - Deduplication Window: 100 meters within last 10 minutes (STOP_DEDUPE_RADIUS_METERS & STOP_COOLDOWN_MS)
 * - Maximum Usable Location Accuracy: 100 meters (MAX_USABLE_LOCATION_ACCURACY_METERS)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { TripStop } from '../types/location';
import { listStops } from './supabase/stops';
import {
  getOfflineQueue,
  enqueueStop,
  enqueueStopUpdate,
  processPendingSyncQueue,
} from './offlineSyncQueue';
import { devLog } from '../utils/devLog';

export const STOP_RADIUS_METERS = 75;
export const STOP_RESUME_DISTANCE_METERS = 150;
export const DWELL_TIME_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
export const STOP_DEDUPE_RADIUS_METERS = 100;
export const STOP_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_USABLE_LOCATION_ACCURACY_METERS = 100;

export const ASYNC_DETECTOR_STATE_KEY = '@triptrack_stop_detector_state';

export interface DetectorState {
  tripId: string;
  uid: string;
  candidateLat: number;
  candidateLng: number;
  candidateStartedAt: number;
  lastSeenAt: number;
  pendingStopId?: string;
  activeStopId?: string;
  activeStopLat?: number;
  activeStopLng?: number;
  activeStopIsAuto?: boolean;
}

/**
 * Haversine formula to compute distance in meters between two geographical coordinates
 */
export const getDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Main dwell-time stop evaluation pipeline
 */
export const processLocationForStopDetection = async (
  tripId: string,
  uid: string,
  displayName: string,
  lat: number,
  lng: number,
  accuracy?: number,
): Promise<TripStop | null> => {
  // 1. GPS Accuracy Filter: ignore samples with accuracy worse than 100m
  if (
    accuracy !== undefined &&
    accuracy !== null &&
    accuracy > MAX_USABLE_LOCATION_ACCURACY_METERS
  ) {
    devLog(
      `⚠️ [Stop Detector] Ignored inaccurate location sample (accuracy: ${accuracy.toFixed(1)}m > ${MAX_USABLE_LOCATION_ACCURACY_METERS}m)`,
    );
    return null;
  }

  const now = Date.now();

  try {
    // 2. Retrieve persisted detector state
    const rawState = await AsyncStorage.getItem(ASYNC_DETECTOR_STATE_KEY);
    let state: DetectorState | null = null;
    if (rawState) {
      try {
        const parsed = JSON.parse(rawState) as Partial<DetectorState>;
        if (
          typeof parsed.tripId === 'string' &&
          typeof parsed.uid === 'string' &&
          Number.isFinite(parsed.candidateLat) &&
          Number.isFinite(parsed.candidateLng) &&
          Number.isFinite(parsed.candidateStartedAt) &&
          Number.isFinite(parsed.lastSeenAt)
        ) {
          state = parsed as DetectorState;
        } else {
          await AsyncStorage.removeItem(ASYNC_DETECTOR_STATE_KEY);
        }
      } catch {
        await AsyncStorage.removeItem(ASYNC_DETECTOR_STATE_KEY);
      }
    }

    // Validate ownership: reset state if tripId or uid mismatch
    if (state && (state.tripId !== tripId || state.uid !== uid)) {
      devLog('🔄 [Stop Detector] Resetting stale detector state from previous trip/user session.');
      state = null;
    }

    // 3. State A: Confirmed Active Stop exists
    if (
      state &&
      state.activeStopId &&
      state.activeStopLat !== undefined &&
      state.activeStopLng !== undefined
    ) {
      const distFromActive = getDistanceMeters(lat, lng, state.activeStopLat, state.activeStopLng);

      if (distFromActive <= STOP_RESUME_DISTANCE_METERS) {
        // Traveler remains within 150m departure threshold
        state.lastSeenAt = now;
        await AsyncStorage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(state));
        return null;
      }

      // Displacement > 150m -> Resumed travel detected!
      devLog(`🚗 [Stop Detector] Resumed travel detected (${distFromActive.toFixed(0)}m > 150m).`);

      // Only update departedAt timestamp on automatic stops (leave manual stop models intact)
      if (state.activeStopIsAuto) {
        devLog(`Updating departedAt timestamp for automatic stop ${state.activeStopId}`);
        await enqueueStopUpdate(tripId, uid, state.activeStopId, { departedAt: now });
        processPendingSyncQueue(uid);
      }

      // Reset candidate lifecycle at new location
      const newPendingId = Crypto.randomUUID();
      const newState: DetectorState = {
        tripId,
        uid,
        candidateLat: lat,
        candidateLng: lng,
        candidateStartedAt: now,
        lastSeenAt: now,
        pendingStopId: newPendingId,
      };
      await AsyncStorage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(newState));
      return null;
    }

    // 4. State B: No Confirmed Active Stop (Evaluating unconfirmed candidate)
    if (!state) {
      const newPendingId = Crypto.randomUUID();
      const newState: DetectorState = {
        tripId,
        uid,
        candidateLat: lat,
        candidateLng: lng,
        candidateStartedAt: now,
        lastSeenAt: now,
        pendingStopId: newPendingId,
      };
      await AsyncStorage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(newState));
      return null;
    }

    // Evaluate distance to candidate origin
    const distFromCandidate = getDistanceMeters(lat, lng, state.candidateLat, state.candidateLng);

    if (distFromCandidate > STOP_RADIUS_METERS) {
      // Moved > 75m before 5 minutes -> Reset unconfirmed candidate
      devLog(
        `🔄 [Stop Detector] Moved ${distFromCandidate.toFixed(0)}m > 75m. Resetting unconfirmed candidate.`,
      );
      const newPendingId = Crypto.randomUUID();
      const newState: DetectorState = {
        tripId,
        uid,
        candidateLat: lat,
        candidateLng: lng,
        candidateStartedAt: now,
        lastSeenAt: now,
        pendingStopId: newPendingId,
      };
      await AsyncStorage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(newState));
      return null;
    }

    // Traveler remains within 75m radius -> Evaluate Dwell Duration
    const dwellDuration = now - state.candidateStartedAt;

    if (dwellDuration < DWELL_TIME_THRESHOLD_MS) {
      // Dwell duration < 5 mins -> Continue building dwell candidate
      state.lastSeenAt = now;
      await AsyncStorage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(state));
      return null;
    }

    // Dwell Duration >= 5 minutes -> Dwell Confirmed!
    devLog(
      `🎯 [Stop Detector] Dwell threshold reached (5+ minutes stationary). Performing deduplication check...`,
    );

    // 5. Deduplication & Cooldown Check (100m radius within last 10 minutes)
    let existingStops: TripStop[] = [];
    try {
      existingStops = await listStops(tripId);
    } catch (e) {
      console.error('Error checking existing stops for deduplication:', e);
    }

    // Merge pending unsynced local stops from queue to protect against offline manual/auto collisions
    try {
      const pendingItems = await getOfflineQueue();
      const pendingStops: TripStop[] = pendingItems
        .filter(
          (i) =>
            i.tripId === tripId &&
            i.uid === uid &&
            (i.operationType === 'manual_stop' || i.operationType === 'auto_stop'),
        )
        .map((i) => i.payload as TripStop);
      existingStops = [...existingStops, ...pendingStops];
    } catch {
      // ignore
    }

    const recentDuplicate = existingStops.find((stop) => {
      const dist = getDistanceMeters(state!.candidateLat, state!.candidateLng, stop.lat, stop.lng);
      const isRecent = now - (stop.createdAt || now) <= STOP_COOLDOWN_MS;
      return dist <= STOP_DEDUPE_RADIUS_METERS && isRecent;
    });

    if (recentDuplicate) {
      devLog(
        `🛡️ [Stop Detector] Suppressed duplicate stop creation. Found existing stop "${recentDuplicate.name}" within 100m.`,
      );
      // Bind state to active stop so detector remains suppressed indefinitely until traveler moves > 150m
      state.activeStopId = recentDuplicate.id;
      state.activeStopLat = recentDuplicate.lat;
      state.activeStopLng = recentDuplicate.lng;
      state.activeStopIsAuto = recentDuplicate.autoDetected || recentDuplicate.type === 'auto';
      delete state.pendingStopId;
      await AsyncStorage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(state));
      return null;
    }

    // 6. Create Automatic Stop using Reserved Stable Document ID
    const stableStopId = state.pendingStopId || Crypto.randomUUID();

    const newAutoStop: TripStop = {
      id: stableStopId,
      uid,
      displayName: displayName || 'Traveler',
      lat: state.candidateLat,
      lng: state.candidateLng,
      name: 'Automatic stop', // Safe generic name without reverse geocoding dependency
      autoDetected: true,
      type: 'auto',
      createdAt: now,
      notificationSent: false,
    };

    // Write-Ahead Queue: Enqueue auto stop locally first
    await enqueueStop(tripId, uid, newAutoStop, 'auto_stop');
    processPendingSyncQueue(uid);

    devLog(
      `✨ [Stop Detector] Successfully created automatic stop "${stableStopId}" for trip ${tripId}`,
    );

    // Transition state to Active Stop
    state.activeStopId = stableStopId;
    state.activeStopLat = state.candidateLat;
    state.activeStopLng = state.candidateLng;
    state.activeStopIsAuto = true;
    delete state.pendingStopId;
    await AsyncStorage.setItem(ASYNC_DETECTOR_STATE_KEY, JSON.stringify(state));

    return newAutoStop;
  } catch (err) {
    console.error('Error in processLocationForStopDetection pipeline:', err);
    return null;
  }
};

/**
 * Clear detector state on trip exit / sharing toggle OFF
 */
export const clearStopDetectorState = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(ASYNC_DETECTOR_STATE_KEY);
    devLog('🧹 [Stop Detector] Cleared detector candidate state.');
  } catch (e) {
    console.error('Error clearing detector state:', e);
  }
};
