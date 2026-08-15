import * as Sentry from '@sentry/react-native';
import { logger } from '../logger';

describe('structured logger', () => {
  beforeEach(() => jest.clearAllMocks());

  afterEach(() => jest.restoreAllMocks());

  it('writes structured development events with a timestamp', () => {
    const output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.info('offline_queue.processing', { queueCount: 2 });
    expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
      level: 'info',
      event: 'offline_queue.processing',
      queueCount: 2,
    });
  });

  it('redacts sensitive context and creates warning breadcrumbs', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logger.warn('notification.delivery_deferred', {
      attempt: 2,
      token: 'must-not-appear',
      email: 'must-not-appear@example.com',
    });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'application',
      level: 'warning',
      message: 'notification.delivery_deferred',
      data: { attempt: 2 },
    });
  });

  it('uses the error channel for structured errors', () => {
    const output = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logger.error('offline_queue.processor_failed');
    expect(output).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', message: 'offline_queue.processor_failed' }),
    );
  });
});
