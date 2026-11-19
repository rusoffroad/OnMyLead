import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { SheetModal } from '@/components/sheet-modal';
import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { Button, ErrorText } from '@/components/ui';
import { WaypointBlaze } from '@/components/waypoint-blaze';
import { Colors, font, Glass, Radius, Spacing, themedStyles } from '@/constants/theme';
import { rideActionError } from '@/core/errors';
import { importSummary, markDuplicates } from '@/core/waypoint-import';
import { symbolLabel } from '@/core/waypoint-symbols';
import type { Waypoint } from '@/core/waypoints';
import { useLayout } from '@/hooks/use-layout';
import { t as tr } from '@/lib/i18n';
import { addMapWaypoints, removeMapWaypoints } from '@/lib/map-waypoints';
import type { WaypointFile } from '@/lib/waypoint-import';
import { addWaypoints, removeWaypoints, RIDE_WAYPOINT_MAX } from '@/lib/waypoints';

/** The ride imported waypoints can go on, when there is one. */
export type ImportRide = {
  id: string;
  /** The leader or an organizer: theirs go on everyone's map. */
  canShare: boolean;
  /** Under way: imported ones stay Just Me, so the group isn't sent an alert for each. */
  live: boolean;
  existing: Waypoint[];
  me: string | null | undefined;
};

export type ImportDone = { where: 'map' | 'ride'; waypoints: Waypoint[] };

/** How many rows show before Show All. */
const PREVIEW = 5;

/**
 * Import Waypoints: what's in the file the rider opened, where the pins go (their own map, or the
 * ride), and which ones to bring in. Pins they already have start unticked.
 */
type SheetProps = {
  file: WaypointFile | null;
  mapExisting: Waypoint[];
  ride?: ImportRide | null;
  /** Opened from the ride's Waypoints page: This Ride starts picked. */
  startOnRide?: boolean;
  onDone: (done: ImportDone) => void;
  onClose: () => void;
};

export function ImportWaypointsSheet({ file, ...rest }: SheetProps) {
  // A fresh sheet for each file, so nothing carries over from the last one.
  return file ? <Sheet key={`${file.name}:${file.result.pins.length}`} file={file} {...rest} /> : null;
}

