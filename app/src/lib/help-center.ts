import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { helpCenterPath, helpCenterUrl } from '@/core/help-link';

/**
 * Opens the Help Center (or one guide) at onmylead.com/help. On iPhone and iPad it's a Safari view
 * over the app and on Android a Chrome custom tab, so riders come straight back when they close it.
 * On the website it's the same site, so it opens in the same tab.
 */
export async function openHelpCenter(slug?: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.assign(helpCenterPath(slug));
    return;
  }
  const url = helpCenterUrl(slug);
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: Colors.background,
      controlsColor: Colors.sky,
      secondaryToolbarColor: Colors.background,
      enableBarCollapsing: true,
    });
  } catch {
    await Linking.openURL(url).catch(() => {});
  }
}
