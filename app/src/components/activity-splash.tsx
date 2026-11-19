import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { font } from '@/constants/theme';
import { activityById, type ActivityId } from '@/core/activities';
import { t as tr, tx } from '@/lib/i18n';
import { dismissSplash, getSplash, subscribeSplash } from '@/lib/activity';

/**
 * The quick splash when the rider switches activity (4.0, Chris 2026-11-19: "a quick splash screen
 * of that activity"). A drawn scene of the activity, about a second and a half: the vehicle drives
 * in, the name and a line about it sit at the bottom. A tap skips it; with Reduce Motion on it only
 * fades. The art is the app's own (the same vehicle drawings as the activity chips), so nothing is
 * licensed. It lives outside the screens, so the redraw in the new colours doesn't cut it short.
 */

export const SPLASH_MS = 1500;

type Scene = { sky: [string, string]; ink: string; line: string };
const SCENES: Record<ActivityId, Scene> = {
  snowmobile: { sky: ['#5FB0F5', '#CFE9FF'], ink: '#0A1B2E', line: tx('Sled trails, snow depth and avalanche danger') },
  motorcycle: { sky: ['#1B0E08', '#DD5A14'], ink: '#FFFFFF', line: tx('Twisty roads, loops and stops') },
  road_trip: { sky: ['#F7D98A', '#E8B23A'], ink: '#1E1607', line: tx('Scenic byways, campgrounds and stops') },
  offroad: { sky: ['#0B1422', '#E5262E'], ink: '#FFFFFF', line: tx('Trails, recording and offline maps') },
};

function Ground({ id }: { id: ActivityId }) {
  switch (id) {
    case 'snowmobile':
      return (
        <>
          <Path d="M0 330 L60 250 L110 300 L170 200 L268 310 V536 H0z" fill="#E9F4FF" />
          <Path d="M170 200 L190 228 L178 226 L170 240 L160 225 L150 228z" fill="#fff" />
          <Path d="M0 400 Q90 360 268 395 V536 H0z" fill="#FFFFFF" />
          <Path d="M0 452 Q120 420 268 448" stroke="#B9DAF5" strokeWidth={3} fill="none" />
          <G fill="#fff" opacity={0.9}>
            {[[30, 60, 2.4], [90, 130, 1.8], [150, 40, 2.6], [210, 110, 2], [250, 170, 1.6], [120, 200, 2.2], [60, 180, 1.8], [190, 230, 2.1]].map(([x, y, r]) => (
              <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
            ))}
          </G>
        </>
      );
    case 'motorcycle':
      return (
        <>
          <Circle cx={200} cy={230} r={46} fill="#FFB07A" opacity={0.85} />
          <Path d="M0 300 L80 230 L140 280 L210 210 L268 260 V536 H0z" fill="#5A2410" />
          <Path d="M0 360 L268 330 V536 H0z" fill="#2A120A" />
          <Path d="M-10 520 C60 470 20 430 110 420 S190 380 150 350 S230 320 280 330" stroke="#1A1A1A" strokeWidth={22} fill="none" strokeLinecap="round" />
          <Path d="M-10 520 C60 470 20 430 110 420 S190 380 150 350 S230 320 280 330" stroke="#FFCF6B" strokeWidth={2} strokeDasharray="8 8" fill="none" />
        </>
      );
    case 'road_trip':
      return (
        <>
          <Path d="M0 290 h40 v-40 h50 v40 h20 v-70 h60 v70 h98 V536 H0z" fill="#C9862A" />
          <Path d="M0 330 H268 V536 H0z" fill="#B87322" />
          <Path d="M200 330 L150 536 H268 V470z" fill="#3A2C18" />
          <Path d="M199 340 l-2 18 M195 372 l-3 24 M190 412 l-4 32 M184 462 l-5 40" stroke="#F7D98A" strokeWidth={4} />
        </>
      );
    default:
      return (
        <>
          <Path d="M0 320 L70 240 L120 290 L190 190 L268 300 V536 H0z" fill="#4A1416" />
          <Path d="M0 400 Q60 360 120 390 T268 370 V536 H0z" fill="#2A0C0E" />
          <Path d="M120 400 l30-22 26 10 30-26 40 6" stroke="#E6C27A" strokeWidth={5} fill="none" strokeLinecap="round" />
        </>
      );
  }
}

