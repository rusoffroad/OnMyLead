import Svg, { Circle, Path } from 'react-native-svg';

/** A compass star: the mark for Navigate on Home and in the showcase. */
export function NavGlyph({ size = 34, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2.8l2.4 7.1 7.1 2.1-7.1 2.1L12 21.2l-2.4-7.1L2.5 12l7.1-2.1z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={1.8} fill={color} />
    </Svg>
  );
}

