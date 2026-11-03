import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Colors, font, RideColors, themedStyles } from '@/constants/theme';
import type { FreerideSummary } from '@/core/freeride';
import type { RangeCheck } from '@/core/fuel';
import { initialOf } from '@/core/profile';
import type { MyRouteSummary, PlacedRider } from '@/core/route';
import { describeRank, groupSpread, layoutDots, rankRiders } from '@/core/route-order';

const RANGE_COLOR: Record<RangeCheck, string> = { get ok() { return RideColors.green; }, get tight() { return RideColors.yellow; }, get over() { return RideColors.red; } };

/** Dot sizes on the line, before a big group shrinks them to fit. */
const SIZE = { me: 30, leader: 28, sweep: 24, rider: 22 } as const;
/** How long a tapped rider's name stays up. */
const LABEL_MS = 4000;
const LABEL_W = 190;

/**
 * The whole route as one straight line, start to finish, with every sharing rider's dot strung
 * along it in running order: the rear on the left, the front on the right. Each dot sits as near
 * its real spot as it can without hiding a neighbor, so a bunched-up group reads as a string of
 * dots rather than one blob, and the leader sees everyone between the front and the rear. Tap a
 * dot for the rider's name and place. One glance answers "where am I compared with everyone
 * else?" without reading a map.
 *
 * On a Freeride (no mapped route) the same line shows the group behind the leader instead: the
 * leader on the right, the rear on the left, measured along the leader's own path (core/freeride),
 * with the group's spread in place of the miles done.
 */
