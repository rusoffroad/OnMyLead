import { StyleSheet, View } from 'react-native';

import { Colors, RideColors } from '@/constants/theme';
import type { RideRole } from '@/core/bubble';
import type { Freshness } from '@/core/freshness';

/**
 * One rider's dot, shared by the map and the rider list so both say the same thing:
 * solid when live, hollow when it only marks where they were last seen, dashed grey when
 * their phone has lost service, a faint ring when they aren't sharing. A hollow dot never reads
 * as "they are here now".
 */
export function RiderDot({ role, freshness, size }: { role: RideRole; freshness: Freshness | null; size?: number }) {
  const leader = role === 'leader';
  const d = size ?? (leader ? 22 : 14);
  const color = leader ? RideColors.leader : RideColors.rider;
  if (freshness === 'live') {
    return <View style={[{ width: d, height: d, borderRadius: d / 2 }, styles.live, { backgroundColor: color }, leader && styles.leaderLive]} />;
  }
  // Rings need a little more size than a filled dot to be seen.
  const r = Math.max(d, 18);
  const shape = { width: r, height: r, borderRadius: r / 2 };
  if (freshness === 'delayed') {
    // A light ring on a dark centre reads on satellite imagery, where the plain grey would vanish.
    return <View style={[shape, styles.hollow, { borderColor: leader ? RideColors.leader : Colors.textSecondary }]} />;
  }
  if (freshness === 'lost') return <View style={[shape, styles.hollow, styles.lost]} />;
  // Not sharing: a faint ring, as there is no position to stand for.
  return <View style={[shape, styles.off]} />;
}

const styles = StyleSheet.create({
  live: { borderWidth: 2, borderColor: Colors.background },
  // The leader is the one everyone follows: bigger, ringed in white, and the only blue dot.
  leaderLive: { borderWidth: 3, borderColor: Colors.text },
  hollow: { borderWidth: 3, backgroundColor: 'rgba(10,22,38,0.85)' },
  lost: { borderColor: Colors.text, borderStyle: 'dashed' },
  off: { borderWidth: 1.5, borderColor: Colors.border },
});
