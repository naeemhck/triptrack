import {
  getLocationFreshness,
  LOCATION_DELAYED_AFTER_MS,
  LOCATION_STALE_AFTER_MS,
  normalizeTimestamp,
} from '../locationFreshness';

describe('normalizeTimestamp', () => {
  it('accepts epoch milliseconds', () => expect(normalizeTimestamp(1234)).toBe(1234));
  it('accepts ISO strings', () =>
    expect(normalizeTimestamp('2026-08-14T12:00:00Z')).toBe(1786708800000));
  it('accepts Postgres-like second values', () =>
    expect(normalizeTimestamp({ seconds: 12 })).toBe(12000));
  it('accepts timestamp objects', () =>
    expect(normalizeTimestamp({ toMillis: () => 42 })).toBe(42));
  it('rejects missing and invalid values', () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp('not-a-date')).toBeNull();
  });
});

describe('getLocationFreshness', () => {
  const now = 1_800_000_000_000;

  it('reports sharing off before freshness', () => {
    expect(getLocationFreshness(now - 60_000, false, now).state).toBe('sharing_off');
  });

  it('reports never shared without a timestamp', () => {
    expect(getLocationFreshness(undefined, true, now).state).toBe('never_shared');
  });

  it('reports fresh before the delayed boundary', () => {
    expect(getLocationFreshness(now - LOCATION_DELAYED_AFTER_MS + 1, true, now).state).toBe(
      'fresh',
    );
  });

  it('reports delayed at the delayed boundary', () => {
    expect(getLocationFreshness(now - LOCATION_DELAYED_AFTER_MS, true, now).state).toBe('delayed');
  });

  it('reports stale at the stale boundary', () => {
    expect(getLocationFreshness(now - LOCATION_STALE_AFTER_MS, true, now).state).toBe('stale');
  });

  it('prefers sampled time and rejects future clock skew', () => {
    expect(getLocationFreshness(now, true, now, now - LOCATION_STALE_AFTER_MS).state).toBe('stale');
    expect(getLocationFreshness(now, true, now, now + 120_000).state).toBe('fresh');
  });
});
