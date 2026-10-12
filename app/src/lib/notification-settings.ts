import { useSyncExternalStore } from 'react';

import { DEFAULT_SETTINGS, isNotSwitchedOn, settingsFromRow, type NotificationSettings } from '@/core/notifications';
import { track } from './analytics';
import { supabase } from './supabase';

export type SettingsState = { settings: NotificationSettings; switchedOn: boolean };

// The signed-in rider's settings, shared by the settings screen, the in-app pop-up and reminders.
let current: NotificationSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
function publish(s: NotificationSettings) {
  current = s;
  listeners.forEach((l) => l());
}

/** The latest known settings (defaults until loaded), updating when they change. */
export function useNotificationSettings(): NotificationSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

export function currentNotificationSettings(): NotificationSettings {
  return current;
}

/** The phone's time zone, e.g. America/Denver, for quiet hours and meeting times. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Load the rider's settings. switchedOn is false until the database has the notifications
 * update; the screen says so and the defaults stand in.
 */
export async function loadNotificationSettings(): Promise<SettingsState> {
  const id = await userId();
  if (!id) return { settings: DEFAULT_SETTINGS, switchedOn: false };
  const { data, error } = await supabase.from('notification_settings').select('*').eq('user_id', id).maybeSingle();
  if (error) {
    if (isNotSwitchedOn(error.message) || error.code === '42P01') return { settings: DEFAULT_SETTINGS, switchedOn: false };
    throw new Error(error.message);
  }
  const settings = settingsFromRow(data);
  publish(settings);
  return { settings, switchedOn: true };
}

/** Save a change. The phone's time zone rides along so quiet hours follow the rider. */
export async function saveNotificationSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const id = await userId();
  if (!id) throw new Error('Please sign in first.');
  const tz = deviceTimeZone();
  const { data, error } = await supabase
    .from('notification_settings')
    .upsert({ user_id: id, ...patch, ...(tz ? { time_zone: tz } : {}) }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const settings = settingsFromRow(data);
  publish(settings);
  track('notification_settings_saved', { keys: Object.keys(patch).join(',') });
  return settings;
}

/**
 * After sign-in: load the settings and, when the phone has moved time zones, tell the server
 * so quiet hours and meeting times match where the rider is. Never throws.
 */
export async function syncNotificationSettings(): Promise<NotificationSettings> {
  try {
    const { settings, switchedOn } = await loadNotificationSettings();
    const tz = deviceTimeZone();
    if (switchedOn && tz && settings.time_zone !== tz) {
      const id = await userId();
      if (id) {
        const { data } = await supabase.from('notification_settings').upsert({ user_id: id, time_zone: tz }, { onConflict: 'user_id' }).select().maybeSingle();
        if (data) publish(settingsFromRow(data));
      }
    }
  } catch {
    // Offline or no backend support yet: the defaults stand.
  }
  return current;
}

/** Back to the defaults after sign-out. */
export function resetNotificationSettings() {
  publish(DEFAULT_SETTINGS);
}
