import { StyleSheet, Text, View } from 'react-native';

import { Colors, font, RideColors } from '@/constants/theme';
import { initialOf } from '@/core/profile';

/**
 * A group drawn the way it rides: dots strung along a trail, the person who runs it in the logo
 * blue up front and everyone else in rider grey, as on the ride map.
 */
export function Convoy({ names, size = 34, max = 8 }: { names: (string | null)[]; size?: number; max?: number }) {
  const shown = names.length > max ? names.slice(0, max - 1) : names;
  const more = names.length - shown.length;
  const ring = Math.max(2, Math.round(size / 14));
  return (
    <View style={[styles.row, { height: size + ring * 2 }]} accessible accessibilityLabel={`${names.length} riders`}>
      <View style={[styles.trail, { top: (size + ring * 2) / 2 - 1 }]} />
      {shown.map((n, i) => (
        <RiderDot key={i} name={n} lead={i === 0} size={size} ring={ring} />
      ))}
      {more > 0 ? (
        <View style={[styles.more, { height: size, borderRadius: size / 2, borderWidth: ring }]}>
          <Text style={[styles.moreText, { fontSize: size * 0.4 }]}>+{more}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** One rider as a map dot with their initial (none for a null name). `lead` is the blue one. */
export function RiderDot({ name, lead, size = 34, ring = 0 }: { name: string | null; lead?: boolean; size?: number; ring?: number }) {
  return (
    <View
      style={{
        width: size + ring * 2, height: size + ring * 2, borderRadius: size / 2 + ring, borderWidth: ring, borderColor: Colors.backgroundElement,
        backgroundColor: lead ? RideColors.leader : RideColors.rider, alignItems: 'center', justifyContent: 'center',
      }}>
      <Text style={{ color: '#fff', fontFamily: font(800), fontSize: size * 0.44, lineHeight: size * 0.56 }}>{name === null ? '' : initialOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6 },
  trail: { position: 'absolute', left: 8, right: 8, height: 2, borderRadius: 1, backgroundColor: Colors.border },
  more: {
    paddingHorizontal: 10, borderColor: Colors.backgroundElement, backgroundColor: Colors.backgroundSelected,
    alignItems: 'center', justifyContent: 'center',
  },
  moreText: { color: Colors.text, fontFamily: font(700, 'display') },
});
