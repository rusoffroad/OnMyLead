import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Colors, font, Radius } from '@/constants/theme';
import type { Bounds } from '@/core/discovery';
import type { LatLng } from '@/core/geo';
import type { Ride } from '@/lib/types';

/** What the Find a ride map needs, shared by the native map and the web one. */
export type RidesMapProps = {
  rides: (Ride & { distanceMi?: number })[];
  /** Where the map opens and where the locate button takes it back to (the rider's state). */
  frame: Bounds;
  /** Changes when the map should fly to a new frame (a new state was picked). */
  frameKey: string;
  /** The search radius around the rider, drawn as a ring. */
  circle?: { center: LatLng; miles: number } | null;
  /** Small label in the corner, e.g. the state's name; tapping it changes the state. */
  title?: string | null;
  onPressTitle?: () => void;
  onOpen: (ride: Ride) => void;
  /** Shown as "Search this area" once the rider has moved or zoomed the map. */
  onSearchArea?: (visible: Bounds) => void;
  height?: number;
};

export const pinColor = (r: Pick<Ride, 'status'>) => (r.status === 'live' ? Colors.accent : Colors.sky);

export const meetsLabel = (r: Pick<Ride, 'meet_at'>) =>
  new Date(r.meet_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** A ride on the map: a solid dot ringed in navy so it reads on satellite imagery. Live rides glow red. */
export function RidePin({ ride }: { ride: Pick<Ride, 'status'> }) {
  const live = ride.status === 'live';
  return (
    <View style={styles.pinWrap}>
      {live ? <View style={[styles.halo, { backgroundColor: Colors.accent }]} /> : null}
      <View style={[styles.pin, { backgroundColor: pinColor(ride) }]} />
    </View>
  );
}

/** The bubble that opens over a pin. */
export function RideBubble({ ride }: { ride: Ride & { distanceMi?: number } }) {
  return (
    <View style={styles.bubble}>
      {ride.status === 'live' ? <Text style={styles.live}>Live Now</Text> : null}
      <Text style={styles.bubbleTitle} numberOfLines={2}>{ride.name}</Text>
      <Text style={styles.bubbleText}>
        {meetsLabel(ride)}
        {ride.distanceMi != null ? `, ${ride.distanceMi < 1 ? 'under 1' : Math.round(ride.distanceMi)} mi away` : ''}
      </Text>
      <Text style={styles.bubbleLink}>Open Ride</Text>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

/** Zoom and back-to-my-state buttons, stacked on the map's right edge. */
export function MapControls({ onZoomIn, onZoomOut, onRecenter }: { onZoomIn: () => void; onZoomOut: () => void; onRecenter: () => void }) {
  return (
    <View style={styles.controls} pointerEvents="box-none">
      <View style={styles.zoomStack}>
        <RoundButton icon="plus" label="Zoom in" onPress={onZoomIn} />
        <View style={styles.rule} />
        <RoundButton icon="minus" label="Zoom out" onPress={onZoomOut} />
      </View>
      <View style={styles.zoomStack}>
        <RoundButton icon="locate" label="Back to my state" onPress={onRecenter} />
      </View>
    </View>
  );
}

/** The state label (top left), the ride count, and "Search this area" when the map has moved. */
export function MapOverlay({
  title, onPressTitle, count, moved, onSearch,
}: {
  title?: string | null;
  onPressTitle?: () => void;
  count: number;
  moved: boolean;
  onSearch?: () => void;
}) {
  return (
    <>
      <View style={styles.topLeft} pointerEvents="box-none">
        {title ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={onPressTitle ? `${title}, change state` : title}
            disabled={!onPressTitle}
            onPress={onPressTitle}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <Text style={styles.chipTitle}>{title}</Text>
            {onPressTitle ? <Icon name="chevron" size={14} color={Colors.textSecondary} strokeWidth={2.4} /> : null}
          </Pressable>
        ) : null}
        <View style={[styles.chip, styles.count]}>
          <View style={[styles.countDot, { backgroundColor: Colors.sky }]} />
          <Text style={styles.chipText}>{count === 0 ? 'No rides here yet' : `${count} ${count === 1 ? 'Ride' : 'Rides'}`}</Text>
        </View>
      </View>
      {moved && onSearch ? (
        <View style={styles.bottom} pointerEvents="box-none">
          <Pressable accessibilityRole="button" onPress={onSearch} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
            <Icon name="search" size={16} color={Colors.onAccent} strokeWidth={2.4} />
            <Text style={styles.searchText}>Search This Area</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const glass = 'rgba(10, 22, 38, 0.86)';

const styles = StyleSheet.create({
  pinWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 30, height: 30, borderRadius: 15, opacity: 0.3 },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: Colors.background },
  bubble: {
    width: 220, padding: 12, gap: 2, borderRadius: 14, backgroundColor: Colors.backgroundElement,
    borderWidth: 1, borderColor: Colors.border,
  },
  live: { color: Colors.accent, fontFamily: font(700), fontSize: 13 },
  bubbleTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19, lineHeight: 22 },
  bubbleText: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  bubbleLink: { color: Colors.sky, fontFamily: font(700), fontSize: 14, marginTop: 4 },
  controls: { position: 'absolute', right: 10, top: 10, gap: 8 },
  zoomStack: { borderRadius: 14, backgroundColor: glass, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  round: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  rule: { height: 1, backgroundColor: Colors.border, marginHorizontal: 8 },
  pressed: { opacity: 0.6 },
  topLeft: { position: 'absolute', left: 10, top: 10, gap: 6, alignItems: 'flex-start' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.pill, backgroundColor: glass, borderWidth: 1, borderColor: Colors.border,
  },
  chipTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 22 },
  count: { paddingVertical: 5 },
  countDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: Colors.text, fontFamily: font(600), fontSize: 13 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11,
    borderRadius: Radius.pill, backgroundColor: Colors.accent,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  searchText: { color: Colors.onAccent, fontFamily: font(700), fontSize: 15 },
});
