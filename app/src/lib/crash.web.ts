import type { ComponentType } from 'react';

// The website is a stopgap; crash reporting is for the native app only.
export const crashReportingOn = false;

export function withCrashReporting<P extends Record<string, unknown>>(Root: ComponentType<P>): ComponentType<P> {
  return Root;
}

export function setCrashScreen(_path: string) {}
