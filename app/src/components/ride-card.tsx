import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/constants/theme';
import { rideCardLines, type RideCardData } from '@/core/summary';

const wordmark = require('../../assets/images/logo-wordmark.png');

/**
 * The shareable ride card. What you see is what gets shared: ride name, date, your distance
 * and the rider count, with the OnMyLead logo and the RUS Offroad mark. Never a meeting point,
 * a route or anyone else's track.
 */
export const RideCard = forwardRef<View, { card: RideCardData }>(function RideCard({ card }, ref) {
  const { title, date, stats } = rideCardLines(card);
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
  mark: { color: CARD_COLORS.muted, fontSize: 13, fontFamily: font(600), textAlign: 'right' },
});
