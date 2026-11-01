import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { noticeForVersion, updateState, type UpdateState, type VersionNotice } from '@/core/app-versions';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/constants/site';
import { useAppSettings } from './app-settings';

// The owner's release controls (Admin Dashboard > Releases) applied to this build. The website is
// always the newest code, so it never sees any of this.

/** This build's version from app.json ("1.0.3"), or null on the website. */
export function appVersion(): string | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  return Constants.expoConfig?.version ?? null;
}

/** Opens OnMyLead's page in the App Store or Google Play. */
export function openStore(): void {
  const url = Platform.OS === 'android' ? PLAY_STORE_URL : APP_STORE_URL;
  if (url) Linking.openURL(url).catch(() => {});
}

export function useUpdateState(): UpdateState {
  return updateState(useAppSettings().settings.versions, Platform.OS, appVersion());
}

export function useVersionNotice(): VersionNotice | null {
  return noticeForVersion(useAppSettings().settings.versions, Platform.OS, appVersion());
}
