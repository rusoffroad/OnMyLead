import { useEffect, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font } from '@/constants/theme';
import { appVersionLabel } from '@/lib/app-update';
import { t } from '@/lib/i18n';

// The phone's own launch screen (expo-splash-screen in app.json) is a fixed picture, so it can't
// show the version. This cover is a copy of it drawn by the app (same background, same logo at the
// same size, centred) with the version and build number at the bottom. The native screen fades
// into it, it stays for the rest of the launch minimum, then fades out. Once per cold start, and
// never on the website.

const SPLASH_BG = '#0A1626';
const LOGO_WIDTH = Platform.OS === 'android' ? 200 : 280;
const LOGO_ASPECT = 578 / 842; // assets/images/splash-icon.png
const FADE_MS = 300;
const LOGO = require('../../assets/images/splash-icon.png');

let shown = false;

export function LaunchCover({ until }: { until: number }) {
  const label = appVersionLabel();
  const [up, setUp] = useState(() => !shown && !!label && Platform.OS !== 'web');
  const [opacity] = useState(() => new Animated.Value(1));
  // Takes touches while it hides the screen (no taps on a Home the rider can't see), not while fading.
  const [fading, setFading] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!up) return;
    const timer = setTimeout(() => {
      // Done once its time is up (a remount before then, say a synced theme, keeps the cover up).
      shown = true;
      setFading(true);
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => setUp(false));
    }, Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [up, until, opacity]);

  if (!up || !label) return null;
  return (
    <Animated.View pointerEvents={fading ? 'none' : 'auto'} style={[styles.cover, { opacity }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image
        source={LOGO}
        style={{ width: LOGO_WIDTH, height: Math.round(LOGO_WIDTH * LOGO_ASPECT) }}
        resizeMode="contain"
      />
      <Text style={[styles.version, { bottom: insets.bottom + 24 }]}>{t('Version {v}', { v: label })}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SPLASH_BG, alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  version: { position: 'absolute', color: 'rgba(255,255,255,0.55)', fontFamily: font(500), fontSize: 13, letterSpacing: 0.3 },
});
