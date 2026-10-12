import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, font, Radius } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { TOPO_ATTRIBUTION, TRAIL_SOURCE_IDS, TRAIL_SOURCES, type BaseMap, type TrailInfo } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { saveRideTiles, type SaveProgress, type TileLayerId } from '@/lib/trail-tiles';

const SAND = '#ECCD91';
const ROAD = '#E8ECF2';

/**
 * Everything drawn over a map for the trails feature: the layers button and its panel (with the
 * agencies' credit), and the card for a tapped trail. Place it as a sibling after the MapView.
 * `top`, `cardTop` and `bottom` keep it clear of each screen's own header and panels; `route` adds
 * a button to save the ride's area for use with no signal.
 */
export function TrailMapOverlay({
  trail, top = 12, cardTop, bottom = 12, route, lookupHint = 'Tap a line to see who can ride it.',
}: {
  trail: TrailMap;
  /** Where the layers button sits. */
  top?: number;
  /** Show a tapped trail's card at this distance from the top instead of at the bottom. */
  cardTop?: number;
  bottom?: number;
  route?: LatLng[] | null;
  lookupHint?: string;
}) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') return null;
  const credit = [trail.base === 'topo' ? TOPO_ATTRIBUTION : null, ...(trail.trails ? TRAIL_SOURCE_IDS.map((id) => TRAIL_SOURCES[id].attribution) : [])]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <View pointerEvents="box-none" style={[styles.corner, { top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Map layers"
          accessibilityState={{ expanded: open }}
          hitSlop={6}
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => [styles.fab, (open || trail.trails || trail.base === 'topo') && styles.fabOn, pressed && { opacity: 0.8 }]}>
          <LayersIcon color={trail.trails || trail.base === 'topo' ? SAND : Colors.text} />
        </Pressable>
        {open ? <LayersPanel trail={trail} route={route} lookupHint={lookupHint} credit={credit} /> : null}
      </View>

      {trail.zoomInHint && !open ? (
        <View pointerEvents="none" style={[styles.hint, { top: top + 6 }]}>
          <Text style={styles.hintText}>Zoom in to see trails</Text>
        </View>
      ) : null}

      {!open ? (
        <View pointerEvents="box-none" style={[styles.bottom, cardTop != null ? { top: cardTop } : { bottom }]}>
          {trail.looking ? (
            <View style={styles.looking}>
              <ActivityIndicator color={SAND} size="small" />
              <Text style={styles.lookingText}>Checking that trail</Text>
            </View>
          ) : trail.info ? (
            <TrailCard info={trail.info} onClose={trail.clearInfo} />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function LayersPanel({ trail, route, lookupHint, credit }: { trail: TrailMap; route?: LatLng[] | null; lookupHint: string; credit: string }) {
  return (
    <View style={styles.panel} accessibilityViewIsModal={false}>
      <Text style={styles.panelTitle}>Map</Text>
      <View style={styles.bases} accessibilityRole="radiogroup">
        {(['satellite', 'topo'] as BaseMap[]).map((b) => {
          const on = trail.base === b;
          return (
            <Pressable
              key={b}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => trail.setBase(b)}
              style={[styles.base, on && styles.baseOn]}>
              <Text style={[styles.baseText, on && { color: Colors.text }]}>{b === 'satellite' ? 'Satellite' : 'Topo'}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="switch" accessibilityState={{ checked: trail.trails }} onPress={() => trail.setTrails(!trail.trails)} style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rowTitle}>Public trails and roads</Text>
          <Text style={styles.rowSub}>Forest Service and BLM. {lookupHint}</Text>
        </View>
        <Switch
          value={trail.trails}
          onValueChange={trail.setTrails}
          trackColor={{ true: Colors.accent, false: Colors.backgroundSelected }}
          thumbColor={Colors.text}
          ios_backgroundColor={Colors.backgroundSelected}
        />
      </Pressable>

      {trail.trails ? (
        <View style={styles.legend}>
          <LegendLine dashed color={SAND} label="Trail" />
          <LegendLine color={ROAD} label="Road" />
        </View>
      ) : null}

      {route && route.length > 1 ? <SaveOffline route={route} base={trail.base} trails={trail.trails} /> : null}
      {credit ? <Text style={styles.fine}>Map data: {credit}</Text> : null}
    </View>
  );
}

function SaveOffline({ route, base, trails }: { route: LatLng[]; base: BaseMap; trails: boolean }) {
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const cancel = useRef({ cancelled: false });
  useEffect(() => () => void (cancel.current.cancelled = true), []);

  const layers: TileLayerId[] = [...(trails ? TRAIL_SOURCE_IDS : []), ...(base === 'topo' ? (['topo'] as const) : [])];
  if (!layers.length) return <Text style={styles.rowSub}>Turn on trails or topo to save them for riding with no signal.</Text>;

  const start = async () => {
    setState('saving');
    cancel.current = { cancelled: false };
    const result = await saveRideTiles(route, layers, setProgress, cancel.current);
    if (!cancel.current.cancelled) {
      setProgress(result);
      setState('saved');
    }
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        disabled={state === 'saving'}
        onPress={start}
        style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }, state === 'saving' && { opacity: 0.7 }]}>
        <Text style={styles.saveText}>
          {state === 'saving' ? `Saving this ride's map… ${pct}%` : state === 'saved' ? 'Saved for no signal' : "Save this ride's map for no signal"}
        </Text>
      </Pressable>
      {state === 'saving' ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
      ) : null}
      {state === 'saved' && progress && progress.failed > 0 ? (
        <Text style={styles.rowSub}>{`${progress.failed} of ${progress.total} pieces didn't download. Tap again with better signal to finish.`}</Text>
      ) : null}
    </View>
  );
}

export function TrailCard({ info, onClose }: { info: TrailInfo; onClose: () => void }) {
  const facts = [info.kind === 'trail' ? 'Trail' : 'Road', info.miles != null ? `${info.miles} mi segment` : null, info.surface].filter(Boolean);
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.cardHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>{info.title}</Text>
          {info.where ? <Text style={styles.rowSub} numberOfLines={1}>{info.where}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.textSecondary} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>
      <Text style={styles.facts}>{facts.join('   ')}</Text>
      {info.allowed.length ? (
        <View style={styles.allowed}>
          <Text style={styles.allowedLabel}>{info.seasonal ? 'Open to, by season' : 'Open to'}</Text>
          {info.allowed.slice(0, 6).map((a) => (
            <View key={a.vehicle} style={styles.allowedRow}>
              <Text style={styles.allowedName}>{a.vehicle}</Text>
              {a.dates ? <Text style={styles.allowedDates}>{a.dates}</Text> : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.rowSub}>{"The agency data doesn't list which vehicles can use this one."}</Text>
      )}
      <Text style={styles.fine}>From {info.attribution}. Check posted signs and closures before you ride.</Text>
    </View>
  );
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <Svg width={28} height={8}>
        <Path d="M2 4H26" stroke={Colors.background} strokeWidth={6} strokeLinecap="round" />
        <Path d="M2 4H26" stroke={color} strokeWidth={3} strokeDasharray={dashed ? '5 4' : undefined} />
      </Svg>
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function LayersIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5l8.5 4.5-8.5 4.5-8.5-4.5z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M3.5 12.2l8.5 4.5 8.5-4.5M3.5 16.4l8.5 4.5 8.5-4.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const glass = { backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: Colors.border } as const;

const styles = StyleSheet.create({
  corner: { position: 'absolute', right: 12, alignItems: 'flex-end', gap: 8, zIndex: 20 },
  fab: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...glass },
  fabOn: { borderColor: SAND },
  hint: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, ...glass },
  hintText: { color: Colors.text, fontFamily: font(600), fontSize: 13 },
  panel: { width: 288, borderRadius: Radius.card, padding: 14, gap: 12, ...glass },
  panelTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20 },
  bases: { flexDirection: 'row', backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, padding: 3 },
  base: { flex: 1, minHeight: 36, borderRadius: Radius.control - 3, alignItems: 'center', justifyContent: 'center' },
  baseOn: { backgroundColor: Colors.backgroundSelected },
  baseText: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  rowSub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  legend: { flexDirection: 'row', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  save: { minHeight: 42, borderRadius: Radius.control, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  saveText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
  track: { height: 4, borderRadius: 2, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: SAND },
  bottom: { position: 'absolute', left: 12, right: 12, gap: 6, zIndex: 25 },
  looking: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, ...glass },
  lookingText: { color: Colors.text, fontFamily: font(600), fontSize: 13 },
  card: { borderRadius: Radius.card, padding: 14, gap: 8, ...glass, borderColor: 'rgba(236,205,145,0.45)' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 24 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundElement },
  facts: { color: SAND, fontFamily: font(600), fontSize: 13 },
  allowed: { gap: 4 },
  allowedLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  allowedRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  allowedName: { color: Colors.text, fontFamily: font(600), fontSize: 15, flexShrink: 1 },
  allowedDates: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  fine: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12, lineHeight: 16 },
});
