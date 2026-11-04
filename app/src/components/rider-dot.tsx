import { View } from 'react-native';

import { Colors, RideColors, themedStyles } from '@/constants/theme';
import type { RideRole } from '@/core/bubble';
import type { Freshness } from '@/core/freshness';

/** Default dot sizes: the leader is the biggest (blue), the tail gunner next (violet). */
export const RIDER_DOT = { leader: 26, sweep: 24, rider: 20 } as const;

/**
 * One rider's dot, shared by the map and the rider list so both say the same thing. A live rider
 * is a bold white ring around a dark centre, the leader a bigger solid blue dot in a white ring:
 * both read on bright satellite and topo maps as well as the dark map. A rider whose position is
 * only where they were last seen is a thin grey ring, dashed once their phone has lost service, and
 * a faint ring means they aren't sharing. Only a live dot has the white ring, so an old position
 * never passes for "they are here now".
 */
export function RiderDot({ role, freshness, size }: { role: RideRole; freshness: Freshness | null; size?: number }) {
  const leader = role === 'leader';
  const sweep = role === 'sweep';
  const d = size ?? (leader ? RIDER_DOT.leader : sweep ? RIDER_DOT.sweep : RIDER_DOT.rider);
  const shape = { width: d, height: d, borderRadius: d / 2 };
  if (freshness === 'live') {
    return <View style={[shape, styles.live, leader && styles.leaderLive, sweep && styles.sweepLive]} />;
  }
  if (freshness === 'delayed') {
    return <View style={[shape, styles.hollow, leader && styles.leaderHollow, sweep && styles.sweepHollow]} />;
  }
  if (freshness === 'lost') return <View style={[shape, styles.hollow, styles.lost]} />;
  // Not sharing: a faint ring, as there is no position to stand for.
  return <View style={[shape, styles.off]} />;
}

const styles = themedStyles(() => ({
  live: {
    borderWidth: 3.5, borderColor: '#FFFFFF', backgroundColor: Colors.background,
    // A soft dark edge keeps the white ring crisp on pale ground.
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 2.5, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  // The leader is the one everyone follows: bigger, solid logo blue, and the only blue dot.
  leaderLive: { backgroundColor: RideColors.leader },
  hollow: { borderWidth: 2.5, borderColor: Colors.textSecondary, backgroundColor: 'rgba(10,22,38,0.7)' },
  leaderHollow: { borderColor: RideColors.leader },
  // The tail gunner rides at the rear in their own violet, so the group's two ends always stand out.
  sweepLive: { backgroundColor: RideColors.sweep },
  sweepHollow: { borderColor: RideColors.sweep },
  lost: { borderColor: Colors.text, borderStyle: 'dashed' },
  off: { borderWidth: 1.5, borderColor: Colors.border },
}));
