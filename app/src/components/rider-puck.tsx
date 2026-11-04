import { memo, useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { RideColors } from '@/constants/theme';
import type { RideRole } from '@/core/bubble';
import { mix } from '@/core/color';

/** Your own dot's color: bright glacier cyan, the one dot on the map with a beam. */
export const YOU_INK = '#19C2FF';

/** The puck's color for a role: leader blue, tail gunner violet, everyone else graphite. */
export function puckInk(role: RideRole | 'you'): string {
  if (role === 'you') return YOU_INK;
  if (role === 'leader') return RideColors.leader;
  if (role === 'sweep') return RideColors.sweep;
  return '#4A5A72';
}

/** How big the box around a puck is: room for the beam on your own dot, just the disc otherwise. */
export function puckBox(d: number, beam: boolean): number {
  return Math.ceil(beam ? d * 5.4 : d + 6);
}

/**
 * A rider's dot with the arrow built in (2.1 "Chevron Puck"): a glossy disc in the rider's color,
 * a crisp white rim, and a white chevron inside it pointing the way they face. Your own dot adds a
 * soft beam ahead of it, long while moving and short when stopped, and a faint halo. With no
 * direction known the chevron gives way to a small white centre.
 *
 * The puck is drawn dead centre in a square `puckBox` wide, so a marker anchored at its middle
 * keeps the disc on the coordinate. `angle` is on screen: degrees clockwise from straight up.
 */
export const RiderPuck = memo(function RiderPuck({
  color, d, angle, beam, moving = true,
}: { color: string; d: number; angle: number | null; beam?: boolean; moving?: boolean }) {
  // Gradient ids are shared across the whole page on the website, so each puck gets its own.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const box = puckBox(d, !!beam);
  const c = box / 2;
  const r = d / 2;
  const deep = mix(color, '#061223', 0.55);
  const rim = Math.max(2, r * 0.17);
  const reach = r * (moving ? 5 : 3.2);
  const a = Math.round(angle ?? 0);
  return (
    <View pointerEvents="none" style={{ width: box, height: box }}>
      <Svg width={box} height={box}>
        <Defs>
          <RadialGradient id={`disc${uid}`} cx="35%" cy="30%" r="80%">
            <Stop offset="0" stopColor={color} />
            <Stop offset="1" stopColor={deep} />
          </RadialGradient>
          {beam ? (
            <RadialGradient id={`beam${uid}`} cx={c} cy={c} r={reach} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={color} stopOpacity={moving ? 0.55 : 0.4} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        {beam && angle != null ? (
          <G rotation={a} origin={`${c}, ${c}`}>
            <Path d={`M${c} ${c} L${c - r * 1.9} ${c - reach} A${reach} ${reach} 0 0 1 ${c + r * 1.9} ${c - reach} Z`} fill={`url(#beam${uid})`} />
          </G>
        ) : null}
        {beam ? <Circle cx={c} cy={c} r={r + 6} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={2} /> : null}
        {/* A soft dark edge keeps the white rim crisp on pale ground. */}
        <Circle cx={c} cy={c} r={r + 1.5} fill="#000" fillOpacity={0.45} />
        <Circle cx={c} cy={c} r={r - rim / 2} fill={`url(#disc${uid})`} stroke="#FFFFFF" strokeWidth={rim} />
        {angle != null ? (
          <G rotation={a} origin={`${c}, ${c}`}>
            <Path
              d={`M${c} ${c - r * 0.56} L${c + r * 0.44} ${c + r * 0.4} L${c} ${c + r * 0.17} L${c - r * 0.44} ${c + r * 0.4} Z`}
              fill="#FFFFFF"
              strokeLinejoin="round"
            />
          </G>
        ) : (
          <Circle cx={c} cy={c} r={r * 0.28} fill="#FFFFFF" />
        )}
      </Svg>
    </View>
  );
});

/** The same puck as an SVG string, for the website's flat map (Leaflet markers take HTML). */
export function puckSvg(color: string, d: number, angle: number | null, beam: boolean, moving = true): string {
  const box = puckBox(d, beam);
  const c = box / 2;
  const r = d / 2;
  const deep = mix(color, '#061223', 0.55);
  const rim = Math.max(2, r * 0.17);
  const reach = r * (moving ? 5 : 3.2);
  const a = Math.round(angle ?? 0);
  const id = `p${Math.random().toString(36).slice(2, 8)}`;
  const beamSvg = beam && angle != null
    ? `<g transform="rotate(${a} ${c} ${c})"><path d="M${c} ${c} L${c - r * 1.9} ${c - reach} A${reach} ${reach} 0 0 1 ${c + r * 1.9} ${c - reach} Z" fill="url(#${id}b)"/></g>`
    : '';
  const arrow = angle != null
    ? `<g transform="rotate(${a} ${c} ${c})"><path d="M${c} ${c - r * 0.56} L${c + r * 0.44} ${c + r * 0.4} L${c} ${c + r * 0.17} L${c - r * 0.44} ${c + r * 0.4} Z" fill="#fff"/></g>`
    : `<circle cx="${c}" cy="${c}" r="${r * 0.28}" fill="#fff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="display:block;pointer-events:none">`
    + `<defs><radialGradient id="${id}d" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${deep}"/></radialGradient>`
    + `<radialGradient id="${id}b" cx="${c}" cy="${c}" r="${reach}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="${moving ? 0.55 : 0.4}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>`
    + beamSvg
    + (beam ? `<circle cx="${c}" cy="${c}" r="${r + 6}" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="2"/>` : '')
    + `<circle cx="${c}" cy="${c}" r="${r + 1.5}" fill="#000" fill-opacity=".45"/>`
    + `<circle cx="${c}" cy="${c}" r="${r - rim / 2}" fill="url(#${id}d)" stroke="#fff" stroke-width="${rim}"/>`
    + arrow
    + '</svg>';
}
