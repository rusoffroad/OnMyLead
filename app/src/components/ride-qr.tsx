import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { qrModules, qrPath } from '@/core/qr';

/** Quiet zone around the code, in modules. Four is the standard; two scans fine off a phone screen. */
const MARGIN = 2;

/**
 * A ride's QR code: logo-navy modules on a white tile, the contrast every phone camera wants,
 * even in full sun. `size` is the tile's width in points.
 */
export function QrCode({ value, size, style }: { value: string; size: number; style?: StyleProp<ViewStyle> }) {
  const { path, units } = useMemo(() => {
    const modules = qrModules(value);
    return { path: qrPath(modules, MARGIN), units: modules.length + MARGIN * 2 };
  }, [value]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR code for this ride. Scan it with a phone camera to open the ride."
      style={[{ width: size, height: size, borderRadius: size * 0.06, overflow: 'hidden', backgroundColor: '#FFFFFF' }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${units} ${units}`}>
        <Rect x={0} y={0} width={units} height={units} fill="#FFFFFF" />
        <Path d={path} fill={Colors.background} />
      </Svg>
    </View>
  );
}
