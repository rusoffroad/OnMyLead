import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { MapSearch } from '@/components/map-search';
import { PanelHandle } from '@/components/panel-handle';
import { RouteBuilderMap } from '@/components/route-builder-map';
import { TrailMapOverlay } from '@/components/trail-map-overlay';
import { Button, ErrorText } from '@/components/ui';
import Svg, { Path } from 'react-native-svg';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { OSM_ATTRIBUTION } from '@/core/osm-trails';
import type { Place } from '@/core/places';
import { miles, routeFromGpx, type RideRoute } from '@/core/route';
import { routeFromLegs } from '@/core/route-legs';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useLayout } from '@/hooks/use-layout';
import { usePanelFold } from '@/hooks/use-panel-fold';
import { useRouteDraft } from '@/hooks/use-route-draft';
import { useTrailMap } from '@/hooks/use-trail-map';
import { getPrivateDetails, getRide, getRideRoute, saveRideRoute } from '@/lib/api';
import { confirmAsync } from '@/lib/confirm';
import { handleProError, requirePro } from '@/lib/pro';
import { readPickedText } from '@/lib/read-text';
import type { Ride } from '@/lib/types';

/**
 * The organizer's route builder. Tap the map to lay down the route point by point, or bring in a
 * GPX track from another app. With Follow Trails on, each tap lands on the nearest trail or road
 * and the line between taps runs along it (core/trail-router); Straight Line draws straight
 * across ground nobody has mapped. Drag a point to move it. The search at the top moves the map
 * to a trailhead, park, forest or town before drawing. Swipe the panel down (or tap its handle)
 * to fold it to the miles and Undo and see more map.
 * On the website it's the same builder with a click instead of a tap, and on a wide screen the
 * panel sits beside the map instead of under it.
 */