function Vehicle({ id }: { id: ActivityId }) {
  const common = { fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (id) {
    case 'snowmobile':
      return (
        <G {...common} stroke="#0A1B2E" strokeWidth={1.6}>
          <Path d="M2 19.5h15c1.6 0 2.6-.8 3.6-2.2" />
          <Path d="M4 15.5h10.8l3.2-3.4-2.4-2.6H10L7.6 12H4z" fill="#2A72BD" />
          <Path d="M13.6 9.5l1.6-3.2h2.6" />
          <Path d="M7.5 15.5v4" />
          <Path d="M13 15.5v4" />
        </G>
      );
    case 'motorcycle':
      return (
        <G {...common} stroke="#FFFFFF">
          <Path d="M1.5 16.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0" />
          <Path d="M15.5 16.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0" />
          <Path d="M5 16.5l3.8-6h5.4l1.8 3H12l-2.5 3" />
          <Path d="M19 16.5l-3.2-6.3 1.4-3.2h2.3" />
        </G>
      );
    case 'road_trip':
      return (
        <G {...common} stroke="#1E1607">
          <Path d="M2.5 16V12.5L5.2 7.5h10.3l3.5 5H21.5V16h-1.6" fill="#FFFFFF" />
          <Path d="M8.6 16h6.8" />
          <Path d="M3 12.5h16" />
          <Path d="M4.4 16a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0" />
          <Path d="M15.4 16a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0" />
          <Path d="M10.5 7.5v5" />
        </G>
      );
    default:
      return (
        <G {...common} stroke="#FFFFFF">
          <Path d="M2.5 19.5L9 9l3.6 5.6L15.5 11l6 8.5z" fill="#E5262E" />
          <Path d="M7.4 11.6l1.6 1.3 1.7-1.4" />
        </G>
      );
  }
}

/** Where each vehicle sits in the 268 x 536 scene. */
const VEHICLE_AT: Record<ActivityId, { x: number; y: number; s: number }> = {
  snowmobile: { x: 50, y: 250, s: 6.2 },
  motorcycle: { x: 60, y: 250, s: 5.2 },
  road_trip: { x: 110, y: 270, s: 5.4 },
  offroad: { x: 60, y: 250, s: 6 },
};

/** From the root layout, over every screen. */
export function ActivitySplash() {
  const splash = useSyncExternalStore(subscribeSplash, getSplash, getSplash);
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => {});
  }, []);
  if (!splash) return null;
  return <SplashScene key={splash.at} id={splash.id} at={splash.at} calm={calm} />;
}

function SplashScene({ id, at, calm }: { id: ActivityId; at: number; calm: boolean }) {
  const scene = SCENES[id] ?? SCENES.offroad;
  const v = VEHICLE_AT[id] ?? VEHICLE_AT.offroad;
  const name = tr(activityById(id).name);
  const line = tr(scene.line);
  // The app redraws in the new colours under it, which can remount this: carry on from `at`.
  const [left] = useState(() => Math.max(0, SPLASH_MS - (Date.now() - at)));
  const fresh = left > SPLASH_MS - 120;
  const [fade] = useState(() => new Animated.Value(fresh ? 0 : 1));
  const [drive] = useState(() => new Animated.Value(fresh && !calm ? -1 : 0));

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${name}. ${line}`);
    // Announced once per switch, not again on a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  useEffect(() => {
    const anims = [Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true })];
    if (!calm) anims.push(Animated.timing(drive, { toValue: 0, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    Animated.parallel(anims).start();
    const out = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => dismissSplash(at));
    }, Math.max(0, left - 220));
    return () => clearTimeout(out);
    // Runs once for this switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => dismissSplash(at)}
        accessibilityRole="button"
        accessibilityLabel={tr('{name}. Tap to continue.', { name })}>
        <Svg width="100%" height="100%" viewBox="0 0 268 536" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={scene.sky[0]} />
              <Stop offset="0.72" stopColor={scene.sky[1]} />
            </LinearGradient>
          </Defs>
          <Path d="M0 0H268V536H0z" fill="url(#sky)" />
          <Ground id={id} />
        </Svg>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: drive.interpolate({ inputRange: [-1, 0], outputRange: [-420, 0] }) }] },
          ]}>
          <Svg width="100%" height="100%" viewBox="0 0 268 536" preserveAspectRatio="xMidYMid slice">
            <G transform={`translate(${v.x} ${v.y}) scale(${v.s})`}>
              <Vehicle id={id} />
            </G>
          </Svg>
        </Animated.View>
        <View style={styles.words} pointerEvents="none">
          <Text style={[styles.name, { color: scene.ink }]} numberOfLines={1} adjustsFontSizeToFit>{name}</Text>
          <Text style={[styles.line, { color: scene.ink }]}>{line}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000 },
  words: { position: 'absolute', left: 24, right: 24, bottom: 56, maxWidth: 560 },
  name: { fontFamily: font(800, 'display'), fontSize: 56, lineHeight: 58 },
  line: { fontFamily: font(600), fontSize: 17, marginTop: 6, opacity: 0.92 },
});
