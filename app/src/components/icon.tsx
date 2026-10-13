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
  minus: ['M5 12h14'],
  locate: ['M12 2.5v3.5', 'M12 18v3.5', 'M2.5 12H6', 'M18 12h3.5'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  search: ['M15.5 15.5L20.5 20.5'],
  person: ['M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z'],
  lock: ['M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5', 'M5.5 10.5h13v10h-13z', 'M12 14.5v2'],
  flagged: ['M5 21V4', 'M5 4.5c4-2 6 2 10 0s4 0 4 0v8.5s-1.5-1.5-4 0-6-2-10 0'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  // A bin, for swiping a ride away as its organizer.
  trash: ['M4 6.5h16', 'M9.5 6.5V4.5h5v2', 'M6 6.5l1 13.5h10l1-13.5', 'M10 10.5v6', 'M14 10.5v6'],
  // A door with an arrow out, for leaving a ride.
  leave: ['M14 7l5 5-5 5', 'M19 12H8.5', 'M10 4H5.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2H10'],
  // A no-entry ring, for Blocked Riders.
  block: ['M5.6 5.6l12.8 12.8'],
  megaphone: ['M3.5 10v4h3l8 4.5v-13l-8 4.5z', 'M6.5 14l1.5 5.5h3L9.5 15', 'M18 9.5a3.5 3.5 0 0 1 0 5'],
  warning: ['M12 3.5l9.5 16.5h-19z', 'M12 10v4.5', 'M12 17.2v.3'],
  home: ['M3.5 11.5L12 4.5l8.5 7', 'M6 9.5V20h12V9.5', 'M10 20v-5.5h4V20'],
  // A road sign's turn arrow, for directions in Apple Maps or Google Maps.
  turn: ['M12 2.8l9.2 9.2-9.2 9.2L2.8 12z', 'M9.2 15.5v-3.2a1.5 1.5 0 0 1 1.5-1.5h4.5', 'M13.2 8.6l2.2 2.2-2.2 2.2'],
  join: ['M10 7l5 5-5 5', 'M15 12H3.5', 'M14 4h4.5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H14'],
  people: ['M2.5 19.5c.6-3 3-4.8 6-4.8s5.4 1.8 6 4.8', 'M15.8 14.9c2.5.3 4.4 1.9 5 4.6'],
  map: ['M3.5 6.5L9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z', 'M9 4v13.5', 'M15 6.5V20'],
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z'],
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
      {name === 'locate' ? <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'people' ? (
        <>
          <Circle cx={8.5} cy={8.5} r={3.4} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={16.2} cy={9.2} r={2.7} stroke={color} strokeWidth={strokeWidth} />
        </>
      ) : null}
      {name === 'block' ? <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} /> : null}
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
