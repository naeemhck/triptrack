import * as Sentry from '@sentry/react-native';

export interface ErrorContext {
  operation: string;
  severity?: 'warning' | 'error' | 'fatal';
}

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

export const initializeErrorReporting = (): void => {
  Sentry.init({
    dsn: sentryDsn,
    enabled: Boolean(sentryDsn),
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
};

export const reportError = (cause: unknown, context: ErrorContext): void => {
  const error = cause instanceof Error ? cause : new Error(String(cause));

  if (__DEV__) {
    console.error(
      JSON.stringify({
        level: context.severity ?? 'error',
        operation: context.operation,
        errorName: error.name,
        message: error.message,
      }),
    );
  }

  if (!sentryDsn) return;

  Sentry.withScope((scope) => {
    scope.setTag('operation', context.operation);
    scope.setLevel(context.severity ?? 'error');
    Sentry.captureException(error);
  });
};
