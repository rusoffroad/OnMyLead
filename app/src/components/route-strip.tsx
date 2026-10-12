import { StyleSheet, Text, View } from 'react-native';

import { Colors, font, RideColors } from '@/constants/theme';
import type { MyRouteSummary, PlacedRider } from '@/core/route';

/**
 * The whole route as one straight line, start to finish, with every sharing rider placed by how
 * far along they are. One glance answers "where am I compared with everyone else?" without
 * reading a map.
 */
export function RouteStrip({
  lengthM, riders, meId, summary, nameOf, offline,
}: {
  lengthM: number;
  riders: PlacedRider[];
  meId: string | undefined;
  summary: MyRouteSummary | null;
  nameOf: (id: string) => string;
  offline?: boolean;
}) {
  const pct = (m: number) => `${Math.max(0, Math.min(100, (m / Math.max(1, lengthM)) * 100))}%` as const;
  const placed = riders.filter((r) => r.place);
  const me = placed.find((r) => r.id === meId);
  // Draw me last so my dot sits on top of anyone at the same spot.
  const order = [...placed.filter((r) => r.id !== meId), ...(me ? [me] : [])];

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={
        summary
          ? `Mile ${summary.doneMi} of ${summary.totalMi}. ${summary.compared} ${summary.offRoute ?? ''}`
          : `Route, ${placed.length} riders on it`
      }>
      <View style={styles.head}>
        {summary ? (
          <Text style={styles.big}>
            {summary.doneMi}
            <Text style={styles.of}> of {summary.totalMi} mi</Text>
          </Text>
        ) : (
          <Text style={styles.of}>Route · {placed.length ? `${placed.length} on the line` : 'nobody placed yet'}</Text>
        )}
        <Text style={styles.toGo}>{summary ? summary.toGo : offline ? 'Saved route, no signal' : ''}</Text>
      </View>

      <View style={styles.track}>
        <View style={styles.rail} />
        {me?.place ? <View style={[styles.done, { width: pct(me.place.alongM) }]} /> : null}
        <View style={[styles.cap, { left: 0, backgroundColor: RideColors.green }]} />
        <View style={[styles.cap, styles.finish, { right: 0 }]} />
        {order.map((r) => {
          const mine = r.id === meId;
          const color = r.role === 'leader' ? RideColors.leader : r.role === 'sweep' ? RideColors.sweep : mine ? Colors.accent : RideColors.rider;
          const size = mine ? 30 : r.role === 'leader' ? 28 : r.role === 'sweep' ? 24 : 18;
          const letter = mine ? 'You' : r.role === 'leader' ? 'L' : r.role === 'sweep' ? 'S' : nameOf(r.id).slice(0, 1).toUpperCase();
          return (
            <View
              key={r.id}
              style={[
                styles.dot,
                {
                  left: pct(r.place!.alongM),
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                  backgroundColor: r.place!.onRoute ? color : Colors.background,
                  borderColor: r.place!.onRoute ? (mine ? Colors.text : Colors.background) : color,
                  zIndex: mine ? 3 : r.role === 'rider' ? 1 : 2,
                },
              ]}>
              {size > 18 ? <Text style={[styles.letter, mine && { fontSize: 10 }]}>{letter}</Text> : null}
            </View>
          );
        })}
      </View>

      {summary ? (
        <Text style={styles.compared}>
          {summary.offRoute ? <Text style={{ color: RideColors.yellow }}>{summary.offRoute} </Text> : null}
          {summary.compared}
        </Text>
      ) : (
        <Text style={styles.compared}>Share your location to see where you are on the route.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingHorizontal: 4, paddingBottom: 4 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  big: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 34, lineHeight: 36 },
  of: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 20 },
  toGo: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14 },
  track: { height: 34, justifyContent: 'center', marginHorizontal: 10 },
  rail: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: Colors.backgroundSelected },
  done: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  cap: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, marginRight: -6, borderWidth: 2, borderColor: Colors.background },
  finish: { backgroundColor: Colors.text },
  dot: { position: 'absolute', top: '50%', borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontFamily: font(800), fontSize: 11 },
  compared: { color: Colors.text, fontFamily: font(600), fontSize: 15, lineHeight: 20 },
});
