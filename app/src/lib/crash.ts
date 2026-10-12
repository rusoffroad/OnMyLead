import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import type { ComponentType } from 'react';

/**
 * Crash reporting (Sentry). Native crashes and uncaught JS errors are sent with the app
 * version and the screen the rider was on. With no EXPO_PUBLIC_SENTRY_DSN set, nothing is
 * started and the app behaves exactly as before.
 *
 * Never sends location: request URLs lose their query strings, console logs are dropped,
 * and no user details are attached.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const crashReportingOn = !!dsn;

if (dsn) {
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    beforeBreadcrumb(crumb) {
      if (crumb.category === 'console') return null;
      const url = crumb.data?.url;
      if (typeof url === 'string') crumb.data = { ...crumb.data, url: url.split('?')[0] };
      return crumb;
    },
  });
  Sentry.setTag('app_version', Constants.expoConfig?.version ?? 'unknown');
}

/** Wraps the root layout so render errors are reported too. */
export function withCrashReporting<P extends Record<string, unknown>>(Root: ComponentType<P>): ComponentType<P> {
  return dsn ? Sentry.wrap(Root) : Root;
}

/** Records which screen the rider is on, so a crash report says where it happened. */
export function setCrashScreen(path: string) {
  if (dsn) Sentry.setTag('screen', path);
}
