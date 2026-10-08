import Svg, { Circle, Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';

const PATHS = {
  flag: ['M5 21V4', 'M5 4h12l-2.5 4.5L17 13H5'],
  pin: ['M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z'],
  machine: ['M2.5 15.5l2.2-6h8.6l4.2 6h4v2.5H2.5z', 'M8 9.5l1.5-3h4'],
  checklist: ['M10 6.5h10', 'M10 12h10', 'M10 17.5h10', 'M3.5 6.5l1.6 1.6L8 5', 'M3.5 12l1.6 1.6L8 10.5', 'M3.5 17.5l1.6 1.6L8 16'],
  dish: ['M4 9.5a10.5 10.5 0 0 0 10.5 10.5z', 'M9.2 14.8l3.3-3.3', 'M14 3.5a6.5 6.5 0 0 1 6.5 6.5', 'M14 7.2a2.8 2.8 0 0 1 2.8 2.8'],
  chevron: ['M9 5.5l6.5 6.5L9 18.5'],
  hash: ['M4.5 9h15', 'M4.5 15h15', 'M10 4l-2 16', 'M16 4l-2 16'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  search: ['M15.5 15.5L20.5 20.5'],
  person: ['M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6'],
  join: ['M10 7l5 5-5 5', 'M15 12H3.5', 'M14 4h4.5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H14'],
} as const;

export type IconName = keyof typeof PATHS;

/** A small line icon set drawn for OnMyLead, so it renders the same on iOS, Android and the web. */
export function Icon({ name, size = 24, color = Colors.text, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {name === 'pin' ? <Circle cx={12} cy={9.5} r={2.6} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'person' ? <Circle cx={12} cy={8} r={3.8} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'search' ? <Circle cx={10.5} cy={10.5} r={6.5} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'machine' ? (
        <>
          <Circle cx={7} cy={18} r={2.6} fill={Colors.backgroundElement} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={17.5} cy={18} r={2.6} fill={Colors.backgroundElement} stroke={color} strokeWidth={strokeWidth} />
        </>
      ) : null}
    </Svg>
  );
}