function Sheet({ file, mapExisting, ride, startOnRide, onDone, onClose }: SheetProps & { file: WaypointFile }) {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const [toRide, setToRide] = useState(!!startOnRide && !!ride);
  // The rows the rider changed by hand; the rest follow "already have it".
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pins = file.result.pins;
  const onRide = toRide && !!ride;
  const dups = useMemo(
    () => markDuplicates(pins, onRide ? ride!.existing : mapExisting),
    // The lists change as the import saves; what's a repeat is worked out when the sheet opens or the place changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pins, onRide],
  );
  const isOn = (i: number) => dups[i] === flipped.has(i);
  const place = (ride: boolean) => {
    setToRide(ride);
    setFlipped(new Set());
  };

  const picked = pins.filter((_, i) => isOn(i));
  const mine = onRide ? ride!.existing.filter((w) => w.user_id === ride!.me).length : 0;
  const room = onRide ? Math.max(0, RIDE_WAYPOINT_MAX - mine) : Infinity;
  const tooMany = picked.length > room;
  const shared = onRide && ride!.canShare && !ride!.live;
  const shown = all ? pins : pins.slice(0, PREVIEW);

  function toggle(i: number) {
    Haptics.selectionAsync();
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const waypoints = onRide
        ? await addWaypoints(ride!.id, picked.map((p) => ({ ...p, shared })))
        : await addMapWaypoints(picked);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone({ where: onRide ? 'ride' : 'map', waypoints });
    } catch (e) {
      setError(e instanceof Error ? rideActionError(e.message) : tr('Couldn’t import the waypoints. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const rideBody = !ride
    ? ''
    : ride.live && ride.canShare
      ? tr('Just you for now. Share any of them from the map.')
      : ride.canShare
        ? tr('Everyone on the ride sees them')
        : tr('Only you, on this ride');

  return (
    <SheetModal visible transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot style={wide ? { flexDirection: 'row' } : undefined}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={tr('Close')} accessibilityRole="button" />
        <SwipeSheet
          onClose={onClose}
          enabled={!busy && !wide}
          style={[
            styles.sheet,
            wide ? [styles.side, { paddingTop: insets.top + Spacing.three, paddingRight: Math.max(insets.right, Spacing.four) }] : null,
            { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two },
          ]}
          accessibilityViewIsModal>
          {wide ? null : <View style={styles.grip} />}
          <Text style={styles.title} accessibilityRole="header">{tr('Import Waypoints')}</Text>
          <SheetScroll contentContainerStyle={{ gap: Spacing.three }} style={{ flexShrink: 1, maxHeight: wide ? undefined : 520 }}>
            <View style={styles.file}>
              <View style={styles.fileIcon}>
                <Text style={styles.fileType}>{file.result.format === 'geojson' ? 'JSON' : file.result.format.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                <Text style={styles.fileMeta}>{importSummary(pins.length, file.result.lines)}</Text>
              </View>
            </View>

            {ride ? (
              <View style={{ gap: Spacing.two }}>
                <Text style={styles.label}>{tr('Add To')}</Text>
                <View style={styles.places} accessibilityRole="radiogroup">
                  <Place on={!onRide} title={tr('My Map')} body={tr('Only you, in Map Mode')} onPress={() => place(false)} />
                  <Place on={onRide} title={tr('This Ride')} body={rideBody} onPress={() => place(true)} />
                </View>
              </View>
            ) : null}

            <View style={{ gap: Spacing.two }}>
              <Text style={styles.label}>{tr('Waypoints')}</Text>
              <View style={styles.list}>
                {shown.map((p, i) => {
                  const on = isOn(i);
                  return (
                    <Pressable
                      key={i}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${p.name}. ${symbolLabel(p.symbol)}${dups[i] ? `. ${tr('Already Have')}` : ''}`}
                      onPress={() => toggle(i)}
                      style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { opacity: 0.8 }]}>
                      <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={16} color="#FFFFFF" /> : null}</View>
                      <WaypointBlaze symbol={p.symbol} shared={shared} size={30} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.kind} numberOfLines={1}>{symbolLabel(p.symbol)}</Text>
                      </View>
                      {dups[i] ? <Text style={styles.dup}>{tr('Already Have')}</Text> : null}
                    </Pressable>
                  );
                })}
                {pins.length > PREVIEW && !all ? (
                  <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={[styles.more, styles.rowLine]}>
                    <Text style={styles.moreText}>{tr('Show All {n}', { n: pins.length })}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.note}>{tr('Symbols are picked from each pin’s name. You can change any of them later.')}</Text>
            </View>
          </SheetScroll>
          <ErrorText
            error={
              !tooMany
                ? error
                : room > 0
                  ? tr('A ride holds {max} of your waypoints, so there is room for {room} more. Untick a few, or add them to My Map.', { max: RIDE_WAYPOINT_MAX, room })
                  : tr('You have {max} waypoints on this ride. Add these to My Map instead.', { max: RIDE_WAYPOINT_MAX })
            }
          />
          <Button
            title={picked.length === 1 ? tr('Import 1 Waypoint') : tr('Import {n} Waypoints', { n: picked.length })}
            big
            loading={busy}
            disabled={!picked.length || tooMany}
            onPress={run}
          />
          <Button title={tr('Cancel')} kind="ghost" disabled={busy} onPress={onClose} />
        </SwipeSheet>
      </SheetRoot>
    </SheetModal>
  );
}

function Place({ on, title, body, onPress }: { on: boolean; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${title}. ${body}`}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.place, on && { borderColor: Colors.sky, backgroundColor: Colors.backgroundSelected }]}>
      <Text style={styles.placeTitle}>{title}</Text>
      <Text style={styles.placeBody}>{body}</Text>
    </Pressable>
  );
}

/** Take an import back out (Undo). */
export async function undoImport(done: ImportDone): Promise<void> {
  const ids = done.waypoints.map((w) => w.id);
  if (done.where === 'ride') await removeWaypoints(ids);
  else await removeMapWaypoints(ids);
}

/** How long the Imported bar stays up. */
const DONE_MS = 10_000;

/**
 * "26 Waypoints Imported · Undo": floats over the map for a few seconds after an import.
 */
export function ImportDoneBar({ done, onUndone, onGone, bottom }: {
  done: ImportDone | null;
  onUndone: (d: ImportDone) => void;
  onGone: () => void;
  /** Floats this far above the bottom of the map; leave out to sit in the page where it's placed. */
  bottom?: number;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onGone, DONE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  if (!done) return null;
  const n = done.waypoints.length;
  return (
    <View style={[styles.done, bottom != null ? [styles.doneFloat, { bottom }] : null]} accessibilityLiveRegion="polite">
      <Icon name="check" size={18} color={Colors.text} />
      <Text style={styles.doneText} numberOfLines={1}>{n === 1 ? tr('1 Waypoint Imported') : tr('{n} Waypoints Imported', { n })}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('Undo the import')}
        disabled={busy}
        hitSlop={12}
        onPress={async () => {
          setBusy(true);
          try {
            await undoImport(done);
            onUndone(done);
          } catch {
            // Offline: they stay; the rider can remove them from the map.
          } finally {
            setBusy(false);
            onGone();
          }
        }}>
        <Text style={[styles.undo, busy && { opacity: 0.5 }]}>{tr('Undo')}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => ({
  scrim: { flex: 1, backgroundColor: Colors.scrim },
  sheet: {
    flexShrink: 1, backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
  },
  // Tablets and the website: a panel down the right edge, beside the map.
  side: { width: 420, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0, borderLeftWidth: 1 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.control, backgroundColor: Colors.backgroundSelected },
  fileIcon: { width: 40, height: 46, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundElement },
  fileType: { color: Colors.sky, fontFamily: font(800), fontSize: 11 },
  fileName: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  fileMeta: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  label: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  places: { flexDirection: 'row', gap: Spacing.two },
  place: { flex: 1, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.control, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center' },
  placeTitle: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  placeBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 17 },
  list: { borderRadius: Radius.control, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderColor: Colors.border },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.sky, borderColor: Colors.sky },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  kind: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  dup: { color: Colors.gold, fontFamily: font(700), fontSize: 13 },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: Colors.sky, fontFamily: font(700), fontSize: 15 },
  note: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  done: {
    minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border, zIndex: 50, elevation: 8,
  },
  doneFloat: { position: 'absolute', left: 12, right: 12, maxWidth: 420, marginHorizontal: 'auto' },
  doneText: { flex: 1, color: Colors.text, fontFamily: font(700), fontSize: 15 },
  undo: { color: Colors.sky, fontFamily: font(800), fontSize: 15 },
}));
