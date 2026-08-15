export const LEASE_DURATION_MS = 60 * 1000;
export const MEDIA_LEASE_DURATION_MS = 180 * 1000;
export const SYNC_INITIAL_RETRY_MS = 5000;
export const SYNC_MAX_RETRY_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 10;

export const leaseDurationFor = (operationType: string): number =>
  operationType === 'stop_photo' ? MEDIA_LEASE_DURATION_MS : LEASE_DURATION_MS;

export const nextRetryState = (
  currentAttempts: number,
  now: number,
): {
  attempts: number;
  nextRetryAt: number;
  status: 'failed' | 'manual_retry_required';
} => {
  const attempts = currentAttempts + 1;
  const delay = Math.min(SYNC_INITIAL_RETRY_MS * Math.pow(2, attempts - 1), SYNC_MAX_RETRY_MS);
  return {
    attempts,
    nextRetryAt: now + delay,
    status: attempts >= MAX_ATTEMPTS ? 'manual_retry_required' : 'failed',
  };
};
