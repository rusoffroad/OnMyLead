import { router } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { TRACK_DAY_COLORS } from '@/core/track-line';
import { Gradient, Pill } from './parts';
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
 * Map Mode on the home screen: a blue action card in the same family as Join a Ride, right under
 * Create and Find. Open Map Mode, Map a Custom Trail (draw one that isn't on any map), and the
 * Track Line switch with its day colours.
 */
export function MapModeCard({
  trailsNear, trackOn, onTrack,
}: { trailsNear: number | null; trackOn: boolean; onTrack: (on: boolean) => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Open Map Mode')} onPress={() => router.push('/nav')} style={styles.card}>
      <Gradient colors={BLUE} angle="diagonal" radius={28} />
      <TrailArt />
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Icon name="map" size={30} color="#fff" strokeWidth={2.4} />
            <Text style={styles.title} accessibilityRole="header">{t('Map Mode')}</Text>
          </View>
          <Text style={styles.detail}>{t('Riding solo? Your offroad map with speed, elevation, rider trails and your own.')}</Text>
        </View>
        {trailsNear ? (
          <Pill tone="onRed" text={trailsNear === 1 ? t('1 trail near you') : t('{n} trails near you', { n: trailsNear.toLocaleString(currentLocale()) })} />
        ) : null}
      </View>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/nav')}
          style={({ pressed }) => [styles.btn, styles.btnGo, pressed && { opacity: 0.85 }]}>
          <Icon name="map" size={18} color={BLUE_INK} strokeWidth={2.4} />
          <Text style={[styles.btnText, { color: BLUE_INK }]}>{t('Open Map Mode')}</Text>
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
      <View style={styles.track}>
        <Icon name="trackLine" size={22} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={styles.trackTitle}>{t('Track Line')}</Text>
          <View style={styles.days}>
            {[['Today', TRACK_DAY_COLORS[0]], ['Yesterday', TRACK_DAY_COLORS[1]], ['Older', TRACK_DAY_COLORS[2]]].map(([label, c]) => (
              <View key={label} style={styles.day}>
                <View style={[styles.dayLine, { backgroundColor: c }]} />
                <Text style={styles.dayText}>{t(label)}</Text>
              </View>
            ))}
          </View>
        </View>
        <Switch
          value={trackOn}
          onValueChange={onTrack}
          accessibilityLabel={t('Track Line. Draws where you’ve been, a new color each day')}
          trackColor={{ true: '#0F2F6E', false: 'rgba(0,0,0,0.28)' }}
          thumbColor="#fff"
        />
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: { borderRadius: 28, padding: 22, overflow: 'hidden', gap: Spacing.three },
  art: { position: 'absolute', right: -10, top: -8 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#fff', fontFamily: font(800, 'display'), fontSize: 44, lineHeight: 44 },
  detail: { color: 'rgba(255,255,255,0.86)', fontFamily: font(500), fontSize: 15, lineHeight: 20, marginTop: 6 },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', backgroundColor: 'rgba(0,0,0,0.18)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: Spacing.two, paddingVertical: 6,
  },
  btnGo: { backgroundColor: '#fff', borderColor: 'transparent' },
  btnText: { color: '#fff', fontFamily: font(700), fontSize: 14, lineHeight: 17, flexShrink: 1, textAlign: 'center' },
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.22)' },
  trackTitle: { color: '#fff', fontFamily: font(700), fontSize: 15 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayLine: { width: 16, height: 5, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)' },
  dayText: { color: 'rgba(255,255,255,0.8)', fontFamily: font(500), fontSize: 12 },
}));