export function RouteStrip({
  lengthM, riders, meId, summary, nameOf, offline, range, compact, lastSeenIds, freeride,
}: {
  /** A Freeride: no route, so the line is the group behind the leader. */
  freeride?: { summary: FreerideSummary; waiting: boolean } | null;
  /** Riders whose spot is only where they were last seen: drawn hollow and grey, never as live. */
  lastSeenIds?: string[];
  /** Folded Ride Mode: just the miles and the line, to leave the map as much room as possible. */
  compact?: boolean;
  /** Whether this rider's machine (from the garage) can do the whole route. */
  range?: { check: RangeCheck; text: string } | null;
  lengthM: number;
  riders: PlacedRider[];
  meId: string | undefined;
  summary: MyRouteSummary | null;
  nameOf: (id: string) => string;
  offline?: boolean;
}) {
  const pct = (m: number) => `${Math.max(0, Math.min(100, (m / Math.max(1, lengthM)) * 100))}%` as const;
  const ranked = rankRiders(riders);
  const me = ranked.find((r) => r.id === meId);
  const [width, setWidth] = useState(0);
  const sizeOf = (r: PlacedRider) => (r.id === meId ? SIZE.me : SIZE[r.role]);
  const spots = new Map(
    layoutDots(ranked.map((r) => ({ id: r.id, alongM: r.place!.alongM, size: sizeOf(r) })), lengthM, width).map((d) => [d.id, d]),
  );
  // Draw me last so my dot sits on top, then the leader and sweep over the riders.
  const order = [...ranked].sort((a, b) => layer(a) - layer(b));
  function layer(r: PlacedRider) {
    return r.id === meId ? 3 : r.role === 'rider' ? 1 : 2;
  }

  // A tapped dot shows the rider's name and place for a few seconds.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => setPicked(null), LABEL_MS);
    return () => clearTimeout(t);
  }, [picked]);
  const pickedRider = picked ? ranked.find((r) => r.id === picked) : undefined;
  const pickedSpot = pickedRider ? spots.get(pickedRider.id) : undefined;
  const spread = groupSpread(ranked);
  const offWord = freeride ? "off the leader's path" : 'off the route';
  const describe = (r: (typeof ranked)[number]) => describeRank(r, ranked, nameOf(r.id), meId, offWord);
  const fs = freeride?.summary;
  const [spreadNum, ...spreadUnit] = fs?.spread?.split(' ') ?? [];

  return (
    <View style={styles.wrap}>
      <View
        style={styles.head}
        accessible
        accessibilityLabel={freeride ? [
          freeride.waiting ? 'Freeride. Waiting for the leader to share their location.' : fs?.spread ? `Freeride. The group is spread over ${fs.spread}, ${fs.ends}.` : `Freeride. ${fs?.ends}.`,
          fs?.compared ?? '',
        ].join(' ') : [
          summary ? `Mile ${summary.doneMi} of ${summary.totalMi}. ${summary.compared} ${summary.offRoute ?? ''}` : `Route, ${ranked.length} riders on it`,
          spread ? `${spread}, front to rear.` : '',
        ].join(' ')}>
        {freeride ? (
          freeride.waiting ? (
            <Text style={styles.of}>Waiting for the Leader</Text>
          ) : fs?.spread ? (
            <Text style={styles.big}>
              {spreadNum}
              <Text style={styles.of}> {spreadUnit.join(' ')} spread</Text>
            </Text>
          ) : (
            <Text style={styles.of}>{fs?.ends}</Text>
          )
        ) : summary ? (
          <Text style={styles.big}>
            {summary.doneMi}
            <Text style={styles.of}> of {summary.totalMi} mi</Text>
          </Text>
        ) : (
          <Text style={styles.of}>Route · {ranked.length ? `${ranked.length} on the line` : 'nobody placed yet'}</Text>
        )}
        <Text style={styles.toGo}>{freeride ? (freeride.waiting || !fs?.spread ? 'Freeride' : fs.ends) : summary ? summary.toGo : offline ? 'Saved route, no signal' : ''}</Text>
      </View>

      <View style={styles.track} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        <View style={styles.rail} />
        {freeride ? null : (
          <>
            {me?.place ? <View style={[styles.done, { width: pct(me.place.alongM) }]} /> : null}
            <View style={[styles.cap, { left: 0, backgroundColor: RideColors.green }]} />
            <View style={[styles.cap, styles.finish, { right: 0 }]} />
          </>
        )}
        {order.map((r) => {
          const mine = r.id === meId;
          const lastSeen = !mine && !!lastSeenIds?.includes(r.id);
          const color = lastSeen
            ? Colors.textSecondary
            : r.role === 'leader' ? RideColors.leader : mine ? Colors.accent : r.role === 'sweep' ? RideColors.sweep : RideColors.rider;
          const spot = spots.get(r.id);
          const size = spot?.size ?? sizeOf(r);
          const letter = mine ? 'You' : r.role === 'leader' ? 'L' : r.role === 'sweep' ? 'S' : initialOf(nameOf(r.id));
          const filled = r.place!.onRoute && !lastSeen;
          return (
            <Pressable
              key={r.id}
              onPress={() => setPicked((p) => (p === r.id ? null : r.id))}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`${describe(r)}${lastSeen ? ', last seen here' : ''}`}
              style={[
                styles.dot,
                {
                  left: spot ? spot.x : pct(r.place!.alongM),
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                  backgroundColor: filled ? color : Colors.background,
                  borderColor: filled ? (mine || picked === r.id ? Colors.text : Colors.background) : color,
                  borderStyle: lastSeen ? 'dashed' : 'solid',
                  zIndex: picked === r.id ? 4 : layer(r),
                },
              ]}>
              {size >= 18 ? (
                <Text style={[styles.letter, { fontSize: mine ? 10 : size >= 24 ? 11 : 9, color: filled ? '#fff' : color }]} numberOfLines={1}>
                  {letter}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {pickedRider && pickedSpot && width ? (
          <View
            pointerEvents="none"
            style={[styles.label, { left: Math.max(0, Math.min(width - LABEL_W, pickedSpot.x - LABEL_W / 2)) }]}>
            <Text style={styles.labelText} numberOfLines={2}>
              {describe(pickedRider)}
            </Text>
          </View>
        ) : null}
      </View>

      {compact ? null : freeride ? (
        <Text style={styles.compared}>
          {freeride.waiting
            ? 'The line fills in once the leader shares their location.'
            : fs?.compared ?? 'Share your location to see how far you are behind the leader.'}
        </Text>
      ) : summary ? (
        <Text style={styles.compared}>
          {summary.offRoute ? <Text style={{ color: RideColors.yellow }}>{summary.offRoute} </Text> : null}
          {summary.compared}
        </Text>
      ) : (
        <Text style={styles.compared}>Share your location to see where you are on the route.</Text>
      )}
      {range && !compact ? (
        <View style={styles.range}>
          <View style={[styles.rangeDot, { backgroundColor: RANGE_COLOR[range.check] }]} />
          <Text style={styles.rangeText} numberOfLines={2}>{range.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
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
  dot: { position: 'absolute', top: '50%', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontFamily: font(800), fontSize: 11 },
  label: {
    position: 'absolute', bottom: 34, width: LABEL_W, paddingHorizontal: 10, paddingVertical: 6, zIndex: 5,
    borderRadius: 10, backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: Colors.border,
  },
  labelText: { color: Colors.text, fontFamily: font(700), fontSize: 13, lineHeight: 17, textAlign: 'center' },
  range: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeDot: { width: 10, height: 10, borderRadius: 5 },
  rangeText: { flex: 1, color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, lineHeight: 18 },
  compared: { color: Colors.text, fontFamily: font(600), fontSize: 15, lineHeight: 20 },
}));
