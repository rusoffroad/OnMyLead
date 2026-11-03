import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BottomSheet } from '@/components/bottom-sheet';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { RADIUS_CHOICES, radiusLabel } from '@/core/home';
import type { Ride } from '@/lib/types';
import { Home, homeStyles, HomeCard, Pill } from './parts';

type Near = Ride & { distanceMi?: number };

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};
const distance = (mi: number | undefined) => (mi == null ? null : mi < 1 ? 'Under 1 mi' : `${Math.round(mi).toLocaleString('en-US')} mi away`);

/** A small map-like header: contour lines and the meeting area pin (never the exact spot). */
function CardMap({ seed }: { seed: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const shift = Math.abs(h % 40) - 20;
  return (
    <Svg width="100%" height={100} viewBox="0 0 260 100" preserveAspectRatio="xMidYMid slice">
      <Rect x={0} y={0} width={260} height={100} fill="#0D2236" />
      <Path d={`M-10 ${70 + shift / 4} C60 ${40 + shift} 110 90 170 ${60 - shift / 2} S240 30 280 40`} stroke="#1A3550" strokeWidth={1.2} fill="none" />
      <Path d={`M-10 ${50 + shift / 4} C70 ${20 + shift} 120 70 180 ${40 - shift / 2} S250 10 280 20`} stroke="#1A3550" strokeWidth={1.2} fill="none" />
      <Path d={`M-10 ${92 + shift / 4} C50 ${66 + shift} 100 100 160 ${82 - shift / 2} S240 58 280 66`} stroke="#16304A" strokeWidth={1.2} fill="none" />
      <Circle cx={130 + shift} cy={52} r={16} fill="rgba(229,38,46,0.18)" />
      <Circle cx={130 + shift} cy={52} r={6} fill={Colors.accent} stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}

/** Public Rides Near You: a sideways rail of ride cards, nearest first. */
export function PublicRidesRail({ rides, width }: { rides: Near[]; width: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + 12}
      decelerationRate="fast"
      contentContainerStyle={{ gap: 12, paddingRight: Spacing.three }}>
      {rides.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="link"
          accessibilityLabel={`${r.name}, ${when(r.meet_at)}${r.meet_area_label ? `, near ${r.meet_area_label}` : ''}`}
          onPress={() => router.push(`/r/${r.invite_code}`)}
          style={({ pressed }) => [{ width }, pressed && { opacity: 0.88 }]}>
          <HomeCard>
            <CardMap seed={r.id} />
            <View style={styles.pills}>
              {r.status === 'live' ? <Pill text="Live Now" tone="out" /> : null}
              {distance(r.distanceMi) ? <Pill tone="dark" text={distance(r.distanceMi)!} /> : null}
            </View>
            <View style={styles.body}>
              <Text style={homeStyles.cardTitle} numberOfLines={1}>{r.name}</Text>
              <Text style={homeStyles.muted} numberOfLines={1}>{when(r.meet_at)}</Text>
              {r.meet_area_label ? <Text style={homeStyles.muted} numberOfLines={1}>Near {r.meet_area_label}</Text> : null}
            </View>
          </HomeCard>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** The distance chip at the right of the section title. */
export function RadiusChip({ radius, onPress }: { radius: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Showing rides ${radius === 0 ? 'anywhere' : `within ${radiusLabel(radius)}`}. Change distance`}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}>
      <Icon name="locate" size={14} color={Colors.text} />
      <Text style={styles.chipText}>{radius === 0 ? 'Anywhere' : `Within ${radiusLabel(radius)}`}</Text>
    </Pressable>
  );
}

/** How far Public Rides Near You looks. Remembered on this phone. */
export function RadiusSheet({
  visible, radius, located, onPick, onClose,
}: { visible: boolean; radius: number; located: boolean; onPick: (mi: number) => void; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Show Rides Within" footer={<Button title="Done" onPress={onClose} />}>
      <Text style={styles.big}>
        {radius === 0 ? 'Anywhere' : radius.toLocaleString('en-US')}
        {radius === 0 ? null : <Text style={styles.bigUnit}> miles</Text>}
      </Text>
      <View style={styles.presets}>
        {RADIUS_CHOICES.map((mi) => (
          <Pressable
            key={mi}
            accessibilityRole="radio"
            accessibilityState={{ checked: mi === radius }}
            onPress={() => onPick(mi)}
            style={[styles.preset, mi === radius && styles.presetOn]}>
            <Text style={styles.presetText}>{radiusLabel(mi)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={homeStyles.muted}>
        {located
          ? 'Measured from where you are now, to each ride’s meeting area.'
          : 'Allow location for OnMyLead to sort rides by distance. Until then you see every public ride coming up.'}
      </Text>
    </BottomSheet>
  );
}

const styles = themedStyles(() => ({
  pills: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', gap: 6 },
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: Home.line,
    backgroundColor: Home.panel, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipText: { color: Colors.text, fontFamily: font(600), fontSize: 13 },
  big: { color: Colors.text, fontFamily: font(500, 'display'), fontSize: 52, lineHeight: 56 },
  bigUnit: { color: Home.muted, fontFamily: font(500), fontSize: 20 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { borderRadius: Radius.pill, borderWidth: 1, borderColor: Home.line, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, justifyContent: 'center' },
  presetOn: { borderColor: Colors.accent, backgroundColor: 'rgba(229,38,46,0.14)' },
  presetText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
}));
