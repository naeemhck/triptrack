export const WARNING_MIN_METERS = 100;
export const WARNING_MAX_METERS = 400;
export const CRITICAL_MIN_METERS = 300;
export const CRITICAL_MAX_METERS = 2000;
export const THRESHOLD_STEP_METERS = 50;
export const CRITICAL_GAP_METERS = 100;

export const snapThresholdMeters = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value / THRESHOLD_STEP_METERS) * THRESHOLD_STEP_METERS));

export const nextWarningMeters = (current: number, deltaSteps: number): number =>
  snapThresholdMeters(
    current + deltaSteps * THRESHOLD_STEP_METERS,
    WARNING_MIN_METERS,
    WARNING_MAX_METERS,
  );

export const criticalMinimumForWarning = (warningMeters: number): number =>
  Math.max(CRITICAL_MIN_METERS, warningMeters + CRITICAL_GAP_METERS);

export const nextCriticalMeters = (
  current: number,
  warningMeters: number,
  deltaSteps: number,
): number =>
  snapThresholdMeters(
    current + deltaSteps * THRESHOLD_STEP_METERS,
    criticalMinimumForWarning(warningMeters),
    CRITICAL_MAX_METERS,
  );

export const pairCriticalWithWarning = (warningMeters: number, criticalMeters: number): number =>
  Math.max(criticalMeters, warningMeters + CRITICAL_GAP_METERS);
