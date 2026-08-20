/**
 * TripTrack Offline Map Tiles Service
 *
 * Downloads MapLibre offline packs covering a trip's planned route so the map
 * remains usable without connectivity. Packs are deleted when the trip ends
 * (see cleanupActiveTripState) to keep device storage bounded.
 *
 * OpenFreeMap fair-use constraints:
 * - maxZoom ceiling of 14 (street-level detail without tile explosion)
 * - Bounding box around the route only, never a region-wide download
 */

import { OfflineManager } from '@maplibre/maplibre-react-native';
import { reportError } from '../utils/errorReporting';

export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';

export const OFFLINE_PACK_MIN_ZOOM = 8;
export const OFFLINE_PACK_MAX_ZOOM = 14;

/** MapLibre offline pack bounds: [[neLng, neLat], [swLng, swLat]] */
export type OfflineBounds = [[number, number], [number, number]];

export const tripOfflinePackName = (tripId: string): string => `triptrack-${tripId}`;

interface RouteLikePoint {
  latitude: number;
  longitude: number;
}

/**
 * Compute padded pack bounds for a route. Returns null when there are not
 * enough points or the padded span is degenerate.
 */
export const computeRouteBounds = (
  points: RouteLikePoint[],
  paddingFraction = 0.1,
  minPaddedSpan = 0.01,
): OfflineBounds | null => {
  if (points.length < 2) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  // Expand around the route center; keep an absolute floor so a tiny route
  // still produces a usable tile region.
  const latCenter = (minLat + maxLat) / 2;
  const lngCenter = (minLng + maxLng) / 2;
  const latSpan = Math.max((maxLat - minLat) * (1 + 2 * paddingFraction), minPaddedSpan);
  const lngSpan = Math.max((maxLng - minLng) * (1 + 2 * paddingFraction), minPaddedSpan);

  return [
    [lngCenter + lngSpan / 2, latCenter + latSpan / 2],
    [lngCenter - lngSpan / 2, latCenter - latSpan / 2],
  ];
};

export interface OfflinePackProgress {
  percentage: number;
  completedTileCount: number;
  requiredResourceCount: number;
}

/**
 * Download (or resume) the offline pack for a trip's route. No-op when the
 * pack already exists, so callers can invoke it freely on route refreshes.
 */
export const createTripOfflinePack = async (
  tripId: string,
  points: RouteLikePoint[],
  onProgress?: (progress: OfflinePackProgress) => void,
): Promise<boolean> => {
  const name = tripOfflinePackName(tripId);
  const existing = await OfflineManager.getPack(name);
  if (existing) return false;

  const bounds = computeRouteBounds(points);
  if (!bounds) return false;

  await OfflineManager.createPack(
    {
      name,
      styleURL: OPENFREEMAP_STYLE_URL,
      bounds,
      minZoom: OFFLINE_PACK_MIN_ZOOM,
      maxZoom: OFFLINE_PACK_MAX_ZOOM,
    },
    (_pack, status) => {
      onProgress?.({
        percentage: status.percentage,
        completedTileCount: status.completedTileCount,
        requiredResourceCount: status.requiredResourceCount,
      });
    },
    (_pack, err) => {
      reportError(new Error(err.message), {
        operation: 'offlineMapTiles.packError',
        severity: 'warning',
      });
    },
  );
  return true;
};

/** Idempotent helper used by the trip runtime once a planned route is known. */
export const ensureTripOfflinePack = async (
  tripId: string,
  points: RouteLikePoint[],
): Promise<boolean> => {
  try {
    return await createTripOfflinePack(tripId, points);
  } catch (err) {
    reportError(err, { operation: 'offlineMapTiles.ensurePack', severity: 'warning' });
    return false;
  }
};

/** Remove the trip's offline pack. Safe to call when no pack exists. */
export const deleteTripOfflinePack = async (tripId: string): Promise<void> => {
  try {
    const name = tripOfflinePackName(tripId);
    const existing = await OfflineManager.getPack(name);
    if (existing) {
      await OfflineManager.deletePack(name);
    }
  } catch (err) {
    reportError(err, { operation: 'offlineMapTiles.deletePack', severity: 'warning' });
  }
};

export interface TripOfflinePackInfo {
  percentage: number;
  completedTileCount: number;
  requiredResourceCount: number;
}

/** Current download state of a trip's pack, or null when none exists. */
export const getTripOfflinePackStatus = async (
  tripId: string,
): Promise<TripOfflinePackInfo | null> => {
  try {
    const pack = await OfflineManager.getPack(tripOfflinePackName(tripId));
    if (!pack) return null;
    const status = await pack.status();
    return {
      percentage: status.percentage,
      completedTileCount: status.completedTileCount,
      requiredResourceCount: status.requiredResourceCount,
    };
  } catch {
    return null;
  }
};
