import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { rideCardLines, type RideCardData } from '@/core/summary';

const banner = require('../../assets/images/logo-banner.png');

/**
 * The shareable ride card. What you see is what gets shared: ride name, date, your distance
 * and the rider count, with the OnMyLead logo and the RUS Offroad mark. Never a meeting point,
 * a route or anyone else's track.
 */
export const RideCard = forwardRef<View, { card: RideCardData }>(function RideCard({ card }, ref) {
  const { title, date, stats } = rideCardLines(card);
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Image source={banner} contentFit="contain" style={styles.logo} accessibilityLabel="OnMyLead" />
      <View style={styles.body}>
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.title} numberOfLines={3}>{title}</Text>
        <View style={styles.stats}>
          {stats.map((s) => (
            <Text key={s} style={styles.stat}>{s}</Text>
          ))}
        </View>
      </View>
      <Text style={styles.mark}>presented by RUS Offroad</Text>
    </View>
  );
});

export const CARD_COLORS = { background: '#020A14', text: '#ffffff', muted: '#9AA4B2', accent: '#F0313A' };

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: 1, backgroundColor: CARD_COLORS.background, borderRadius: 18, padding: 20, justifyContent: 'space-between' },
  logo: { width: '100%', height: '24%' },
  body: { gap: 6 },
  date: { color: CARD_COLORS.muted, fontSize: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: CARD_COLORS.text, fontSize: 30, fontWeight: '900' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  stat: { color: CARD_COLORS.accent, fontSize: 24, fontWeight: '900' },
  mark: { color: CARD_COLORS.muted, fontSize: 13, fontWeight: '600', textAlign: 'right' },
});
