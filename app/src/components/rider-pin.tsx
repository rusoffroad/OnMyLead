import { Text, View } from 'react-native';

import { colorBlindOn, Colors, font, MapLabelText, RideColors, themedStyles } from '@/constants/theme';
import { statusSymbol } from '@/core/appearance';
import { screenAngle } from '@/core/heading';
import type { MapRider } from './group-map-types';
import { MarkerBody } from './marker-body';
import { RIDER_DOT, RiderDot } from './rider-dot';
import { puckInk, RiderPuck } from './rider-puck';
import { BreakdownBadge } from './rider-status-badge';
import { t } from '@/lib/i18n';

/** Wide enough for a 24-character name or "No Signal, 25 Min Ago"; the dot sits dead centre so the anchor stays on it. */
const PIN_W = 300;
/** Tall enough for a ringed leader puck (Android draws nothing outside it). */
const PIN_H = 60;

/**
 * A rider on the live map: their puck with its arrow built in while live (a hollow ring once only
 * last seen) and a dark name pill beside it (blue for the leader, violet for the tail gunner), with
 * the age on the pill once the position is only where they were last seen. The dot is the exact centre of the marker, which MarkerBody keeps on the coordinate.
 */
export function RiderPin({ rider: r, mapHeading }: { rider: MapRider; /** How far the map is turned from north, so the arrow stays true. */ mapHeading?: number | null }) {
  const leader = r.role === 'leader';
  const sweep = r.role === 'sweep';
  const size = leader ? RIDER_DOT.leader : sweep ? RIDER_DOT.sweep : RIDER_DOT.rider;
  const trouble = r.status === 'red' || r.status === 'yellow';
  const ring = size + 12;
  const f = r.freshness;
  const live = f?.state === 'live';
  return (
    <MarkerBody style={styles.pin}>
      {trouble ? (
        <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: RideColors[r.status] }]} />
      ) : null}
      {/* Live: the puck with its arrow built in (rider-puck). Last seen or lost: the hollow ring, no arrow. */}
      {live ? (
        <RiderPuck color={puckInk(r.role)} d={size} angle={r.headingDeg != null ? screenAngle(r.headingDeg, mapHeading) : null} />
      ) : (
        <RiderDot role={r.role} freshness={f?.state ?? null} size={size} />
      )}
      {r.breakdown ? (
        <View style={[styles.badge, { left: PIN_W / 2 + size / 2 - 6, top: PIN_H / 2 - size / 2 - 8 }]}>
          <BreakdownBadge size={18} />
        </View>
      ) : null}
      <View
        style={[
          styles.label,
          { left: PIN_W / 2 + (trouble ? ring : size) / 2 + (r.breakdown ? 14 : 4) },
          leader && live && styles.leaderLabel,
          sweep && live && styles.sweepLabel,
          !live && styles.staleLabel,
        ]}>
        <Text style={[styles.name, (leader || sweep) && styles.leaderName, !live && styles.staleName]} numberOfLines={1}>
          {/* Color Blind Mode: the ring's colour also shows as a symbol, so trouble never rests on colour alone. */}
          {trouble && colorBlindOn() ? <Text style={{ color: RideColors[r.status] }}>{statusSymbol(r.status)} </Text> : null}
          {r.name}
        </Text>
        {f && !live ? (
          <Text style={[styles.age, f.state === 'lost' && styles.lostAge]} numberOfLines={1}>
            {f.state === 'lost' ? f.label : t('Last Seen {ago}', { ago: f.ago })}
          </Text>
        ) : null}
      </View>
    </MarkerBody>
  );
}

const styles = themedStyles(() => ({
  pin: { width: PIN_W, height: PIN_H, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 3, backgroundColor: 'rgba(10,22,38,0.35)' },
  label: {
    position: 'absolute', maxWidth: PIN_W / 2 - 24, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 7, backgroundColor: 'rgba(10,22,38,0.88)',
  },
  leaderLabel: { backgroundColor: RideColors.leader },
  sweepLabel: { backgroundColor: RideColors.sweep },
  // A last-seen tag is outlined, not filled, so it never reads like a live one.
  staleLabel: { backgroundColor: 'rgba(10,22,38,0.9)', borderWidth: 1, borderColor: Colors.border },
  name: { color: MapLabelText, fontFamily: font(700), fontSize: 12, lineHeight: 15 },
  leaderName: { color: '#fff', fontFamily: font(800), fontSize: 13, lineHeight: 16 },
  staleName: { color: '#97A7BE' },
  age: { color: '#97A7BE', fontFamily: font(700), fontSize: 10, lineHeight: 13 },
  lostAge: { color: MapLabelText, fontFamily: font(800) },
}));
