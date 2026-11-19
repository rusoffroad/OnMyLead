import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import type { SpotKind } from '@/core/spots';
import { GLYPH_AT, PIN_H, PIN_PATH, PIN_W, SPOT_GLYPHS, SPOT_INK } from './spot-pin-art';

/**
 * A place-to-ride pin (teardrop in the kind's colour with a white picture; see spot-pin-art.ts).
 * `scale` 1 is 40 x 50 points. On a map, anchor it at the bottom centre (its point is the place).
 */
export function SpotPinArt({ kind, scale = 0.8, selected = false }: { kind: SpotKind; scale?: number; selected?: boolean }) {
  const ink = SPOT_INK[kind] ?? SPOT_INK.park;
  const w = PIN_W * scale;
  const h = PIN_H * scale;
  return (
    <View style={{ width: w, height: h }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={h} viewBox={`0 0 ${PIN_W} ${PIN_H}`}>
        <Path d={PIN_PATH} fill="rgba(0,0,0,0.35)" transform="translate(0 1.6)" />
        <Path d={PIN_PATH} fill={ink} stroke="#fff" strokeWidth={selected ? 3 : 2.2} />
        <G transform={`translate(${GLYPH_AT.x} ${GLYPH_AT.y}) scale(${GLYPH_AT.scale})`}>
          {(SPOT_GLYPHS[kind] ?? SPOT_GLYPHS.park).map((p, i) =>
            p.as === 'line' ? (
              <Path key={i} d={p.d} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <Path key={i} d={p.d} fill={p.as === 'hole' ? ink : '#fff'} />
            ),
          )}
        </G>
      </Svg>
    </View>
  );
}
