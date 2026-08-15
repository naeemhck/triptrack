import {
  LEASE_DURATION_MS,
  MAX_ATTEMPTS,
  MEDIA_LEASE_DURATION_MS,
  SYNC_INITIAL_RETRY_MS,
  SYNC_MAX_RETRY_MS,
  leaseDurationFor,
  nextRetryState,
} from '../offlineSyncBackoff';

describe('offline synchronization retry policy', () => {
  it('uses longer leases only for photo uploads', () => {
    expect(leaseDurationFor('latest_location')).toBe(LEASE_DURATION_MS);
    expect(leaseDurationFor('stop_photo')).toBe(MEDIA_LEASE_DURATION_MS);
  });

  it('applies bounded exponential backoff', () => {
    expect(nextRetryState(0, 1000)).toEqual({
      attempts: 1,
      nextRetryAt: 1000 + SYNC_INITIAL_RETRY_MS,
      status: 'failed',
    });
    expect(nextRetryState(8, 1000).nextRetryAt).toBe(1000 + SYNC_MAX_RETRY_MS);
  });

  it('requires manual retry after the maximum attempt count', () => {
    expect(nextRetryState(MAX_ATTEMPTS - 1, 1000)).toMatchObject({
      attempts: MAX_ATTEMPTS,
      status: 'manual_retry_required',
    });
  });
});
