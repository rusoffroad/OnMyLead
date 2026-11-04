import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, font, Radius, themedStyles } from '@/constants/theme';
import { fractionToMiles, milesText, milesToFraction, SCOUT_MAX_MILES, SCOUT_MILE_STEPS, SCOUT_MIN_MILES, stepMiles } from '@/core/spots';
import { t } from '@/lib/i18n';

/**
 * How far Scout looks: a big mileage readout over a track the rider drags or taps, with − and +
 * on either side for one stop at a time (and for keyboards and screen readers). The track snaps to
 * the stops in core/spots.ts (10 to 1,000 miles). The search runs when the finger lifts, not on
 * every stop it passes.
 */
export function MileSlider({ miles, onChange }: { miles: number; onChange: (miles: number) => void }) {
  const [live, setLive] = useState(miles);
  const dragging = useRef(false);
  const track = useRef<View>(null);
  const box = useRef({ x: 0, w: 1 });

  useEffect(() => {
    if (!dragging.current) setLive(miles);
  }, [miles]);

  const at = (e: GestureResponderEvent) => fractionToMiles((e.nativeEvent.pageX - box.current.x) / box.current.w);
  const commit = (m: number) => {
    setLive(m);
    if (m !== miles) onChange(m);
  };
  const step = (by: 1 | -1) => commit(stepMiles(live, by));
  const f = milesToFraction(live);

  return (
    <View style={styles.wrap}>
      <View style={styles.readoutRow}>
        <Text style={styles.label}>{t('How Far to Look')}</Text>
        <Text style={styles.readout} accessibilityElementsHidden importantForAccessibility="no">
          {milesText(live)}
          <Text style={styles.unit}> {t('mi')}</Text>
        </Text>
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Look closer')}
          disabled={live <= SCOUT_MIN_MILES}
          onPress={() => step(-1)}
          hitSlop={6}
          style={({ pressed }) => [styles.end, pressed && styles.pressed, live <= SCOUT_MIN_MILES && styles.off]}>
          <Icon name="minus" size={18} />
        </Pressable>
        <View
          ref={track}
          style={styles.hit}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('Search distance')}
          accessibilityValue={{ text: t('{n} miles', { n: milesText(live) }) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          onLayout={() => track.current?.measureInWindow((x, _y, w) => (box.current = { x, w: Math.max(1, w) }))}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => {
            dragging.current = true;
            // The page may have scrolled since layout: measure again, then place the knob.
            const pageX = e.nativeEvent.pageX;
            track.current?.measureInWindow((x, _y, w) => {
              box.current = { x, w: Math.max(1, w) };
              setLive(fractionToMiles((pageX - x) / box.current.w));
            });
          }}
          onResponderMove={(e) => setLive(at(e))}
          onResponderRelease={(e) => {
            dragging.current = false;
            commit(at(e));
          }}
          onResponderTerminate={() => {
            dragging.current = false;
            commit(live);
          }}>
          <View style={styles.rail} pointerEvents="none">
            <View style={[styles.fill, { width: `${f * 100}%` }]} />
            {SCOUT_MILE_STEPS.map((s, i) => (
              <View key={s} style={[styles.tick, { left: `${(i / (SCOUT_MILE_STEPS.length - 1)) * 100}%` }, i / (SCOUT_MILE_STEPS.length - 1) <= f && styles.tickOn]} />
            ))}
          </View>
          <View pointerEvents="none" style={[styles.knob, { left: `${f * 100}%` }]} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Look farther')}
          disabled={live >= SCOUT_MAX_MILES}
          onPress={() => step(1)}
          hitSlop={6}
          style={({ pressed }) => [styles.end, pressed && styles.pressed, live >= SCOUT_MAX_MILES && styles.off]}>
          <Icon name="plus" size={18} />
        </Pressable>
      </View>
      <View style={styles.scale} pointerEvents="none">
        <Text style={styles.scaleText}>{milesText(SCOUT_MIN_MILES)}</Text>
        <Text style={styles.scaleText}>{milesText(SCOUT_MAX_MILES)} {t('mi')}</Text>
      </View>
    </View>
  );
}

const KNOB = 26;

const styles = themedStyles(() => ({
  wrap: { gap: 4 },
  readoutRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  label: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, marginBottom: 6 },
  readout: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 42, fontVariant: ['tabular-nums'] },
  unit: { color: Colors.textSecondary, fontFamily: font(600, 'display'), fontSize: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  end: {
    width: 40, height: 40, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.backgroundSelected,
  },
  pressed: { opacity: 0.6 },
  off: { opacity: 0.35 },
  hit: { flex: 1, height: 44, justifyContent: 'center', marginHorizontal: KNOB / 2 },
  rail: { height: 8, borderRadius: 4, backgroundColor: Colors.backgroundSelected },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: Colors.gold },
  tick: { position: 'absolute', top: 2, width: 4, height: 4, marginLeft: -2, borderRadius: 2, backgroundColor: Colors.textSecondary, opacity: 0.5 },
  tickOn: { backgroundColor: Colors.background, opacity: 0.45 },
  knob: {
    position: 'absolute', width: KNOB, height: KNOB, marginLeft: -KNOB / 2, borderRadius: KNOB / 2,
    backgroundColor: Colors.text, borderWidth: 4, borderColor: Colors.gold,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  scale: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 50 },
  scaleText: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12 },
}));
