import { View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { isHonor, type BadgeKey, type BadgeLevel, type EarnedBadgeKey } from '@/core/badges';

/**
 * A badge drawn as a sewn-on trail patch: a shield cut from Bronze, Silver or Gold cloth with a
 * stitched edge, the badge's mark in the middle and one to three stitches for the level, so the
 * level reads without relying on colour. Not earned yet: an empty outline.
 *
 * Brand Ambassador is cut from different cloth on purpose: the logo's blue with white stitching,
 * the logo's white ridgeline and its red lead arrow, so it never reads as a riding level.
 * OnMyLead Founder turns that around: the logo's red cloth with a blue edge, and a flag planted on
 * the summit, the first one up the trail.
 */

/** Cloth and edge colours per level. */
export const PATCH_COLORS: Record<BadgeLevel, { cloth: string; edge: string }> = {
  1: { cloth: '#C98A4B', edge: '#7A4C22' },
  2: { cloth: '#C6D0DC', edge: '#6C7A8C' },
  3: { cloth: '#F2C14E', edge: '#A87A16' },
};

/** Marks on a 24 grid, drawn in navy thread. */
const MARKS: Record<EarnedBadgeKey, string[]> = {
  // The leader's flag.
  trail_boss: ['M9 18V6.5', 'M9 6.5h7.5l-2 2.8 2 2.8H9'],
  // Chevrons at the back of the line.
  tail_gunner: ['M7.5 7.5l4.5 4 4.5-4', 'M7.5 12.5l4.5 4 4.5-4'],
  // Three machines in a line.
  crew_rider: ['M6.5 12h.01', 'M12 12h.01', 'M17.5 12h.01'],
  // A speedometer.
  mile_eater: ['M5 16.5a7 7 0 0 1 14 0', 'M12 16.5l3.5-4.5', 'M7.2 11.2l.9.7', 'M12 9.2v1'],
  // A painted trail blaze.
  trailblazer: ['M12 5.5l5.5 6.5-5.5 6.5-5.5-6.5z'],
  // A folded map.
  mapmaker: ['M5.5 8l4-1.8 5 1.8 4-1.8v10L14.5 18l-5-1.8-4 1.8z', 'M9.5 6.2v10', 'M14.5 8v10'],
  // A star for a rating.
  trail_scout: ['M12 5.8l1.9 3.9 4.2.6-3 3 .7 4.2L12 15.5l-3.8 2 .7-4.2-3-3 4.2-.6z'],
};

/** Brand Ambassador cloth: the logo's blue and red, white thread. */
export const AMBASSADOR_COLORS = { cloth: '#1F5FD6', edge: '#0B2A66', thread: '#FFFFFF', arrow: '#E5262E', arrowLight: '#FF5A5F' };

/** OnMyLead Founder cloth: the logo's red, blue edge, white thread and a blue flag. */
export const FOUNDER_COLORS = { cloth: '#D81F28', edge: '#0B2A66', thread: '#FFFFFF', flag: '#1F5FD6' };

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
  if (badge === 'founder') return <FounderPatch size={size} held={level > 0} />;
  if (isHonor(badge)) return <AmbassadorPatch size={size} held={level > 0} />;
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
        <G transform={tiny ? 'translate(9.6 7.6) scale(1.2)' : 'translate(10.8 6.6) scale(1.1)'}>
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

/** The Brand Ambassador patch. Beside a name (tiny) it is just the shield and the red lead arrow. */
function AmbassadorPatch({ size, held }: { size: number; held: boolean }) {
  const a = AMBASSADOR_COLORS;
  const tiny = size < 28;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path d={SHIELD} fill={held ? a.cloth : Colors.backgroundSelected} stroke={held ? a.edge : Colors.border} strokeWidth={tiny ? 3 : 2.5} strokeLinejoin="round" />
        {!tiny ? (
          <Path d={STITCH} fill="none" stroke={held ? a.thread : Colors.border} strokeOpacity={held ? 0.85 : 1} strokeWidth={1.2} strokeDasharray="2.2 2" strokeLinejoin="round" />
        ) : null}
        {tiny ? (
          <Path d="M24 11.5L33.5 36L24 31L14.5 36Z" fill={held ? a.arrow : 'none'} stroke={held ? a.thread : Colors.textSecondary} strokeWidth={2.2} strokeLinejoin="round" />
        ) : (
          <G>
            {/* The ridgeline from the logo. */}
            <Path d="M12.5 27L19 18.5L22.2 22.3L27 15.5L35.5 27" fill="none" stroke={held ? a.thread : Colors.textSecondary} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            {/* The red lead arrow, folded like the logo's. */}
            <Path d="M24 23.5L30.5 37.5L24 34.2L17.5 37.5Z" fill={held ? a.arrow : 'none'} stroke={held ? a.thread : Colors.textSecondary} strokeWidth={1.2} strokeLinejoin="round" />
            {held ? <Path d="M24 23.5L30.5 37.5L24 34.2Z" fill={a.arrowLight} /> : null}
          </G>
        )}
      </Svg>
    </View>
  );
}

/** The OnMyLead Founder patch: a flag planted on the peak. Beside a name (tiny), just the flag. */
function FounderPatch({ size, held }: { size: number; held: boolean }) {
  const f = FOUNDER_COLORS;
  const tiny = size < 28;
  const line = held ? f.thread : Colors.textSecondary;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path d={SHIELD} fill={held ? f.cloth : Colors.backgroundSelected} stroke={held ? f.edge : Colors.border} strokeWidth={tiny ? 3 : 2.5} strokeLinejoin="round" />
        {!tiny ? (
          <Path d={STITCH} fill="none" stroke={held ? f.thread : Colors.border} strokeOpacity={held ? 0.85 : 1} strokeWidth={1.2} strokeDasharray="2.2 2" strokeLinejoin="round" />
        ) : null}
        {tiny ? (
          <G>
            <Path d="M17 37V11.5" fill="none" stroke={line} strokeWidth={3} strokeLinecap="round" />
            <Path d="M18.5 12H33L29.5 17.5L33 23H18.5Z" fill={held ? f.thread : 'none'} stroke={line} strokeWidth={1.6} strokeLinejoin="round" />
          </G>
        ) : (
          <G>
            {/* The summit, with the flag planted on top. */}
            <Path d="M11.5 35L20.5 24.5L24 28.5L27.5 22L36.5 35" fill="none" stroke={line} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M27.5 22V9.5" fill="none" stroke={line} strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M28.3 10H36.5L34.3 13.2L36.5 16.4H28.3Z" fill={held ? f.flag : 'none'} stroke={line} strokeWidth={1.2} strokeLinejoin="round" />
          </G>
        )}
      </Svg>
    </View>
  );
}
