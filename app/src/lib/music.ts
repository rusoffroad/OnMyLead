/**
 * Bridge to Music Controls (modules/onmylead-music). Safe everywhere: on the website and in builds
 * without the native module, `musicAvailable` is false and nothing here does anything.
 * What each platform allows is in core/music.ts.
 */
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Linking, Platform, type ViewProps } from 'react-native';

import { musicView, type MusicCommand, type MusicView } from '@/core/music';

type MusicNative = {
  getState(): Promise<Record<string, unknown>>;
  command(name: MusicCommand): Promise<void>;
  setVolume(value: number): Promise<void>;
  requestAccess(): Promise<boolean>;
  openAccessSettings(): Promise<void>;
};

const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<MusicNative>('OnMyLeadMusic');

export const musicAvailable = native != null;

/** iPhone and iPad: Apple's own volume slider, the only way Apple lets apps change the volume. */
export const SystemVolumeSlider: ComponentType<ViewProps & { tint?: string }> | null =
  native && Platform.OS === 'ios' ? requireNativeView('OnMyLeadMusic', 'MusicVolumeView') : null;

/** What is playing now, or null when the phone can't say. Never throws. */
export async function readMusic(): Promise<MusicView | null> {
  if (!native) return null;
  try {
    return musicView(await native.getState(), Platform.OS);
  } catch {
    return null;
  }
}

export async function musicCommand(c: MusicCommand): Promise<void> {
  await native?.command(c).catch(() => {});
}

export async function setMusicVolume(v: number): Promise<void> {
  await native?.setVolume(v).catch(() => {});
}

/** iPhone: Apple's prompt for song names. Android: opens Notification Access in Settings. */
export async function askMusicAccess(): Promise<void> {
  if (!native) return;
  const granted = await native.requestAccess().catch(() => false);
  // Already said no on iPhone: Apple won't ask again, so open OnMyLead's page in Settings.
  if (!granted && Platform.OS === 'ios') await native.openAccessSettings().catch(() => {});
}

const SPOTIFY = 'spotify:';

/** iPhone: whether Spotify is installed, for the Open Spotify button. */
export async function canOpenSpotify(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return Linking.canOpenURL(SPOTIFY).catch(() => false);
}

export function openSpotify() {
  Linking.openURL(SPOTIFY).catch(() => {});
}