export default function RouteBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [saved, setSaved] = useState<RideRoute | null>(null);
  const [imported, setImported] = useState<RideRoute | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'save' | 'gpx' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Where the map was looking when the search opened: nearby places rank first.
  const [searching, setSearching] = useState<LatLng | null | false>(false);
  const [found, setFound] = useState<Place | null>(null);
  const looking = useRef<LatLng | null>(null);
  const trail = useTrailMap();
  const [follow, , setFollow] = useRememberedToggle('route.followTrails.v1', true);
  const draft = useRouteDraft(follow, trail.offline);
  const { load: loadDraft, undo: undoDraft } = draft;
  const taps = draft.taps;
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  // Expanded windows (a tablet in landscape, a big iPad, a laptop browser) get the panel beside the
  // map, hanging from the top; Medium ones (a tablet in portrait) a floating card in the corner.
  const layout = useLayout();
  const wide = layout.expanded;
  const floating = layout.wide && !wide;
  // The tools panel folds down to the miles and Undo (swipe it down, or tap the handle) to see more map.
  const fold = usePanelFold('route.panelOpen.v1', true, wide ? 'up' : 'down');
  const open = fold.open;

  useEffect(() => {
    Promise.all([getRide(id), getPrivateDetails(id).catch(() => null), getRideRoute(id)])
      .then(([r, d, { route }]) => {
        setRide(r);
        if (d) setCenter({ lat: d.meet_lat, lng: d.meet_lng });
        else if (r) setCenter({ lat: r.meet_area_lat, lng: r.meet_area_lng });
        setSaved(route);
        if (route?.source === 'gpx') setImported(route);
        else if (route) loadDraft(route);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the ride.'))
      .finally(() => setLoaded(true));
  }, [id, loadDraft]);

  // What's on screen right now: an imported track, or the line through the taps.
  const route = useMemo(
    () => imported ?? routeFromLegs(taps, draft.legs, saved?.source === 'drawn' ? saved.name : null),
    [imported, taps, draft.legs, saved],
  );
  const pending = useMemo(() => draft.legs.filter((l) => l.pending).map((l) => l.points), [draft.legs]);
  const changed = JSON.stringify(route?.points ?? null) !== JSON.stringify(saved?.points ?? null);

  // A page opened from a link has nothing to go back to: land on the ride instead.
  const leave = () => (router.canGoBack() ? router.back() : ride ? router.replace(`/r/${ride.invite_code}`) : router.replace('/'));

  // Ctrl or Cmd + Z takes back the last point on the website.
  useEffect(() => {
    if (!web || imported) return;
    const onKey = (e: KeyboardEvent) => {
      const field = (e.target as HTMLElement | null)?.tagName;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && field !== 'INPUT' && field !== 'TEXTAREA') {
        e.preventDefault();
        undoDraft();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [web, imported, undoDraft]);

  function add(p: LatLng, radiusM: number) {
    Haptics.selectionAsync();
    draft.add(p, radiusM);
  }

  async function importGpx() {
    // Importing is Pro; drawing a route stays free.
    if (!requirePro('import_gpx')) return;
    setError(null);
    setBusy('gpx');
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      const r = routeFromGpx(await readPickedText(res.assets[0]));
      setImported(r);
      draft.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (route && !(await confirmAsync('Clear the route?', 'This removes every point. Nothing is saved until you tap Save Route.', 'Clear'))) return;
    setImported(null);
    draft.clear();
  }

  async function save() {
    setError(null);
    setBusy('save');
    try {
      await saveRideRoute(id, route);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      leave();
    } catch (e) {
      if (!handleProError(e)) setError(e instanceof Error ? e.message : 'Could not save the route.');
    } finally {
      setBusy(null);
    }
  }

  const click = web ? 'click' : 'tap';
  const hint = imported
    ? `Imported${imported.name ? ` “${imported.name}”` : ' from GPX'}. Clear it to draw your own.`
    : taps.length === 0
      ? `${web ? 'Click' : 'Tap'} the map where the ride starts, or Search for the trailhead.`
      : draft.lastNoTrail
        ? 'No mapped trail joins those points, so that part is a straight line. Add a point on the trail or zoom in.'
        : taps.length === 1
          ? follow
            ? `Now ${click} further along the trail. The route follows it for you.`
            : `Now ${click} the next turn or landmark.`
          : follow
            ? `Keep ${web ? 'clicking' : 'tapping'} along the trail. Drag a point to move it${web ? ', or press Ctrl+Z to undo' : ''}.`
            : `Straight lines between points. Switch to Follow Trails to snap to the trail.`;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {loaded ? (
        <RouteBuilderMap
          points={route?.points ?? []}
          waypoints={imported ? [] : taps}
          center={center}
          editable={!imported}
          onAdd={add}
          onMove={draft.move}
          pending={pending}
          trail={trail}
          found={found}
          onCenter={(c) => (looking.current = c)}
          padding={wide ? [90, 70, 40, PANEL_W + 60] : undefined}
        />
      ) : null}
      {loaded ? (
        <TrailMapOverlay
          trail={trail}
          top={insets.top + 66}
          cardTop={insets.top + 118}
          route={route?.points}
          ride={ride}
          lookupHint={imported ? 'Tap a line to see who can ride it.' : 'Press and hold a line to see who can ride it.'}
        />
      ) : null}

      <SafeAreaView edges={['top']} style={[styles.top, wide && styles.topWide]}>
        {searching !== false ? (
          <MapSearch near={searching} onPick={setFound} onClose={() => setSearching(false)} />
        ) : (
          <View style={styles.topRow}>
            <Pressable onPress={leave} hitSlop={16} accessibilityRole="button" accessibilityLabel="Back" style={styles.flex}>
              <Text style={styles.topText} numberOfLines={1}>‹ {ride?.name ?? 'Ride'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setSearching(looking.current ?? center)}
              accessibilityRole="button"
              accessibilityLabel="Search the Map for a Place"
              hitSlop={8}
              style={({ pressed }) => [styles.search, pressed && { opacity: 0.8 }]}>
              <Icon name="search" size={17} color={Colors.text} />
              <Text style={styles.searchText}>Search</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      <Animated.View
        {...fold.panHandlers}
        style={[styles.panel, wide && [styles.panelWide, { top: Math.max(88, insets.top + 72) }], floating && styles.panelFloating, { transform: [{ translateY: fold.drag }] }]}>
      <SafeAreaView edges={['bottom']} style={[styles.panelInner, !open && styles.panelFolded]}>
        <PanelHandle open={open} onToggle={() => fold.setOpen(!open)} what="Route Tools" fromTop={wide} />
        <View style={styles.readout}>
          <Text style={[styles.miles, !open && styles.milesFolded]} accessibilityLabel={`${route ? miles(route.lengthM) : 0} miles`}>
            {route ? miles(route.lengthM) : '0.0'}
            <Text style={[styles.unit, !open && { fontSize: 18 }]}> mi</Text>
          </Text>
          <View style={styles.readoutRight}>
            {!open && draft.finding ? <ActivityIndicator size="small" color={SAND} /> : null}
            <Text style={styles.count}>
              {imported ? `${imported.points.length} track points` : `${taps.length} ${taps.length === 1 ? 'point' : 'points'}`}
            </Text>
            {!open && !imported ? (
              <Pressable
                onPress={draft.undo}
                disabled={!taps.length}
                accessibilityRole="button"
                accessibilityLabel="Undo the last point"
                hitSlop={8}
                style={({ pressed }) => [styles.undoChip, !taps.length && { opacity: 0.4 }, pressed && { opacity: 0.75 }]}>
                <Text style={styles.undoText}>Undo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        {open ? (
          <>
            {!imported ? <ModeSwitch follow={follow} onChange={setFollow} /> : null}
            <View style={styles.hintRow}>
              {draft.finding ? <ActivityIndicator size="small" color={SAND} /> : null}
              <Text style={[styles.hint, { flex: 1 }]} accessibilityLiveRegion="polite">
                {draft.finding ? 'Finding the trail…' : hint}
              </Text>
            </View>
            <View style={styles.row}>
              <Button title="Undo" kind="secondary" style={styles.flex} disabled={!!imported || !taps.length} onPress={draft.undo} />
              <Button title="Clear" kind="secondary" style={styles.flex} disabled={!route && !taps.length} onPress={clear} />
              <Button title="Import GPX" kind="secondary" style={[styles.flex, { flexGrow: 1.6 }]} loading={busy === 'gpx'} onPress={importGpx} />
            </View>
          </>
        ) : null}
        <ErrorText error={error} />
        {open ? (
          <>
            <Button
              title={route ? 'Save Route' : saved ? 'Remove Route' : 'Save Route'}
              kind={!route && saved ? 'danger' : 'primary'}
              big
              disabled={!changed || (!route && !saved) || draft.finding}
              loading={busy === 'save'}
              onPress={save}
            />
            <Text style={styles.privacy}>
              Only riders on this ride can see the route.{web ? ' It’s in the OnMyLead app as soon as you save.' : ''}
            </Text>
          </>
        ) : null}
        {follow && !imported ? <Text style={styles.credit}>Trails: {OSM_ATTRIBUTION}</Text> : null}
      </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const SAND = '#ECCD91';

/**
 * Follow Trails or Straight Line, for the next points. Each glyph draws what the choice does:
 * a line that bends with the trail, or a ruler-straight one.
 */
function ModeSwitch({ follow, onChange }: { follow: boolean; onChange: (on: boolean) => void }) {
  const options = [
    { on: true, label: 'Follow Trails', d: 'M2 15 C 7 15, 7 5, 12 7 S 17 15, 22 5' },
    { on: false, label: 'Straight Line', d: 'M2 15 L 22 5' },
  ];
  return (
    <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="How the route joins your points">
      {options.map((o) => {
        const on = follow === o.on;
        return (
          <Pressable
            key={o.label}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) Haptics.selectionAsync();
              onChange(o.on);
            }}
            style={({ pressed }) => [styles.mode, on && styles.modeOn, pressed && { opacity: 0.85 }]}>
            <Svg width={24} height={20} viewBox="0 0 24 20">
              <Path d={o.d} stroke={on ? (o.on ? SAND : Colors.text) : Colors.textSecondary} strokeWidth={2.6} strokeLinecap="round" fill="none" strokeDasharray={o.on ? '5 3.5' : undefined} />
            </Svg>
            <Text style={[styles.modeText, on && { color: Colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PANEL_W = 400;

const styles = StyleSheet.create({
  topWide: { right: 'auto', width: PANEL_W + Spacing.two * 2, padding: 20, paddingBottom: 0 },
  panelFloating: { left: 12, right: 'auto', bottom: 12, width: PANEL_W, borderRadius: 24, borderWidth: 1, borderColor: Colors.border },
  panelWide: { top: 88, bottom: 'auto', left: 20, right: 'auto', width: PANEL_W, borderRadius: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' },
  // Above the side panel, so the search results drop down over it on a wide screen.
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.two, zIndex: 30 },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(10,22,38,0.9)', borderRadius: Radius.control, paddingHorizontal: 14, minHeight: 48,
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, marginLeft: 10,
    borderRadius: Radius.pill, backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: Colors.border,
  },
  searchText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  topText: { color: Colors.text, fontSize: 20, fontFamily: font(700, 'display') },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(10,22,38,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  panelInner: { padding: Spacing.three, paddingTop: 4, gap: 10 },
  panelFolded: { gap: 4 },
  readoutRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  milesFolded: { fontSize: 36, lineHeight: 40 },
  undoChip: {
    height: 36, paddingHorizontal: 14, borderRadius: Radius.pill, justifyContent: 'center',
    backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: Colors.border,
  },
  undoText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  miles: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 52, lineHeight: 54 },
  unit: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 24 },
  count: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 15 },
  hint: { color: Colors.text, fontFamily: font(600), fontSize: 16, lineHeight: 22 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  modes: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: Radius.control, backgroundColor: Colors.backgroundElement },
  mode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: Radius.control - 4 },
  modeOn: { backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: 'rgba(236,205,145,0.45)' },
  modeText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 15 },
  credit: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 11, textAlign: 'center', opacity: 0.8 },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  privacy: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, textAlign: 'center' },
});
