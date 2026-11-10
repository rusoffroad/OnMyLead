import { Image } from 'expo-image';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, font, themedStyles } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import { heroMapUrl } from '@/core/home';
import { positionIfAllowed } from '@/lib/location';
import { MAPBOX_TOKEN } from '@/lib/terrain';
import { Gradient } from './parts';

/** The night navy the header text sits on in every theme: the map picture is dark, light theme or not. */
const SHADE = '#0A1019';
/** Light text over the map picture, whatever the theme. */
export const ON_MAP = '#F5F7FA';

/** The rider's rounded spot, looked up once per app session (never asks for location). */
let heroSpot: { lat: number; lng: number } | null | undefined;

/** The satellite picture for the home map: the rider's area (rounded to about 5 km) or a fixed spot. */
export function useHeroMap(width: number, height: number): string | null {
  const [at, setAt] = useState(heroSpot ?? null);
  useEffect(() => {
    if (heroSpot !== undefined) return;
    let gone = false;
    positionIfAllowed()
      .then((p) => {
        heroSpot = p;
        if (!gone) setAt(p);
      })
      .catch(() => {
        heroSpot = null;
      });
    return () => {
      gone = true;
    };
  }, []);
  return heroMapUrl(at, MAPBOX_TOKEN, width, height);
}

/**
 * The top of the 3.0 home: the rider's own satellite map, full bleed behind the status bar,
 * fading into the page, with the header and greeting drawn over it (approved mock, Chris
 * 2026-11-10). The page's Join a Ride card overlaps its bottom edge. Without a Mapbox token
 * (or offline before the picture is cached) the header sits on the plain background.
 */
export function HomeHero({ url, height, children }: { url: string | null; height: number; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { height: height + insets.top, paddingTop: insets.top }]}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          transition={250}
          accessible={false}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Gradient
        colors={url
          ? [withAlpha(SHADE, 0.78), withAlpha(SHADE, 0.12), withAlpha(SHADE, 0), withAlpha(SHADE, 0.55), Colors.background]
          : [SHADE, SHADE, Colors.background]}
        overlay={!!url}
      />
      <View style={styles.inner}>{children}</View>
      {/* Mapbox and Maxar are credited on every map; the picture's own credit is switched off so it can sit here. */}
      {url ? <Text style={styles.credit} accessibilityLabel="Map imagery © Mapbox © Maxar">© Mapbox © Maxar</Text> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  hero: { overflow: 'hidden' },
  inner: { flex: 1 },
  credit: { position: 'absolute', right: 10, bottom: 84, color: 'rgba(245,247,250,0.55)', fontFamily: font(500), fontSize: 9 },
}));
