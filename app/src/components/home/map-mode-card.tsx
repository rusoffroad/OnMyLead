import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { font, themedStyles } from '@/constants/theme';
import { Gradient } from './parts';
import { currentLocale, t } from '@/lib/i18n';

/** Logo blue: Map Mode's own colour (the banner's button and edge, and the raised key in the tab bar). */
export const MAP_BLUE = '#2F74EA';
const SHADE = 'rgba(8,14,24,';

/**
 * Map Mode on the 3.0 home: the first card, a wide banner over the rider's own satellite map that
 * overlaps the bottom of the map header (approved mock v4, Chris 2026-11-10: "the go to nav app for
 * offroaders"). "Ride Solo" says it needs no group; the trail count says what's near. Recording,
 * Track Line and offline maps live inside Map Mode, so the banner keeps to one big button.
 */
export function MapModeBanner({ image, trailsNear }: { image: string | null; trailsNear: number | null }) {
  const near = trailsNear
    ? trailsNear === 1 ? t('1 trail near you') : t('{n} trails near you', { n: trailsNear.toLocaleString(currentLocale()) })
    : null;
  const sub = near ? `${near}. ${t('Record, explore, go offline.')}` : t('Trails, recording and offline maps.');
  const open = () => router.push('/nav');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('Open Map Mode')}. ${t('Ride Solo')}. ${sub}`}
      onPress={open}
      style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="bottom" cachePolicy="disk" accessible={false} />
      ) : (
        <Gradient colors={['#14243D', '#0B1626']} angle="diagonal" />
      )}
      <Gradient colors={[`${SHADE}0.94)`, `${SHADE}0.72)`, `${SHADE}0.15)`]} angle="across" overlay />
      <Gradient colors={[`${SHADE}0.1)`, `${SHADE}0)`, `${SHADE}0.85)`]} overlay />
      <View>
        <View style={styles.kicker}>
          <Icon name="map" size={15} color="#7FB2FF" strokeWidth={2.2} />
          <Text style={styles.kickerText}>{t('Ride Solo')}</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{t('Map Mode')}</Text>
        <Text style={styles.sub} numberOfLines={2}>{sub}</Text>
      </View>
      <View style={styles.button}>
        <Icon name="map" size={20} color="#fff" strokeWidth={2.2} />
        <Text style={styles.buttonText} numberOfLines={1}>{t('Open Map Mode')}</Text>
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: {
    minHeight: 224, borderRadius: 22, overflow: 'hidden', padding: 16, justifyContent: 'space-between', gap: 14, backgroundColor: '#0B1626',
    borderWidth: 1.5, borderColor: 'rgba(110,165,255,0.7)', boxShadow: '0px 18px 36px -14px rgba(0, 0, 0, 0.7)',
  },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerText: { color: '#A9C9FF', fontFamily: font(600), fontSize: 13.5 },
  title: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 40, lineHeight: 44, marginTop: 2 },
  sub: { color: '#E6EBF1', fontFamily: font(600), fontSize: 14, lineHeight: 19, maxWidth: 250, marginTop: 4, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 },
  button: {
    minHeight: 56, borderRadius: 14, backgroundColor: MAP_BLUE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    boxShadow: 'inset 0px 1px 0px rgba(255, 255, 255, 0.25)',
  },
  buttonText: { color: '#fff', fontFamily: font(700), fontSize: 17 },
}));
