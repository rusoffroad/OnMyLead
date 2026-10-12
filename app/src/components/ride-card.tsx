import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/constants/theme';
import { rideCardLines, type RideCardData } from '@/core/summary';

const wordmark = require('../../assets/images/logo-wordmark.png');

export type CardLayout = 'standard' | 'stats' | 'big';
export const CARD_LAYOUTS: { value: CardLayout; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'stats', label: 'Full Stats' },
  { value: 'big', label: 'Big Number' },
];
/** Extra numbers for the premium layouts, already formatted ("2h 14m", "48 mph"). */
export type CardExtras = { movingTime: string | null; topSpeed: string | null; climbing: string | null };

/**
 * The shareable ride card. What you see is what gets shared: ride name, date, your distance
 * and the rider count, with the OnMyLead logo and the RUS Offroad mark. Never a meeting point,
 * a route or anyone else's track. Pro adds two layouts: Full Stats and Big Number.
 */
export const RideCard = forwardRef<View, { card: RideCardData; layout?: CardLayout; extras?: CardExtras }>(function RideCard(
  { card, layout = 'standard', extras },
  ref,
) {
  const { title, date, stats } = rideCardLines(card);
  const miles = card.distanceMiles != null && card.distanceMiles > 0
    ? card.distanceMiles < 10 ? card.distanceMiles.toFixed(1) : String(Math.round(card.distanceMiles))
    : null;
  const riders = `${card.riderCount} ${card.riderCount === 1 ? 'rider' : 'riders'}`;

  if (layout === 'big' && miles) {
    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <Image source={wordmark} contentFit="contain" style={styles.logoSmall} accessibilityLabel="OnMyLead" />
        <View>
          <Text style={styles.bigNumber} numberOfLines={1} adjustsFontSizeToFit>{miles}</Text>
          <Text style={styles.bigUnit}>miles on {title}</Text>
          <Text style={styles.date}>{`${date}, ${riders}`}</Text>
        </View>
        <Text style={styles.mark}>Presented by RUS Offroad</Text>
      </View>
    );
  }

  if (layout === 'stats') {
    const tiles = [
      { label: 'Miles', value: miles },
      { label: 'Moving', value: extras?.movingTime ?? null },
      { label: 'Top Speed', value: extras?.topSpeed ?? null },
      { label: 'Climbing', value: extras?.climbing ?? null },
    ].filter((t): t is { label: string; value: string } => !!t.value);
    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <Image source={wordmark} contentFit="contain" style={styles.logoSmall} accessibilityLabel="OnMyLead" />
        <View style={styles.body}>
          <Text style={styles.date}>{date}</Text>
          <Text style={[styles.title, { fontSize: 32, lineHeight: 34 }]} numberOfLines={2}>{title}</Text>
          <View style={styles.tiles}>
            {tiles.map((t) => (
              <View key={t.label} style={styles.tile}>
                <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{t.value}</Text>
                <Text style={styles.tileLabel}>{t.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.date}>{riders}</Text>
        </View>
        <Text style={styles.mark}>Presented by RUS Offroad</Text>
      </View>
    );
  }

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Image source={wordmark} contentFit="contain" style={styles.logo} accessibilityLabel="OnMyLead" />
      <View style={styles.body}>
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.title} numberOfLines={3}>{title}</Text>
        <View style={styles.stats}>
          {stats.map((s) => (
            <Text key={s} style={styles.stat}>{s}</Text>
          ))}
        </View>
      </View>
      <Text style={styles.mark}>Presented by RUS Offroad</Text>
    </View>
  );
});

export const CARD_COLORS = { background: '#0A1626', text: '#ffffff', muted: '#9AA4B2', accent: '#FF4048' };

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: 1, backgroundColor: CARD_COLORS.background, borderRadius: 18, padding: 20, justifyContent: 'space-between' },
  logo: { width: '100%', height: '24%' },
  body: { gap: 6 },
  date: { color: CARD_COLORS.muted, fontSize: 16, fontFamily: font(600) },
  title: { color: CARD_COLORS.text, fontSize: 38, lineHeight: 40, fontFamily: font(800, 'display') },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  stat: { color: CARD_COLORS.accent, fontSize: 28, fontFamily: font(700, 'display') },
  logoSmall: { width: '62%', height: '15%' },
  bigNumber: { color: CARD_COLORS.accent, fontSize: 150, lineHeight: 150, fontFamily: font(800, 'display'), letterSpacing: -3 },
  bigUnit: { color: CARD_COLORS.text, fontSize: 30, lineHeight: 32, fontFamily: font(800, 'display'), marginBottom: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  tile: { width: '50%', paddingVertical: 6, paddingRight: 10, borderTopWidth: 2, borderTopColor: 'rgba(255,64,72,0.55)' },
  tileValue: { color: CARD_COLORS.text, fontSize: 30, lineHeight: 34, fontFamily: font(800, 'display') },
  tileLabel: { color: CARD_COLORS.muted, fontSize: 14, fontFamily: font(600) },
  mark: { color: CARD_COLORS.muted, fontSize: 13, fontFamily: font(600), textAlign: 'right' },
});
