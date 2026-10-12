import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteBuilderMap } from '@/components/route-builder-map';
import { TrailMapOverlay } from '@/components/trail-map-overlay';
import { Button, ErrorText } from '@/components/ui';
import Svg, { Path } from 'react-native-svg';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { OSM_ATTRIBUTION } from '@/core/osm-trails';
import { miles, routeFromGpx, type RideRoute } from '@/core/route';
import { routeFromLegs } from '@/core/route-legs';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
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
 * across ground nobody has mapped. Drag a point to move it.
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
  const trail = useTrailMap();
  const [follow, , setFollow] = useRememberedToggle('route.followTrails.v1', true);
  const draft = useRouteDraft(follow, trail.offline);
  const { load: loadDraft, undo: undoDraft } = draft;
  const taps = draft.taps;
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const wide = web && width >= WIDE;

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
      ? `${web ? 'Click' : 'Tap'} the map where the ride starts.`
      : draft.lastNoTrail
        ? 'No mapped trail joins those points, so that part is a straight line. Add a point on the trail or zoom in.'
        : taps.length === 1
          ? follow
            ? `Now ${click} further along the trail. The route follows it for you.`
            : `Now ${click} the next turn or landmark.`
          : follow
            ? `Keep ${click}ing along the trail. Drag a point to move it${web ? ', or press Ctrl+Z to undo' : ''}.`
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
        <View style={styles.topRow}>
          <Pressable onPress={leave} hitSlop={16} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.topText}>‹ {ride?.name ?? 'Ride'}</Text>
          </Pressable>
          <Text style={[styles.topText, { color: Colors.textSecondary }]}>Route</Text>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={[styles.panel, wide && styles.panelWide]}>
        <View style={styles.readout}>
          <Text style={styles.miles} accessibilityLabel={`${route ? miles(route.lengthM) : 0} miles`}>
            {route ? miles(route.lengthM) : '0.0'}
            <Text style={styles.unit}> mi</Text>
          </Text>
          <Text style={styles.count}>
            {imported ? `${imported.points.length} track points` : `${taps.length} ${taps.length === 1 ? 'point' : 'points'}`}
          </Text>
        </View>
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
        <ErrorText error={error} />
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
        {follow && !imported ? <Text style={styles.credit}>Trails: {OSM_ATTRIBUTION}</Text> : null}
      </SafeAreaView>
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

/** At this width and up (a laptop or desktop browser), the panel moves beside the map. */
const WIDE = 900;
const PANEL_W = 400;

const styles = StyleSheet.create({
  topWide: { right: 'auto', width: PANEL_W + Spacing.two * 2, padding: 20, paddingBottom: 0 },
  panelWide: { top: 88, bottom: 'auto', left: 20, right: 'auto', width: PANEL_W, borderRadius: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.two },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(10,22,38,0.9)', borderRadius: Radius.control, paddingHorizontal: 14, minHeight: 48,
  },
  topText: { color: Colors.text, fontSize: 20, fontFamily: font(700, 'display') },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.three, paddingTop: Spacing.three, gap: 10,
    backgroundColor: 'rgba(10,22,38,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
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
