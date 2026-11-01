import { View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import type { BadgeKey, BadgeLevel } from '@/core/badges';

/**
 * A badge drawn as a sewn-on trail patch: a shield cut from Bronze, Silver or Gold cloth with a
 * stitched edge, the badge's mark in the middle and one to three stitches for the level, so the
 * level reads without relying on colour. Not earned yet: an empty outline.
 */

/** Cloth and edge colours per level. */
export const PATCH_COLORS: Record<BadgeLevel, { cloth: string; edge: string }> = {
  1: { cloth: '#C98A4B', edge: '#7A4C22' },
  2: { cloth: '#C6D0DC', edge: '#6C7A8C' },
  3: { cloth: '#F2C14E', edge: '#A87A16' },
};

/** Marks on a 24 grid, drawn in navy thread. */
const MARKS: Record<BadgeKey, string[]> = {
  // The leader's flag.
  trail_boss: ['M9 18V6.5', 'M9 6.5h7.5l-2 2.8 2 2.8H9'],
  // Chevrons at the back of the line.
  tail_gunner: ['M7.5 7.5l4.5 4 4.5-4', 'M7.5 12.5l4.5 4 4.5-4'],
  // Three machines in a line.
  crew_rider: ['M6.5 12h.01', 'M12 12h.01', 'M17.5 12h.01'],
  // A road running away to the horizon.
  mile_eater: ['M8.5 18.5L11 6', 'M15.5 18.5L13 6', 'M12 16.5v-1.8', 'M12 11.8v-1.3'],
  // A painted trail blaze.
  trailblazer: ['M12 5.5l5.5 6.5-5.5 6.5-5.5-6.5z'],
  // A folded map.
  mapmaker: ['M5.5 8l4-1.8 5 1.8 4-1.8v10L14.5 18l-5-1.8-4 1.8z', 'M9.5 6.2v10', 'M14.5 8v10'],
  // A star for a rating.
  trail_scout: ['M12 5.8l1.9 3.9 4.2.6-3 3 .7 4.2L12 15.5l-3.8 2 .7-4.2-3-3 4.2-.6z'],
};

const SHIELD = 'M24 2.5L43 9.5V25C43 35.5 34.5 42 24 45.5C13.5 42 5 35.5 5 25V9.5Z';
const STITCH = 'M24 6.6L39.2 12.2V25C39.2 33.4 32.6 38.8 24 41.6C15.4 38.8 8.8 33.4 8.8 25V12.2Z';

export function BadgePatch({
  badge, level, size = 48,
}: {
  badge: BadgeKey;
  /** 0 = not earned yet. */
  level: BadgeLevel | 0;
  size?: number;
}) {
  const earned = level > 0;
  const c = earned ? PATCH_COLORS[level as BadgeLevel] : null;
  const ink = earned ? Colors.background : Colors.textSecondary;
  // Small patches (beside a name) drop the stitching so the mark stays readable.
  const tiny = size < 28;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path d={SHIELD} fill={c ? c.cloth : Colors.backgroundSelected} stroke={c ? c.edge : Colors.border} strokeWidth={tiny ? 3 : 2.5} strokeLinejoin="round" />
        {!tiny ? (
          <Path d={STITCH} fill="none" stroke={c ? c.edge : Colors.border} strokeWidth={1.2} strokeDasharray="2.2 2" strokeLinejoin="round" />
        ) : null}
        <G transform={`translate(12 ${tiny ? 10 : 8.5})`}>
          {MARKS[badge].map((d) => (
            <Path
              key={d}
              d={d}
              fill="none"
              stroke={ink}
              strokeWidth={badge === 'crew_rider' ? 4.2 : tiny ? 3 : 2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </G>
        {!tiny && earned
          ? Array.from({ length: level }, (_, i) => (
              <Circle key={i} cx={24 + (i - (level - 1) / 2) * 5} cy={36} r={1.5} fill={ink} />
            ))
          : null}
      </Svg>
    </View>
  );
}
