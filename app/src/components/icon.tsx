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
  // A navigation arrowhead, for Follow Me (the map keeps moving with you).
  follow: ['M12 3.5l7.5 17-7.5-4.2-7.5 4.2z'],
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
  // A rider with a plus, for Friends and Add Friend.
  addFriend: ['M3.5 20.5c.8-3.8 3.6-6 7-6 2.6 0 4.8 1.3 6 3.5', 'M19 7.5v6', 'M16 10.5h6'],
  people: ['M2.5 19.5c.6-3 3-4.8 6-4.8s5.4 1.8 6 4.8', 'M15.8 14.9c2.5.3 4.4 1.9 5 4.6'],
  map: ['M3.5 6.5L9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z', 'M9 4v13.5', 'M15 6.5V20'],
  // A speech bubble, for chat in the Notifications inbox.
  chat: ['M4 5h16v11H10l-4.5 3.5V16H4z'],
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  // An envelope, for Contact Us.
  mail: ['M3.5 6h17v12h-17z', 'M3.5 6.5l8.5 6.5 8.5-6.5'],
  // A wall calendar, for picking a ride's date.
  calendar: ['M4 6h16v14H4z', 'M4 10.5h16', 'M8.5 3.5v4.5', 'M15.5 3.5v4.5'],
  // A clock face, for picking a time of day.
  clock: ['M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17z', 'M12 7.5V12l3 2'],
  star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z'],
  // A battery on its side with a charge bolt, for Battery Saver.
  expand: ['M14 4h6v6', 'M20 4l-6.5 6.5', 'M10 20H4v-6', 'M4 20l6.5-6.5'],
  collapse: ['M20 10h-6V4', 'M14 10l6.5-6.5', 'M4 14h6v6', 'M10 14l-6.5 6.5'],
  // A music note, for Music Controls.
  music: ['M9 17.5V5.8l10.5-2.3v11.7', 'M9 9l10.5-2.3', 'M9 17.5a2.8 2.4 0 1 1-5.6 0a2.8 2.4 0 1 1 5.6 0z', 'M19.5 15.2a2.8 2.4 0 1 1-5.6 0a2.8 2.4 0 1 1 5.6 0z'],
  battery: ['M3 7.5h15v9H3z', 'M20.5 10.5v3', 'M11.5 9l-2.5 3.2h3L9.5 15'],
  go: ['M5 12h13', 'M13 6l6 6-6 6'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  regroup: ['M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3'],
  layers: ['M12 3.5l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  back: ['M15 5l-7 7 7 7'],
  // Radio waves: riders out riding right now.
  bluetooth: ['m7 7 10 10-5 5V2l5 5L7 17'],
  signal: ['M8.5 8.5a5 5 0 0 0 0 7', 'M15.5 8.5a5 5 0 0 1 0 7', 'M5.6 5.6a9 9 0 0 0 0 12.8', 'M18.4 5.6a9 9 0 0 1 0 12.8'],
  help: ['M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.9', 'M12 17.2v.3'],
  sliders: ['M4 6.5h9', 'M17 6.5h3', 'M4 12h3', 'M11 12h9', 'M4 17.5h11', 'M19 17.5h1'],
  // A line drawn between two points: a custom trail.
  draw: ['M7 17.5c3.5-.8 3-5.5 6-7.5s3.5-2.6 4.2-3.2'],
  download: ['M3.5 6.5L9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z', 'M12 9.5v6', 'M9.5 13.2L12 15.7l2.5-2.5'],
  trackLine: ['M3.5 18c2.5-4 5-1 7.5-5s4-6 9.5-7'],
  // Social (2.0): like, share, a photo.
  heart: ['M12 20s-7.6-4.6-9.1-9.4C1.9 7.4 4.1 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.2 0 5.4 2.9 4.4 6.1C19.6 15.4 12 20 12 20z'],
  share: ['M12 3.5v11', 'M8 7.2l4-3.7 4 3.7', 'M7 10.5H5v10h14v-10h-2'],
  image: ['M3.5 5h17v14h-17z', 'M3.5 16.5l5-5 4 4 2.5-2.5 5.5 5.5'],
  // An open book: the Help Center's how-to guides.
  book: ['M12 6.8C10 5.2 7 4.6 3.5 5.1v13c3.5-.5 6.5.1 8.5 1.7', 'M12 6.8c2-1.6 5-2.2 8.5-1.7v13c-3.5-.5-6.5.1-8.5 1.7', 'M12 6.8v13'],
  // Opens a page outside the app (the website).
  external: ['M14 4.5h5.5V10', 'M19.5 4.5L11.5 12.5', 'M17.5 13.5v6h-13v-13h6'],
} as const;

export type IconName = keyof typeof PATHS;

/** A small line icon set drawn for OnMyLead, so it renders the same on iOS, Android and the web. */
export function Icon({ name, size = 24, color = Colors.text, strokeWidth = 2, fill }: { name: IconName; size?: number; color?: string; strokeWidth?: number; fill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={color} fill={fill ?? 'none'} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {name === 'pin' ? <Circle cx={12} cy={9.5} r={2.6} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'person' ? <Circle cx={12} cy={8} r={3.8} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'addFriend' ? <Circle cx={10.5} cy={8} r={3.8} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'regroup' ? <Circle cx={12} cy={12} r={3.5} fill={color} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'locate' ? <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'people' ? (
        <>
          <Circle cx={8.5} cy={8.5} r={3.4} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={16.2} cy={9.2} r={2.7} stroke={color} strokeWidth={strokeWidth} />
        </>
      ) : null}
      {name === 'block' ? <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'help' ? <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'signal' ? <Circle cx={12} cy={12} r={1.8} fill={color} stroke={color} strokeWidth={strokeWidth} /> : null}
      {name === 'sliders' ? (
        <>
          <Circle cx={15} cy={6.5} r={2} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={9} cy={12} r={2} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={17} cy={17.5} r={2} stroke={color} strokeWidth={strokeWidth} />
        </>
      ) : null}
      {name === 'draw' ? (
        <>
          <Circle cx={5} cy={18} r={2} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={19} cy={5.5} r={2} stroke={color} strokeWidth={strokeWidth} />
        </>
      ) : null}
      {name === 'image' ? <Circle cx={15.5} cy={9} r={1.6} stroke={color} strokeWidth={strokeWidth} /> : null}
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
