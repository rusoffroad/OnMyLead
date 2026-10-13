import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaPickerMap } from '@/components/area-picker-map';
import { SAND } from '@/components/offline-map-ui';
import { PanelHandle } from '@/components/panel-handle';
import { TrailMapOverlay } from '@/components/trail-map-overlay';
import { Button } from '@/components/ui';
import { Colors, font, Radius } from '@/constants/theme';
import { formatBoxMiles, formatBytes, OFFLINE_CHOICES, type OfflineChoice } from '@/core/offline-maps';
import type { Box } from '@/core/trails';
import { usePanelFold } from '@/hooks/use-panel-fold';
import { useTrailMap } from '@/hooks/use-trail-map';
import { downloadArea, planArea } from '@/lib/offline-maps';
import { requirePro } from '@/lib/pro';

const SIDE = 18;

/** Frame an area on the map and download it for riding with no signal. */
export default function PickArea() {
  const insets = useSafeAreaInsets();
  const trail = useTrailMap();
  const [start, setStart] = useState<{ lat: number; lng: number } | null | undefined>(undefined);
  const [box, setBox] = useState<Box | null>(null);
  const [choices, setChoices] = useState<OfflineChoice[]>(OFFLINE_CHOICES.map((c) => c.id));
  const [panelH, setPanelH] = useState(300);
  const [starting, setStarting] = useState(false);
  // Swipe the panel down (or tap its handle) to fold the choices away: the frame grows into the room.
  const fold = usePanelFold('mapArea.panelOpen.v1');

  // Start where the rider is: the last known fix is instant and good enough to frame a map.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
      .then((l) => setStart(l ? { lat: l.coords.latitude, lng: l.coords.longitude } : null))
      .catch(() => setStart(null));
  }, []);

  const frame = useMemo(() => ({ top: insets.top + 64, bottom: panelH + 14, left: SIDE, right: SIDE }), [insets.top, panelH]);
  const plan = useMemo(() => (box && choices.length ? planArea(box, choices) : null), [box, choices]);
  const tooBig = !!plan && plan.tooBig.length > 0;

  const toggle = (id: OfflineChoice) => setChoices((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const download = async () => {
    if (!box || !plan || tooBig) return;
    if (!requirePro('offline_maps')) return;
    setStarting(true);
    const name = await placeName(box);
    await downloadArea(name, box, choices);
    router.back();
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.root, { padding: 24, paddingTop: insets.top + 24 }]}>
        <Text style={styles.note}>Offline maps are in the iPhone app.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {start !== undefined ? <AreaPickerMap trail={trail} frame={frame} start={start} onBox={setBox} /> : null}

      {/* Dim everything outside the frame, so the area being saved is the bright part. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.shade, { top: 0, left: 0, right: 0, height: frame.top }]} />
        <View style={[styles.shade, { bottom: 0, left: 0, right: 0, height: frame.bottom }]} />
        <View style={[styles.shade, { top: frame.top, bottom: frame.bottom, left: 0, width: SIDE }]} />
        <View style={[styles.shade, { top: frame.top, bottom: frame.bottom, right: 0, width: SIDE }]} />
        <View style={[styles.frame, { top: frame.top, bottom: frame.bottom, left: SIDE, right: SIDE }, tooBig && { borderColor: Colors.danger }]}>
          <Corner style={{ top: -3, left: -3 }} rotate="0deg" danger={tooBig} />
          <Corner style={{ top: -3, right: -3 }} rotate="90deg" danger={tooBig} />
          <Corner style={{ bottom: -3, right: -3 }} rotate="180deg" danger={tooBig} />
          <Corner style={{ bottom: -3, left: -3 }} rotate="270deg" danger={tooBig} />
          {box ? (
            <View style={styles.sizeTag}>
              <Text style={styles.sizeText}>{formatBoxMiles(box)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <TrailMapOverlay trail={trail} top={frame.top + 10} cardTop={frame.top + 64} lookupHint="" />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.topText}>‹ Offline Maps</Text>
          </Pressable>
          <Text style={[styles.topText, { color: Colors.textSecondary }]}>Pick an Area</Text>
        </View>
      </SafeAreaView>

      <Animated.View
        {...fold.panHandlers}
        style={[styles.panel, { transform: [{ translateY: fold.drag }] }]}
        onLayout={(e) => setPanelH(Math.round(e.nativeEvent.layout.height))}>
      <SafeAreaView edges={['bottom']} style={[styles.panelInner, !fold.open && { gap: 8 }]}>
        <PanelHandle open={fold.open} onToggle={() => fold.setOpen(!fold.open)} what="Map Choices" />
        {fold.open ? <Text style={styles.hint}>Move and zoom the map until the frame holds the area you’ll ride.</Text> : null}
        {fold.open ? (
          <View style={styles.chips} accessibilityRole="none">
            {OFFLINE_CHOICES.map((c) => {
              const on = choices.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(c.id)}
                  style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && { color: Colors.background }]}>{on ? `✓ ${c.label}` : c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <View style={styles.estimate}>
          {!box ? (
            <ActivityIndicator color={SAND} />
          ) : !choices.length ? (
            <Text style={styles.estimateSub}>Pick at least one map to download.</Text>
          ) : tooBig ? (
            <Text style={[styles.estimateSub, { color: Colors.danger }]}>Too big for one download. Zoom in a little.</Text>
          ) : plan ? (
            <>
              <Text style={styles.estimateBig}>About {formatBytes(plan.bytes)}</Text>
              <Text style={styles.estimateSub}>{plan.tiles.toLocaleString()} map pieces</Text>
            </>
          ) : null}
        </View>
        <Button title="Download This Area" big loading={starting} disabled={!plan || tooBig || !choices.length} onPress={download} />
      </SafeAreaView>
      </Animated.View>
    </View>
  );
}

function Corner({ style, rotate, danger }: { style: object; rotate: string; danger: boolean }) {
  const c = danger ? Colors.danger : SAND;
  return (
    <View style={[styles.corner, style, { transform: [{ rotate }] }]}>
      <View style={[styles.cornerH, { backgroundColor: c }]} />
      <View style={[styles.cornerV, { backgroundColor: c }]} />
    </View>
  );
}

/** "Near Moab" from the phone's geocoder, or a dated name when it has nothing (or no signal). */
async function placeName(box: Box): Promise<string> {
  const center = { latitude: (box.minLat + box.maxLat) / 2, longitude: (box.minLng + box.maxLng) / 2 };
  try {
    const [place] = await Location.reverseGeocodeAsync(center);
    const town = place?.city || place?.subregion || place?.region;
    if (town) return `Near ${town}`;
  } catch {
    // No geocoder or no signal.
  }
  return `Map Area, ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  note: { color: Colors.text, fontFamily: font(600), fontSize: 17 },
  shade: { position: 'absolute', backgroundColor: 'rgba(10,22,38,0.55)' },
  frame: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(236,205,145,0.8)' },
  corner: { position: 'absolute', width: 26, height: 26 },
  cornerH: { position: 'absolute', top: 0, left: 0, width: 26, height: 5, borderRadius: 2 },
  cornerV: { position: 'absolute', top: 0, left: 0, width: 5, height: 26, borderRadius: 2 },
  sizeTag: {
    position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.pill, backgroundColor: 'rgba(10,22,38,0.88)',
  },
  sizeText: { color: SAND, fontFamily: font(700, 'display'), fontSize: 17 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  topText: { color: Colors.text, fontFamily: font(700), fontSize: 17 },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.background, borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card,
    borderTopWidth: 1, borderColor: Colors.border,
  },
  panelInner: { paddingHorizontal: 16, paddingTop: 2, gap: 12 },
  hint: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, minHeight: 40, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(236,205,145,0.5)',
  },
  chipOn: { backgroundColor: SAND, borderColor: SAND },
  chipText: { color: SAND, fontFamily: font(700), fontSize: 15 },
  estimate: { minHeight: 46, justifyContent: 'center', alignItems: 'center', gap: 1 },
  estimateBig: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26, lineHeight: 28 },
  estimateSub: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, textAlign: 'center' },
});
