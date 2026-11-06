import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Colors, font, RideColors, themedStyles } from '@/constants/theme';
import type { FreerideSummary } from '@/core/freeride';
import type { RangeCheck } from '@/core/fuel';
import { initialOf } from '@/core/profile';
import type { MyRouteSummary, PlacedRider } from '@/core/route';
import { convoyLayout, describeRank, rankRiders, spreadRuler, type SpreadRuler } from '@/core/route-order';

import { t as tr } from '@/lib/i18n';
const RANGE_COLOR: Record<RangeCheck, string> = { get ok() { return RideColors.green; }, get tight() { return RideColors.yellow; }, get over() { return RideColors.red; } };

/** Dot sizes on the line, before a big group shrinks them to fit. */
const SIZE = { me: 30, leader: 28, sweep: 24, rider: 22 } as const;
/** How long a tapped rider's name stays up. */
const LABEL_MS = 4000;
const LABEL_W = 190;

/**
 * The leader line: every sharing rider's dot strung out in running order, with the leader pinned
 * to the far left edge and the tail gunner pinned to the far right edge (core/route-order
 * convoyLayout). Everyone else sits between them by how far behind the leader they are, as near
 * that spot as they can without hiding a neighbor, so a bunched-up group reads as a string of
 * dots rather than one blob. Tap a dot for the rider's name and place. Under the line a
 * dimension line (core/route-order spreadRuler) gives the distance from the leader to whoever is
 * furthest back, with a tick every round step, so the spacing has a scale. Below that, one
 * centered sentence says where this rider is. (Chris, 2026-11-05: no miles-done header.)
 *
 * On a Freeride (no mapped route) the distances are measured along the leader's own path
 * (core/freeride).
 */
