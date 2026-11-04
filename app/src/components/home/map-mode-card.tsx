import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { Gradient } from './parts';
import { currentLocale, t } from '@/lib/i18n';

/** Logo blue, deepening to the bottom corner: Map Mode's own colour, next to Join's red. */
const BLUE = ['#4C95FF', '#2F6FE0', '#1A4AA8'];
const BLUE_INK = '#1A4AA8';

/** A trail and a rider dot drawn in the card's corner, the way the topo lines sit on Join's red. */
function TrailArt() {
  return (
    <View pointerEvents="none" style={styles.art}>
      <Svg width={170} height={110} viewBox="0 0 170 110" fill="none">
        <Path d="M0 100c30-20 40-55 80-55s50 25 90-25" stroke="#fff" strokeOpacity={0.16} strokeWidth={1.4} />
        <Path d="M10 80c30-20 45-50 75-50s50 20 85-25" stroke="#fff" strokeOpacity={0.16} strokeWidth={1.4} />
        <Path d="M30 110c25-20 40-40 70-40s45 20 70-10" stroke="#fff" strokeOpacity={0.16} strokeWidth={1.4} />
        <Path d="M40 60c20-6 30-28 56-28s40 12 74-26" stroke="#fff" strokeOpacity={0.4} strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" />
        <Circle cx={96} cy={32} r={5.5} fill={Colors.accent} stroke="#fff" strokeWidth={2} />
      </Svg>
    </View>
  );
}

/**
 * Map Mode on the home screen: a blue action card in the same family as Join a Ride, under Create,
 * Find and Events. Open Map Mode, Map a Custom Trail (draw one that isn't on any map), and the
 * Track Line switch as a small chip beside the title. Kept short so Join, Create, Find, Events and
 * Map Mode all fit on one phone screen (Chris 2026-11-04); the description and the rider-trail
 * count are read out by screen readers.
 */
export function MapModeCard({
  trailsNear, trackOn, onTrack,
}: { trailsNear: number | null; trackOn: boolean; onTrack: (on: boolean) => void }) {
  const near = trailsNear
    ? ` ${trailsNear === 1 ? t('1 trail near you') : t('{n} trails near you', { n: trailsNear.toLocaleString(currentLocale()) })}.`
    : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('Open Map Mode')}. ${t('Riding solo? Your offroad map with speed, elevation, rider trails and your own.')}${near}`}
      onPress={() => router.push('/nav')}
      style={styles.card}>
      <Gradient colors={BLUE} angle="diagonal" radius={26} />
      <TrailArt />
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Icon name="map" size={26} color="#fff" strokeWidth={2.4} />
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('Map Mode')}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: trackOn }}
          accessibilityLabel={t('Track Line. Draws where you’ve been, a new color each day')}
          hitSlop={6}
          onPress={() => onTrack(!trackOn)}
          style={styles.track}>
          <Text style={styles.trackTitle} numberOfLines={1}>{t('Track Line')}</Text>
          <View style={[styles.knob, trackOn && styles.knobOn]}>
            <View style={[styles.dot, trackOn && styles.dotOn]} />
          </View>
        </Pressable>
      </View>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/nav')}
          style={({ pressed }) => [styles.btn, styles.btnGo, pressed && { opacity: 0.85 }]}>
          <Icon name="map" size={18} color={BLUE_INK} strokeWidth={2.4} />
          <Text style={[styles.btnText, { color: BLUE_INK }]} numberOfLines={2}>{t('Open Map Mode')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Map a Custom Trail. Draw a trail that isn’t marked anywhere')}
          onPress={() => router.push('/nav?draw=1')}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
          <Icon name="draw" size={18} color="#fff" strokeWidth={2.2} />
          <Text style={styles.btnText} numberOfLines={2}>{t('Map a Custom Trail')}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: { borderRadius: 26, paddingHorizontal: 18, paddingVertical: 16, overflow: 'hidden', gap: 12 },
  art: { position: 'absolute', right: 80, top: -40, opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, color: '#fff', fontFamily: font(800, 'display'), fontSize: 34, lineHeight: 36 },
  track: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, borderRadius: 16, paddingLeft: 11, paddingRight: 4,
    backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', flexShrink: 0, maxWidth: '55%',
  },
  trackTitle: { color: '#fff', fontFamily: font(700), fontSize: 13, flexShrink: 1 },
  knob: { width: 36, height: 22, borderRadius: 11, padding: 2, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'center' },
  knobOn: { backgroundColor: '#0F2F6E', alignItems: 'flex-end' },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.7)' },
  dotOn: { backgroundColor: '#fff' },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', backgroundColor: 'rgba(0,0,0,0.18)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: Spacing.two, paddingVertical: 6,
  },
  btnGo: { backgroundColor: '#fff', borderColor: 'transparent' },
  btnText: { color: '#fff', fontFamily: font(700), fontSize: 14, lineHeight: 17, flexShrink: 1, textAlign: 'center' },
}));
