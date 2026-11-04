import { Text, View } from 'react-native';

import { colorBlindOn, Colors, font, MapLabelText, RideColors, themedStyles } from '@/constants/theme';
import { statusSymbol } from '@/core/appearance';
import { screenAngle } from '@/core/heading';
import type { MapRider } from './group-map-types';
import { MarkerBody } from './marker-body';
import { RIDER_DOT, RiderDot } from './rider-dot';
import { BreakdownBadge } from './rider-status-badge';
import { t } from '@/lib/i18n';

/** Wide enough for a 24-character name or "No Signal, 25 Min Ago"; the dot sits dead centre so the anchor stays on it. */
const PIN_W = 300;
/** Tall enough for the heading arrow around a ringed leader dot (Android draws nothing outside it). */
const PIN_H = 60;

/**
 * A rider on the live map: their dot (white-ringed only while live) with a dark name pill beside
 * it (blue for the leader), and the age on the pill once the position is only where they were last
 * seen. The dot is the exact centre of the marker, which MarkerBody keeps on the coordinate.
 */
export function RiderPin({ rider: r, mapHeading }: { rider: MapRider; /** How far the map is turned from north, so the arrow stays true. */ mapHeading?: number | null }) {
  const leader = r.role === 'leader';
  const size = leader ? RIDER_DOT.leader : RIDER_DOT.rider;
  const trouble = r.status === 'red' || r.status === 'yellow';
  const ring = size + 12;
  const f = r.freshness;
  const live = f?.state === 'live';
  return (
    <MarkerBody style={styles.pin}>
      {trouble ? (
        <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: RideColors[r.status] }]} />
      ) : null}
      {r.headingDeg != null ? (
        <HeadingArrow box={(trouble ? ring : size) + 20} angle={screenAngle(r.headingDeg, mapHeading)} />
      ) : null}
      <RiderDot role={r.role} freshness={f?.state ?? null} size={size} />
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
          !live && styles.staleLabel,
        ]}>
        <Text style={[styles.name, leader && styles.leaderName, !live && styles.staleName]} numberOfLines={1}>
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

/**
 * The pointer on a moving rider's dot: a white wedge with a dark edge just outside the ring,
 * turned to the way they're heading. A square the size of `box`, centred on the dot, is rotated so
 * the wedge at its top points along `angle` (degrees clockwise from straight up on screen).
 */
function HeadingArrow({ box, angle }: { box: number; angle: number }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.arrowBox, { width: box, height: box, transform: [{ rotate: `${Math.round(angle)}deg` }] }]}>
      <View style={styles.arrowEdge} />
      <View style={styles.arrow} />
    </View>
  );
}

const styles = themedStyles(() => ({
  pin: { width: PIN_W, height: PIN_H, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute' },
  arrowBox: { position: 'absolute', alignItems: 'center' },
  // Triangles drawn with borders, which iPhone, iPad and Android all render the same.
  arrowEdge: {
    position: 'absolute', top: -3, width: 0, height: 0, borderStyle: 'solid',
    borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 14,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'rgba(10,22,38,0.85)',
  },
  arrow: {
    position: 'absolute', top: 0, width: 0, height: 0, borderStyle: 'solid',
    borderLeftWidth: 7.5, borderRightWidth: 7.5, borderBottomWidth: 10.5,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFFFFF',
  },
  ring: { position: 'absolute', borderWidth: 3, backgroundColor: 'rgba(10,22,38,0.35)' },
  label: {
    position: 'absolute', maxWidth: PIN_W / 2 - 24, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 7, backgroundColor: 'rgba(10,22,38,0.88)',
  },
  leaderLabel: { backgroundColor: RideColors.leader },
  // A last-seen tag is outlined, not filled, so it never reads like a live one.
  staleLabel: { backgroundColor: 'rgba(10,22,38,0.9)', borderWidth: 1, borderColor: Colors.border },
  name: { color: MapLabelText, fontFamily: font(700), fontSize: 12, lineHeight: 15 },
  leaderName: { color: '#fff', fontFamily: font(800), fontSize: 13, lineHeight: 16 },
  staleName: { color: '#97A7BE' },
  age: { color: '#97A7BE', fontFamily: font(700), fontSize: 10, lineHeight: 13 },
  lostAge: { color: MapLabelText, fontFamily: font(800) },
}));