export function RouteStrip({
  riders, meId, summary, nameOf, offline, range, compact, lastSeenIds, freeride,
}: {
  /** A Freeride: no route, so the line is the group behind the leader. */
  freeride?: { summary: FreerideSummary; waiting: boolean } | null;
  /** Riders whose spot is only where they were last seen: drawn hollow and grey, never as live. */
  lastSeenIds?: string[];
  /** Folded Ride Mode: just the miles and the line, to leave the map as much room as possible. */
  compact?: boolean;
  /** Whether this rider's machine (from the garage) can do the whole route. */
  range?: { check: RangeCheck; text: string } | null;
  /** No longer used: the line is the group, leader to tail gunner, not the route. Kept so callers needn't change. */
  lengthM?: number;
  riders: PlacedRider[];
  meId: string | undefined;
  summary: MyRouteSummary | null;
  nameOf: (id: string) => string;
  offline?: boolean;
}) {
  const ranked = rankRiders(riders);
  const [width, setWidth] = useState(0);
  const sizeOf = (r: PlacedRider) => (r.id === meId ? SIZE.me : SIZE[r.role]);
  const layout = convoyLayout(ranked, sizeOf, width);
  const spots = new Map(layout.map((d) => [d.id, d]));
  // The scale under the line: leader to whoever is furthest back, with round-step ticks.
  const ruler = width ? spreadRuler(ranked, layout) : null;
  const rulerStale = !!ruler && !!lastSeenIds?.length && [ranked.find((r) => r.role === 'leader') ?? ranked[0], [...ranked].reverse().find((r) => r.role === 'sweep'), ranked[ranked.length - 1]].some((r) => !!r && r.id !== meId && lastSeenIds.includes(r.id));
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
  const offWord = freeride ? tr('off the leader’s path') : tr('off the route');
  const describe = (r: (typeof ranked)[number]) => describeRank(r, ranked, nameOf(r.id), meId, offWord);
  const fs = freeride?.summary;

  return (
    <View style={styles.wrap}>
      <View style={styles.track} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        <View style={styles.rail} />
        {order.map((r) => {
          const mine = r.id === meId;
          const lastSeen = !mine && !!lastSeenIds?.includes(r.id);
          const color = lastSeen
            ? Colors.textSecondary
            : r.role === 'leader' ? RideColors.leader : mine ? Colors.accent : r.role === 'sweep' ? RideColors.sweep : RideColors.rider;
          const spot = spots.get(r.id);
          // No spot until the line has been measured: draw nothing rather than a dot in the wrong place.
          if (!spot) return null;
          const size = spot.size;
          const letter = mine ? tr('You') : r.role === 'leader' ? 'L' : r.role === 'sweep' ? 'S' : initialOf(nameOf(r.id));
          const filled = r.place!.onRoute && !lastSeen;
          return (
            <Pressable
              key={r.id}
              onPress={() => setPicked((p) => (p === r.id ? null : r.id))}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`${describe(r)}${lastSeen ? tr(', last seen here') : ''}`}
              style={[
                styles.dot,
                {
                  left: spot.x,
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

      {ruler ? <Ruler ruler={ruler} stale={rulerStale} /> : null}

      {compact ? null : freeride ? (
        <Text style={styles.compared}>
          {freeride.waiting
            ? tr('The line fills in once the leader shares their location.')
            : fs?.compared ?? tr('Share your location to see how far you are behind the leader.')}
        </Text>
      ) : summary ? (
        <Text style={styles.compared}>
          {summary.offRoute ? <Text style={{ color: RideColors.yellow }}>{summary.offRoute} </Text> : null}
          {summary.compared}
        </Text>
      ) : (
        <Text style={styles.compared}>{tr('Share your location to see where you are on the route.')}</Text>
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

/**
 * A dimension line under the leader line, end caps under the leader's and the tail's dots, the
 * leader-to-rear distance in the middle and a small tick every round step (core spreadRuler).
 */
function Ruler({ ruler, stale }: { ruler: SpreadRuler; stale: boolean }) {
  const [labelW, setLabelW] = useState(0);
  const mid = (ruler.fromX + ruler.toX) / 2;
  const gapL = mid - labelW / 2 - 6;
  const gapR = mid + labelW / 2 + 6;
  const label = stale ? `~${ruler.label}` : ruler.label;
  return (
    <View
      style={styles.ruler}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${ruler.ends}, ${label}${stale ? tr(', last seen here') : ''}`}>
      <View style={[styles.rulerCap, { left: ruler.fromX - 0.75 }]} />
      <View style={[styles.rulerCap, { left: ruler.toX - 0.75 }]} />
      {labelW ? (
        <>
          <View style={[styles.rulerLine, { left: ruler.fromX, width: Math.max(0, gapL - ruler.fromX) }]} />
          <View style={[styles.rulerLine, { left: gapR, width: Math.max(0, ruler.toX - gapR) }]} />
        </>
      ) : null}
      {ruler.ticks.filter((x) => x < gapL - 3 || x > gapR + 3).map((x) => (
        <View key={x} style={[styles.rulerTick, { left: x - 0.5 }]} />
      ))}
      <Text
        onLayout={(e) => setLabelW(Math.ceil(e.nativeEvent.layout.width))}
        style={[styles.rulerText, { left: mid - labelW / 2, opacity: labelW ? 1 : 0 }, stale && styles.rulerStale]}
        numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: 8, paddingHorizontal: 4, paddingBottom: 4 },
  track: { height: 34, justifyContent: 'center', marginHorizontal: 10 },
  // Sits close under the track (the wrap's gap is 8): caps at 0, line at 5, ticks hang from it.
  ruler: { height: 16, marginTop: -6, marginHorizontal: 10 },
  rulerCap: { position: 'absolute', top: 0, width: 1.5, height: 11, borderRadius: 1, backgroundColor: Colors.textSecondary, opacity: 0.8 },
  rulerLine: { position: 'absolute', top: 5, height: 1, backgroundColor: Colors.textSecondary, opacity: 0.55 },
  rulerTick: { position: 'absolute', top: 5, width: 1, height: 4, backgroundColor: Colors.textSecondary, opacity: 0.55 },
  rulerText: {
    position: 'absolute', top: -1, color: Colors.textSecondary, fontFamily: font(700), fontSize: 12, lineHeight: 14,
    letterSpacing: 0.3, fontVariant: ['tabular-nums'],
  },
  rulerStale: { fontStyle: 'italic' },
  rail: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: Colors.backgroundSelected },
  dot: { position: 'absolute', top: '50%', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontFamily: font(800), fontSize: 11 },
  label: {
    position: 'absolute', bottom: 34, width: LABEL_W, paddingHorizontal: 10, paddingVertical: 6, zIndex: 5,
    borderRadius: 10, backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: Colors.border,
  },
  labelText: { color: Colors.text, fontFamily: font(700), fontSize: 13, lineHeight: 17, textAlign: 'center' },
  range: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rangeDot: { width: 10, height: 10, borderRadius: 5 },
  rangeText: { flexShrink: 1, color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, lineHeight: 18 },
  compared: { color: Colors.text, fontFamily: font(600), fontSize: 15, lineHeight: 20, textAlign: 'center' },
}));
