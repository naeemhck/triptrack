import {
  CRITICAL_GAP_METERS,
  nextCriticalMeters,
  nextWarningMeters,
  pairCriticalWithWarning,
  snapThresholdMeters,
} from '../tripAlertThresholds';

describe('tripAlertThresholds', () => {
  it('snaps to the 50 m grid inside the allowed range', () => {
    expect(snapThresholdMeters(224, 100, 400)).toBe(200);
    expect(snapThresholdMeters(80, 100, 400)).toBe(100);
    expect(snapThresholdMeters(490, 100, 400)).toBe(400);
  });

  it('steps warning and keeps critical at least 100 m above it', () => {
    expect(nextWarningMeters(200, 1)).toBe(250);
    expect(nextWarningMeters(100, -1)).toBe(100);
    expect(nextCriticalMeters(400, 250, 1)).toBe(450);
    expect(nextCriticalMeters(350, 250, -1)).toBe(350);
    expect(pairCriticalWithWarning(300, 350)).toBe(300 + CRITICAL_GAP_METERS);
  });
});
