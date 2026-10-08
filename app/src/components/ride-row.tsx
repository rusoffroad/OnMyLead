import { Link } from 'expo-router';
import { Fragment, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Ride } from '@/lib/types';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Rows that share one surface, divided by hairlines, like an iOS grouped list. */
export function RowGroup({ children }: { children: ReactNode[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
      {children.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/** The calendar block on a ride row: weekday, day and month, or a red Live block. */
function DateBlock({ ride }: { ride: Ride }) {
  const theme = useTheme();
  const d = new Date(ride.meet_at);
  if (ride.status === 'live') {
    return (
      <View style={[styles.date, { backgroundColor: theme.accent }]}>
        <View style={styles.liveDot} />
        <Text style={[styles.dateSmall, { color: '#fff' }]}>Live</Text>
      </View>
    );
  }
  return (
    <View style={[styles.date, { backgroundColor: theme.backgroundSelected }]}>
      <Text style={[styles.dateSmall, { color: theme.textSecondary }]}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
      <Text style={[styles.dateDay, { color: theme.text }]}>{d.getDate()}</Text>
      <Text style={[styles.dateSmall, { color: theme.textSecondary }]}>{d.toLocaleDateString(undefined, { month: 'short' })}</Text>
    </View>
  );
}

export function RideRow({ ride, note }: { ride: Ride; note?: string }) {
  const theme = useTheme();
  const meta = [
    ride.status === 'live' ? 'Riding now' : clock(ride.meet_at),
    ride.meet_area_label ? `near ${ride.meet_area_label}` : null,
  ].filter(Boolean).join(', ');
  return (
    <Link href={`/r/${ride.invite_code}`} asChild>
      <Pressable accessibilityRole="link" style={styles.row}>
        <DateBlock ride={ride} />
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={{ fontSize: 17, lineHeight: 22, fontWeight: 700 }} numberOfLines={2}>{ride.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{meta}</ThemedText>
          {ride.difficulty || note ? (
            <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 2 }}>
              {ride.difficulty ? <ThemedText type="small" style={{ color: theme.sky, fontWeight: 600 }}>{ride.difficulty}</ThemedText> : null}
              {note ? <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText> : null}
            </View>
          ) : null}
        </View>
        <Icon name="chevron" size={20} color={theme.textSecondary} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: Radius.card, overflow: 'hidden' },
  divider: { height: 1, marginLeft: 84 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: 14 },
  date: { width: 54, height: 62, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 0 },
  dateSmall: { fontSize: 12, lineHeight: 14, fontFamily: font(600) },
  dateDay: { fontSize: 26, lineHeight: 28, fontFamily: font(700, 'display') },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', marginBottom: 4 },
});
