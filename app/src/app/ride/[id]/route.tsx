import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteBuilderMap } from '@/components/route-builder-map';
import { Button, ErrorText } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { miles, routeFromGpx, routeFromWaypoints, type RideRoute } from '@/core/route';
import { getPrivateDetails, getRide, getRideRoute, saveRideRoute } from '@/lib/api';
import { confirmAsync } from '@/lib/confirm';
import { readPickedText } from '@/lib/read-text';
import type { Ride } from '@/lib/types';

/**
 * The organizer's route builder. Tap the map to lay down the route point by point (straight
 * lines between taps; drag a point to move it), or bring in a GPX track from another app.
 */
export default function RouteBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [saved, setSaved] = useState<RideRoute | null>(null);
  const [imported, setImported] = useState<RideRoute | null>(null);
  const [taps, setTaps] = useState<LatLng[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'save' | 'gpx' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getRide(id), getPrivateDetails(id).catch(() => null), getRideRoute(id)])
      .then(([r, d, { route }]) => {
        setRide(r);
        if (d) setCenter({ lat: d.meet_lat, lng: d.meet_lng });
        else if (r) setCenter({ lat: r.meet_area_lat, lng: r.meet_area_lng });
        setSaved(route);
        if (route?.source === 'gpx') setImported(route);
        else if (route) setTaps(route.waypoints.length ? route.waypoints : route.points);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the ride.'))
      .finally(() => setLoaded(true));
  }, [id]);

  // What's on screen right now: an imported track, or the line through the taps.
  const route = useMemo(() => imported ?? (taps.length > 1 ? routeFromWaypoints(taps, saved?.source === 'drawn' ? saved.name : null) : null), [imported, taps, saved]);
  const changed = JSON.stringify(route?.points ?? null) !== JSON.stringify(saved?.points ?? null);

  function add(p: LatLng) {
    Haptics.selectionAsync();
    setTaps((t) => [...t, p]);
  }

  async function importGpx() {
    setError(null);
    setBusy('gpx');
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      const r = routeFromGpx(await readPickedText(res.assets[0]));
      setImported(r);
      setTaps([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (route && !(await confirmAsync('Clear the route?', 'This removes every point. Nothing is saved until you tap Save route.', 'Clear'))) return;
    setImported(null);
    setTaps([]);
  }

  async function save() {
    setError(null);
    setBusy('save');
    try {
      await saveRideRoute(id, route);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the route.');
    } finally {
      setBusy(null);
    }
  }

  const hint = imported
    ? `Imported${imported.name ? ` “${imported.name}”` : ' from GPX'}. Clear it to draw your own.`
    : Platform.OS === 'web'
      ? 'Import a GPX track, or draw the route in the OnMyLead app.'
      : taps.length === 0
        ? 'Tap the map where the ride starts.'
        : taps.length === 1
          ? 'Now tap the next turn or landmark.'
          : 'Keep tapping along the trail. Drag a point to move it.';

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {loaded ? (
        <RouteBuilderMap
          points={route?.points ?? []}
          waypoints={imported ? [] : taps}
          center={center}
          editable={!imported && Platform.OS !== 'web'}
          onAdd={add}
          onMove={(i, p) => setTaps((t) => t.map((x, j) => (j === i ? p : x)))}
        />
      ) : null}

      <SafeAreaView edges={['top']} style={styles.top}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.topText}>‹ {ride?.name ?? 'Ride'}</Text>
          </Pressable>
          <Text style={[styles.topText, { color: Colors.textSecondary }]}>Route</Text>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <View style={styles.readout}>
          <Text style={styles.miles} accessibilityLabel={`${route ? miles(route.lengthM) : 0} miles`}>
            {route ? miles(route.lengthM) : '0.0'}
            <Text style={styles.unit}> mi</Text>
          </Text>
          <Text style={styles.count}>
            {imported ? `${imported.points.length} track points` : `${taps.length} ${taps.length === 1 ? 'point' : 'points'}`}
          </Text>
        </View>
        <Text style={styles.hint}>{hint}</Text>
        <View style={styles.row}>
          <Button title="Undo" kind="secondary" style={styles.flex} disabled={!!imported || !taps.length} onPress={() => setTaps((t) => t.slice(0, -1))} />
          <Button title="Clear" kind="secondary" style={styles.flex} disabled={!route && !taps.length} onPress={clear} />
          <Button title="Import GPX" kind="secondary" style={[styles.flex, { flexGrow: 1.6 }]} loading={busy === 'gpx'} onPress={importGpx} />
        </View>
        <ErrorText error={error} />
        <Button
          title={route ? 'Save route' : saved ? 'Remove route' : 'Save route'}
          kind={!route && saved ? 'danger' : 'primary'}
          big
          disabled={!changed || (!route && !saved)}
          loading={busy === 'save'}
          onPress={save}
        />
        <Text style={styles.privacy}>Only riders on this ride can see the route.</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  privacy: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, textAlign: 'center' },
});
