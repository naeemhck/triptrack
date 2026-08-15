describe('error reporting', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('initializes disabled when no DSN is configured', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    let sentry: typeof import('@sentry/react-native');
    jest.isolateModules(() => {
      sentry = require('@sentry/react-native');
      const { initializeErrorReporting } = require('../errorReporting');
      initializeErrorReporting();
    });
    expect(sentry!.init).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('does not forward exceptions when reporting is disabled', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let sentry: typeof import('@sentry/react-native');
    jest.isolateModules(() => {
      sentry = require('@sentry/react-native');
      const { reportError } = require('../errorReporting');
      reportError(new Error('failed'), { operation: 'queue.sync' });
    });
    expect(sentry!.captureException).not.toHaveBeenCalled();
  });

  it('forwards configured exceptions with an operation tag', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let sentry: typeof import('@sentry/react-native');
    jest.isolateModules(() => {
      sentry = require('@sentry/react-native');
      const { reportError } = require('../errorReporting');
      reportError(new Error('failed'), { operation: 'queue.sync' });
    });
    expect(sentry!.withScope).toHaveBeenCalledTimes(1);
    expect(sentry!.captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
