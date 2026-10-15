import { AppState, Platform } from 'react-native';

import { addEntry, formatLog, requestLine, type LogEntry, type LogKind } from '@/core/app-log';
import { rememberScreen } from '@/core/contact';

/**
 * The in-memory activity log a bug report carries (see core/app-log.ts for what it keeps and what
 * it never keeps). startAppLog() runs once at launch; Contact Us reads it with appLogText().
 */
let log: LogEntry[] = [];
let trail: string[] = [];
let started = false;

export function logEvent(kind: LogKind, text: string) {
  try {
    log = addEntry(log, { at: Date.now(), kind, text });
  } catch {
    // The log must never break the app.
  }
}

/** Called on every screen change (route pattern only). */
export function logScreen(screen: string) {
  trail = rememberScreen(trail, screen);
  logEvent('screen', screen);
}

export const screenTrail = (): readonly string[] => trail;
export const appLogText = () => formatLog(log);

const describe = (args: unknown[]) =>
  args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : safeJson(a))).join(' ');

function safeJson(a: unknown): string {
  try {
    return JSON.stringify(a)?.slice(0, 200) ?? String(a);
  } catch {
    return String(a);
  }
}

/** Starts recording errors, warnings and the app going to the background and back. */
export function startAppLog() {
  if (started) return;
  started = true;
  logEvent('app', `Started on ${Platform.OS} ${String(Platform.Version ?? '')}`.trim());

  for (const level of ['error', 'warn'] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      logEvent(level, describe(args));
      original.apply(console, args);
    };
  }

  // Errors nothing caught: React Native's global handler (Sentry's runs after ours), or the browser's.
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };
    addEventListener?: (type: string, fn: (e: { error?: unknown; message?: string; reason?: unknown }) => void) => void;
  };
  if (g.ErrorUtils) {
    const previous = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((e, fatal) => {
      logEvent('error', `${fatal ? 'Crash' : 'Uncaught'}: ${describe([e])}`);
      previous?.(e, fatal);
    });
  } else if (Platform.OS === 'web' && g.addEventListener) {
    g.addEventListener('error', (e) => logEvent('error', `Uncaught: ${describe([e.error ?? e.message])}`));
    g.addEventListener('unhandledrejection', (e) => logEvent('error', `Unhandled promise: ${describe([e.reason])}`));
  }

  AppState.addEventListener('change', (s) => {
    if (s === 'active') logEvent('app', 'Came back to the app');
    else if (s === 'background') logEvent('app', 'Went to the background');
  });
}

/** fetch for the Supabase client: the same, plus a log line when a request fails. */
export const loggedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const method = init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET');
  try {
    const res = await fetch(input, init);
    if (!res.ok) logEvent('request', requestLine(method, url, res.status));
    return res;
  } catch (e) {
    logEvent('request', requestLine(method, url, (e as Error)?.message ?? 'no response'));
    throw e;
  }
};
