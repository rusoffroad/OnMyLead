import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, font, Radius } from '@/constants/theme';
import { choicesLabel, statusLine, type OfflineMap } from '@/core/offline-maps';
import { deleteOfflineMap, pauseDownload, resumeDownload } from '@/lib/offline-maps';

/** Downloaded maps wear the same sand as the trails layer: sand means "map on your phone". */
export const SAND = '#ECCD91';

/**
 * A small map sheet: a navy square with contour lines and crop marks in its corners, like a
 * quad map cut from a printed set. A ride's sheet carries a route line instead of contours.
 */
export function MapSheet({ size = 56, ride, dim }: { size?: number; ride?: boolean; dim?: boolean }) {
  const ink = dim ? Colors.textSecondary : SAND;
  return (
    <View style={[styles.sheet, { width: size, height: size }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
        {ride ? (
          <Path d="M12 42c6-2 6-12 13-13s9 6 15-3 2-12 4-14" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <Path d="M10 38c8-10 15 2 22-6s10-6 14-4" stroke={ink} strokeOpacity={0.9} strokeWidth={1.4} strokeLinecap="round" />
            <Path d="M10 30c7-9 13 1 19-6s11-7 17-4" stroke={ink} strokeOpacity={0.55} strokeWidth={1.4} strokeLinecap="round" />
            <Path d="M14 22c5-6 9 0 13-4s9-5 15-2" stroke={ink} strokeOpacity={0.3} strokeWidth={1.4} strokeLinecap="round" />
          </>
        )}
        {/* Crop marks */}
        <Path d="M4 11V4h7M45 4h7v7M52 45v7h-7M11 52H4v-7" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** One download: what it is, how big, and its controls. */
export function DownloadRow({ map }: { map: OfflineMap }) {
  const busy = map.status === 'downloading';
  const pct = map.total ? (map.saved + map.failed) / map.total : 0;
  const confirmDelete = () =>
    Alert.alert(`Delete ${map.name}?`, 'It comes off this phone. You can download it again any time you have signal.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteOfflineMap(map.id) },
    ]);

  return (
    <View style={styles.row} accessible={false}>
      <MapSheet ride={map.kind === 'ride'} dim={map.status === 'paused'} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={1}>{map.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>{choicesLabel(map.choices)}</Text>
        <Text style={[styles.status, map.status === 'partial' && { color: '#FFB020' }]} accessibilityLiveRegion={busy ? 'polite' : 'none'}>
          {statusLine(map)}
        </Text>
        {busy || map.status === 'paused' ? (
          <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
            <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }, !busy && { backgroundColor: Colors.textSecondary }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {busy ? (
          <SmallButton title="Pause" onPress={() => pauseDownload(map.id)} />
        ) : map.status === 'paused' ? (
          <SmallButton title="Resume" onPress={() => resumeDownload(map.id)} strong />
        ) : map.status === 'partial' ? (
          <SmallButton title="Finish" onPress={() => resumeDownload(map.id)} strong />
        ) : null}
        <SmallButton title="Delete" onPress={confirmDelete} />
      </View>
    </View>
  );
}

export function SmallButton({ title, onPress, strong, disabled }: { title: string; onPress: () => void; strong?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.small, strong && styles.smallStrong, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={[styles.smallText, strong && { color: Colors.onAccent }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { borderRadius: 10, backgroundColor: '#0D1C31', borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  name: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 22 },
  sub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  status: { color: SAND, fontFamily: font(600), fontSize: 14 },
  track: { height: 4, borderRadius: 2, backgroundColor: Colors.backgroundSelected, overflow: 'hidden', marginTop: 2 },
  fill: { height: 4, backgroundColor: SAND },
  actions: { gap: 6, alignItems: 'stretch' },
  small: { minHeight: 34, minWidth: 76, paddingHorizontal: 12, borderRadius: Radius.control - 4, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
  smallStrong: { backgroundColor: Colors.accent },
  smallText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
});
