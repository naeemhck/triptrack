import * as Sentry from '@sentry/react-native';

type LogLevel = 'info' | 'warning' | 'error';
type LogValue = string | number | boolean | null | undefined;
export type LogContext = Record<string, LogValue>;

const sensitiveKey = /(token|secret|password|email|phone|name|url|uri|lat|lng|location|user|trip)/i;

const safeContext = (context: LogContext): Record<string, string | number | boolean | null> =>
  Object.fromEntries(
    Object.entries(context)
      .filter(([key, value]) => !sensitiveKey.test(key) && value !== undefined)
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 120) : value]),
  ) as Record<string, string | number | boolean | null>;

const write = (level: LogLevel, event: string, context: LogContext = {}): void => {
  const data = safeContext(context);

  if (__DEV__) {
    const output = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...data });
    if (level === 'error') console.error(output);
    else if (level === 'warning') console.warn(output);
    else console.log(output);
  }

  if (level !== 'info') {
    Sentry.addBreadcrumb({ category: 'application', level, message: event, data });
  }
};

export const logger = {
  info: (event: string, context?: LogContext) => write('info', event, context),
  warn: (event: string, context?: LogContext) => write('warning', event, context),
  error: (event: string, context?: LogContext) => write('error', event, context),
};
