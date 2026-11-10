import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, font, Radius, RideColors, themedStyles } from '@/constants/theme';
import { flagOn } from '@/core/app-settings';
import type { DishGlance, GlanceLabel } from '@/core/starlink-proto';
import { useAppSettings } from '@/lib/app-settings';
import { t } from '@/lib/i18n';
import { onSyncedChange } from '@/lib/settings-sync';
import { dishGlance, dishReadSupported, readClientCount, readStatus } from '@/lib/starlink';
import { Home } from './parts';

/** Same key the Starlink page sets when the rider taps Connect to My Dish (app/starlink.tsx). */
const AUTO_KEY = 'starlink.autoConnect.v1';
/** While a dish answers: how often Home reads it again. */
const LIVE_EVERY_MS = 10_000;
/** While nothing answers: how often Home looks again (one quick request to the dish's address). */
const LOOK_EVERY_MS = 30_000;
/** The devices count changes slowly; ask the router about once a minute. */
const DEVICES_EVERY_MS = 60_000;

/**
 * Reads the dish while Home is open and the app is in front, and gives null whenever no Starlink
 * answers, so the card simply isn't there. On iPhone and iPad it waits until the rider has
 * connected once on the Starlink page, so iOS's local network prompt never pops up on Home for
 * riders without a Starlink. Android has no such prompt, so it looks straight away.
 */
function useHomeDish(): DishGlance | null {
  const { settings } = useAppSettings();
  const on = flagOn(settings, 'starlink') && dishReadSupported;
  const [allowed, setAllowed] = useState(Platform.OS === 'android');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [glance, setGlance] = useState<DishGlance | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android') return;
    AsyncStorage.getItem(AUTO_KEY).then((v) => v === '1' && setAllowed(true)).catch(() => {});
    return onSyncedChange(AUTO_KEY, (v) => setAllowed(v === '1'));
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const running = on && allowed && focused && active;
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let devices: number | null = null;
    let devicesAt = 0;
    const tick = async () => {
      let next = LIVE_EVERY_MS;
      try {
        const s = await readStatus(2500);
        if (stopped) return;
        // Only once the dish has answered do we ask the Starlink router, never some other router.
        if (Date.now() - devicesAt >= DEVICES_EVERY_MS) {
          devicesAt = Date.now();
          devices = await readClientCount();
          if (stopped) return;
        }
        setGlance(dishGlance(s, devices));
      } catch {
        if (stopped) return;
        setGlance(null);
        devices = null;
        devicesAt = 0;
        next = LOOK_EVERY_MS;
      }
      if (!stopped) timer = setTimeout(tick, next);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [running]);

  return running ? glance : null;
}

/** Short labels, so four numbers fit side by side on a small phone. */
const label = (l: GlanceLabel) =>
  l === 'Down' ? t('Down') : l === 'Up' ? t('Up') : l === 'Latency' ? t('Latency') : t('Sky Blocked');

/** A small Starlink card on Home, only while the phone can see a Starlink dish. Tap for the Starlink page. */
export function StarlinkHomeCard() {
  const g = useHomeDish();
  if (!g) return null;
  const devices = g.devices ? (g.devices.n === 1 ? t('1 Device Connected') : t('{n} Devices Connected', { n: g.devices.n })) : null;
  const dot = g.online ? RideColors.green : RideColors.red;
  const summary = [t('Starlink'), t(g.state), ...g.stats.map((s) => `${label(s.label)} ${s.value}`), devices].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary}
      accessibilityHint={t('Opens the Starlink page')}
      onPress={() => router.push('/starlink')}
      style={({ pressed }) => [styles.card, { borderLeftColor: dot }, pressed && { opacity: 0.85 }]}>
      <View style={styles.head}>
        <Icon name="dish" size={20} color={Colors.text} strokeWidth={2} />
        <Text style={styles.title}>{t('Starlink')}</Text>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={styles.state} numberOfLines={1}>{t(g.state)}</Text>
        <View style={{ flex: 1 }} />
        <Icon name="chevron" color={Home.muted} />
      </View>
      {g.stats.length ? (
        <View style={styles.stats}>
          {g.stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.value} numberOfLines={1}>{s.value}</Text>
              <Text style={styles.label} numberOfLines={1}>{label(s.label)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {devices ? (
        <View style={styles.devices}>
          <Icon name="people" size={16} color={Home.muted} strokeWidth={2} />
          <Text style={styles.label}>{devices}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: { gap: 10, borderRadius: Radius.card, borderLeftWidth: 4, padding: 14, backgroundColor: Home.panel },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18, lineHeight: 22 },
  dot: { width: 9, height: 9, borderRadius: 5, marginLeft: 4 },
  state: { color: Home.muted, fontFamily: font(600), fontSize: 14, lineHeight: 18, flexShrink: 1 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0 },
  value: { color: Colors.text, fontFamily: font(700), fontSize: 16, lineHeight: 20 },
  label: { color: Home.muted, fontFamily: font(500), fontSize: 12.5, lineHeight: 16 },
  devices: { flexDirection: 'row', alignItems: 'center', gap: 6 },
}));
