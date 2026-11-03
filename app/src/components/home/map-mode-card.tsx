import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Colors, font, Spacing } from '@/constants/theme';
import { dayLines, TRACK_DAY_COLORS, type TrackDays } from '@/core/track-line';
import { RIDER_TRAIL_INK } from '@/core/nav-trails';
import { Home, homeStyles, HomeCard, Pill } from './parts';

const W = 340;
const H = 120;

/** The rider's own Track Line squeezed into the card, or a quiet trail-map sketch before there is one. */
function MiniMap({ days }: { days: TrackDays }) {
  // Colours are by day: the moment the card first drew is close enough to now.
  const [now] = useState(() => Date.now());
  const lines = useMemo(() => dayLines(days, now), [days, now]);
  const drawn = useMemo(() => {
    const pts = lines.flatMap((d) => d.pieces.flat());
    if (pts.length < 2) return null;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of pts) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    }
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = Math.max((maxLng - minLng) * k, 1e-5);
    const spanY = Math.max(maxLat - minLat, 1e-5);
    const pad = 16;
    const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
    const ox = (W - spanX * scale) / 2;
    const oy = (H - spanY * scale) / 2;
    const xy = (p: { lat: number; lng: number }) => `${(ox + (p.lng - minLng) * k * scale).toFixed(1)},${(oy + (maxLat - p.lat) * scale).toFixed(1)}`;
    return lines.map((d) => ({ key: d.key, color: d.color, pieces: d.pieces.map((piece) => piece.map(xy).join(' ')) }));
  }, [lines]);

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      <Rect x={0} y={0} width={W} height={H} fill="#0D2236" />
      <Path d="M-10 90 C60 60 120 100 190 70 S300 40 360 60" stroke="#1A3550" strokeWidth={1.2} fill="none" />
      <Path d="M-10 70 C70 40 130 80 200 50 S310 20 360 36" stroke="#1A3550" strokeWidth={1.2} fill="none" />
      <Path d="M-10 110 C50 85 110 120 180 95 S290 70 360 86" stroke="#1A3550" strokeWidth={1.2} fill="none" />
      <Path d="M-10 48 C80 20 140 58 210 30 S320 4 360 14" stroke="#16304A" strokeWidth={1.2} fill="none" />
      {drawn ? (
        drawn.map((d) => d.pieces.map((pts, i) => (
          <Polyline key={`${d.key}${i}`} points={pts} stroke={d.color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        )))
      ) : (
        <>
          <Path d="M24 100 C70 92 90 60 140 62 S210 88 250 54 S300 30 322 26" stroke={RIDER_TRAIL_INK} strokeWidth={3} strokeDasharray="7 6" strokeLinecap="round" fill="none" />
          <Path d="M40 30 C90 40 120 30 160 38 S230 70 300 96" stroke={TRACK_DAY_COLORS[1]} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.85} />
          <Circle cx={140} cy={62} r={6} fill={Colors.accent} stroke="#fff" strokeWidth={2} />
        </>
      )}
    </Svg>
  );
}

/**
 * Map Mode on the home screen: the offroad map for riding solo, in the same card language as the
 * ride and group cards. Open Map, Map a Custom Trail (draw one that isn't on any map), and the
 * Track Line switch with its day colours.
 */
export function MapModeCard({
  days, trailsNear, trackOn, onTrack,
}: { days: TrackDays; trailsNear: number | null; trackOn: boolean; onTrack: (on: boolean) => void }) {
  return (
    <HomeCard>
      <Pressable accessibilityRole="button" accessibilityLabel="Open Map Mode" onPress={() => router.push('/nav')}>
        <MiniMap days={days} />
        <View style={styles.mapPill}>
          <Pill tone="dark" text={trailsNear ? `${trailsNear.toLocaleString('en-US')} rider ${trailsNear === 1 ? 'trail' : 'trails'} near you` : 'Offroad map and rider trails'} />
        </View>
      </Pressable>
      <View style={styles.body}>
        <View>
          <Text style={styles.title} accessibilityRole="header">Map Mode</Text>
          <Text style={homeStyles.muted}>Riding solo? Your offroad map, rider trails and your own.</Text>
        </View>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/nav')}
            style={({ pressed }) => [styles.btn, styles.btnGo, pressed && { opacity: 0.85 }]}>
            <Icon name="map" size={18} color={Colors.background} strokeWidth={2.4} />
            <Text style={[styles.btnText, { color: Colors.background }]}>Open Map</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Map a Custom Trail. Draw a trail that isn't marked anywhere"
            onPress={() => router.push('/nav?draw=1')}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
            <Icon name="draw" size={18} color={Colors.text} strokeWidth={2.2} />
            <Text style={styles.btnText} numberOfLines={1}>Map a Custom Trail</Text>
          </Pressable>
        </View>
        <View style={styles.track}>
          <Icon name="trackLine" size={22} color={trackOn ? TRACK_DAY_COLORS[0] : Home.muted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.trackTitle}>Track Line</Text>
            <View style={styles.days}>
              {[['Today', TRACK_DAY_COLORS[0]], ['Yesterday', TRACK_DAY_COLORS[1]], ['Older', TRACK_DAY_COLORS[2]]].map(([label, c]) => (
                <View key={label} style={styles.day}>
                  <View style={[styles.dayLine, { backgroundColor: c }]} />
                  <Text style={styles.dayText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
          <Switch
            value={trackOn}
            onValueChange={onTrack}
            accessibilityLabel="Track Line. Draws where you've been, a new colour each day"
            trackColor={{ true: Colors.sky, false: Home.panel2 }}
            thumbColor="#fff"
          />
        </View>
      </View>
    </HomeCard>
  );
}

const styles = StyleSheet.create({
  mapPill: { position: 'absolute', left: 10, top: 10 },
  body: { padding: 16, paddingTop: 14, gap: 12 },
  title: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 24, lineHeight: 26 },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: Home.line, backgroundColor: Home.panel2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: Spacing.two,
  },
  btnGo: { backgroundColor: Colors.text, borderColor: 'transparent' },
  btnText: { color: Colors.text, fontFamily: font(700), fontSize: 14, flexShrink: 1 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Home.line },
  trackTitle: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayLine: { width: 14, height: 3, borderRadius: 2 },
  dayText: { color: Home.muted, fontFamily: font(500), fontSize: 12 },
});
