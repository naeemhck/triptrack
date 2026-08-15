/**
 * TripTrack Location Freshness & Connectivity Formatter
 *
 * CONFIGURABLE THRESHOLDS:
 * - LOCATION_DELAYED_AFTER_MS: 2 minutes (120,000ms)
 * - LOCATION_STALE_AFTER_MS: 5 minutes (300,000ms)
 * - LOCATION_ALERT_AFTER_MS: 10 minutes (600,000ms - Cloud Function stale push eligibility)
 *
 * TIMESTAMP SEMANTICS:
 * - sampledAt: GPS coordinate fix time on device (used for physical coordinate freshness display)
 * - updatedAt: database receipt time
 */

export const LOCATION_DELAYED_AFTER_MS = 2 * 60 * 1000;
export const LOCATION_STALE_AFTER_MS = 5 * 60 * 1000;
export const LOCATION_ALERT_AFTER_MS = 10 * 60 * 1000;

export type FreshnessState = 'fresh' | 'delayed' | 'stale' | 'sharing_off' | 'never_shared';

export interface LocationFreshnessResult {
  state: FreshnessState;
  label: string;
  shortLabel: string;
  minutesAgo: number;
  opacity: number;
}

/**
 * Normalizes epoch milliseconds or ISO timestamps to epoch milliseconds
 */
export const normalizeTimestamp = (raw: any): number | null => {
  if (!raw) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw.toMillis === 'function') return raw.toMillis();
  if (typeof raw.seconds === 'number') return raw.seconds * 1000;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
};

/**
 * Computes location freshness state and human-readable labels.
 * Prefers `sampledAt` (GPS fix time) over `updatedAt` for coordinate age display to prevent
 * delayed uploads of ancient offline coordinates from falsely appearing "Live".
 */
export const getLocationFreshness = (
  rawUpdatedAt?: any,
  sharingEnabled: boolean = true,
  now: number = Date.now(),
  rawSampledAt?: any,
): LocationFreshnessResult => {
  const normUpdated = normalizeTimestamp(rawUpdatedAt);
  let normSampled = normalizeTimestamp(rawSampledAt);

  // Defensive clock skew check on sampledAt
  if (normSampled && (normSampled > now + 60000 || normSampled < 0)) {
    normSampled = null; // fallback to normUpdated if clock skew is absurd
  }

  const effectiveTime = normSampled || normUpdated;

  // Priority 1: Explicitly disabled sharing
  if (!sharingEnabled) {
    if (effectiveTime) {
      const minutesAgo = Math.max(0, Math.floor((now - effectiveTime) / 60000));
      return {
        state: 'sharing_off',
        label: `Sharing off • Last seen ${minutesAgo < 1 ? 'just now' : `${minutesAgo}m ago`}`,
        shortLabel: 'Sharing off',
        minutesAgo,
        opacity: 0.35,
      };
    }
    return {
      state: 'sharing_off',
      label: 'Location sharing off',
      shortLabel: 'Sharing off',
      minutesAgo: 0,
      opacity: 0.35,
    };
  }

  // Priority 2: Never shared / Missing location timestamp
  if (!effectiveTime) {
    return {
      state: 'never_shared',
      label: 'Location not available yet',
      shortLabel: 'Waiting for location',
      minutesAgo: 0,
      opacity: 0.4,
    };
  }

  const elapsed = Math.max(0, now - effectiveTime);
  const minutesAgo = Math.floor(elapsed / 60000);

  // Priority 3: Fresh (< 2 minutes)
  if (elapsed < LOCATION_DELAYED_AFTER_MS) {
    return {
      state: 'fresh',
      label: 'Live',
      shortLabel: minutesAgo < 1 ? 'Just now' : `${minutesAgo}m ago`,
      minutesAgo,
      opacity: 1.0,
    };
  }

  // Priority 4: Delayed (2–5 minutes)
  if (elapsed < LOCATION_STALE_AFTER_MS) {
    return {
      state: 'delayed',
      label: `Last updated ${minutesAgo}m ago`,
      shortLabel: `${minutesAgo}m ago`,
      minutesAgo,
      opacity: 0.75,
    };
  }

  // Priority 5: Stale (>= 5 minutes)
  return {
    state: 'stale',
    label: `Location unavailable • Last seen ${minutesAgo}m ago`,
    shortLabel: `Last seen ${minutesAgo}m ago`,
    minutesAgo,
    opacity: 0.45,
  };
};
