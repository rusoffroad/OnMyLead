import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { Colors, currentScheme, font, Spacing, themedStyles, TileSurface } from '@/constants/theme';
import { activityHero, activityInk, type ActivityId } from '@/core/activities';
import { withAlpha } from '@/core/color';
import { leadLinePoints, smoothPath, startRideDetail, weekCells, type Quota } from '@/core/home';
import { showNotice } from '@/lib/confirm';
import { Gradient } from './parts';
import { t } from '@/lib/i18n';

/**
 * Join a Ride: the red hero of the 3.0 home, lifted over the map header, with the invite code box
 * right in it and a QR button (Chris 2026-11-10: "Join a Ride should be the red"). No plan pill:
 * joining is always free.
 */
export function JoinHero({
  code, onCode, onOpen, compact, tight, activity,
}: { code: string; onCode: (c: string) => void; onOpen: () => void; compact?: boolean; tight?: boolean; activity?: ActivityId }) {
  const ready = code.trim().length >= 4;
  // Activities (4.0): the card wears the activity's colour; Offroad (and the flag off) keeps the red.
  const hue = activity ? activityHero(activity) : null;
  return (
    <View style={[styles.hero, compact && styles.heroCompact, hue && { borderColor: hue.edge }]}>
      <Gradient colors={hue ? [hue.top, hue.bottom] : ['#EC2E36', '#D7222A']} radius={22} />
      <View style={styles.heroTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.heroTitle, tight && styles.heroTitleTight]} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {t('Join a Ride')}
          </Text>
          <Text style={styles.heroHelp}>{t('Enter the code from your ride leader.')}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Scan a Ride QR Code')}
          hitSlop={6}
          onPress={() => showNotice(t('Scan a Ride QR Code'), t('Point your phone’s camera at the ride’s QR code. It opens the ride right here in OnMyLead.'))}
          style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.75 }]}>
          <Icon name="qr" size={22} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>
      <View style={styles.codeRow}>
        <TextBox
          value={code}
          onChangeText={onCode}
          onSubmitEditing={onOpen}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          placeholder="7F3A 9C21"
          placeholderTextColor="rgba(255,255,255,0.6)"
          selectionColor="#fff"
          accessibilityLabel={t('Got a code from the leader? Type it here.')}
          style={[styles.codeInput, compact && styles.codeCompact, tight && styles.codeTight, hue && { backgroundColor: hue.well }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Join with this code')}
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={onOpen}
          style={({ pressed }) => [styles.codeGo, compact && styles.codeCompact, tight && styles.codeTight, { opacity: ready ? (pressed ? 0.85 : 1) : 0.6 }]}>
          <Text style={[styles.codeGoText, hue && { color: hue.joinText }]}>{t('Join')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Create a Ride and Events and Group Rides, side by side under Join (approved mock v4; renamed in
 * 3.1). Create shows how many rides a Free rider has left (and opens Pro when they're out); the
 * other opens rallies, ride weekends and public group rides near you. 4.0 (Chris 2026-11-18):
 * "Start a Ride" became "Create a Ride", and both titles get two lines at the same size (the
 * one-line title used to shrink to fit, so it looked smaller than Events).
 */
export function ActionTiles({
  quota, onStart, compact, tight, createLine, eventsLine, activity,
}: { quota: Quota | null; onStart: () => void; compact?: boolean; tight?: boolean; createLine?: string; eventsLine?: string; activity?: ActivityId }) {
  // An activity's own line (Road Trip: "Lead the convoy") shows when the plan has no count to show.
  const detail = createLine && (!quota || quota.tone === 'pro') ? createLine : startRideDetail(quota);
  return (
    <View style={[styles.pair, compact && { gap: tight ? 8 : 10 }]}>
      <Tile icon="flag" tone="red" activity={activity} title={t('Create a Ride')} detail={detail} compact={compact} tight={tight} onPress={quota?.tone === 'out' ? () => router.push('/pro') : onStart} />
      <Tile icon="calendar" tone="gold" title={t('Events and Group Rides')} detail={eventsLine ?? t('Rallies and rides')} compact={compact} tight={tight} onPress={() => router.push('/events')} />
    </View>
  );
}

/**
 * One of the two action tiles (3.1 restyle, Chris 2026-11-16: the old tile had a big empty middle,
 * a lone icon up top and the words squeezed into the bottom). Built like the Map Mode card above
 * it: a small icon and line in the tile's colour, the big title under it, and along the bottom a
 * little picture that runs into a round go button. Start a Ride draws riders following a red lead
 * line; Events and Group Rides draws a week of calendar days with one marked.
 */
function Tile({
  icon, title, detail, onPress, tone, compact, tight, activity,
}: { icon: IconName; title: string; detail: string; onPress: () => void; tone: 'red' | 'gold'; compact?: boolean; tight?: boolean; activity?: ActivityId }) {
  const red = tone === 'red';
  // Create a Ride's red line and edge take the activity's colour (Offroad: today's red).
  const ink = red ? (activity ? activityInk(activity, currentScheme(), '#FF5A60') : '#FF5A60') : Colors.gold;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, compact && styles.tileCompact, { borderColor: withAlpha(ink, 0.55), transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Gradient colors={[withAlpha(ink, red ? 0.2 : 0.15), withAlpha(ink, 0.03)]} angle="diagonal" radius={20} overlay />
      <View>
        <View style={styles.tileKicker}>
          <Icon name={icon} size={15} color={ink} strokeWidth={2.2} />
          <Text style={[styles.tileDetail, { color: ink }]} numberOfLines={1}>{detail}</Text>
        </View>
        <Text style={[styles.tileTitle, tight && styles.tileTitleTight]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
      </View>
      <View style={styles.tileFoot}>
        <TileArt tone={tone} ink={ink} />
        <View style={[styles.tileGo, { backgroundColor: red ? Colors.accent : ink }]}>
          <Icon name="chevron" size={18} color={red ? '#fff' : '#1D1606'} strokeWidth={2.6} />
        </View>
      </View>
    </Pressable>
  );
}

const ART_H = 40;

/**
 * The little picture along the bottom of a tile, drawn to the width it's given (measured, not
 * "100%": see Gradient in ./parts). It is decoration, so screen readers skip it.
 */
function TileArt({ tone, ink }: { tone: 'red' | 'gold'; ink: string }) {
  const [w, setW] = useState(0);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.tileArt}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      {w > 0 ? (
        <Svg width={w} height={ART_H} viewBox={`0 0 ${w} ${ART_H}`}>
          {tone === 'red' ? <LeadLine w={w} ink={ink} /> : <WeekDays w={w} ink={ink} />}
        </Svg>
      ) : null}
    </View>
  );
}

/** Riders strung out along a trail that ends at the go button: the leader's line. */
function LeadLine({ w, ink }: { w: number; ink: string }) {
  const pts = leadLinePoints(w, ART_H);
  return (
    <>
      <Defs>
        <LinearGradient id="tileLead" x1="0" y1="0" x2="1" y2="0">
          <Stop offset={0} stopColor={ink} stopOpacity={0} />
          <Stop offset={0.35} stopColor={ink} stopOpacity={0.55} />
          <Stop offset={1} stopColor={ink} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Path d={smoothPath(pts)} stroke="url(#tileLead)" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      {pts.slice(1, -1).map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4.5} fill={Colors.textSecondary} stroke={Colors.backgroundElement} strokeWidth={2} opacity={0.55 + i * 0.2} />
      ))}
    </>
  );
}

/** A week of calendar days with one marked, leading to the go button. */
function WeekDays({ w, ink }: { w: number; ink: string }) {
  const cells = weekCells(w, ART_H);
  return (
    <>
      {cells.map((c, i) => {
        const on = i === cells.length - 2;
        return (
          <G key={i} opacity={on ? 1 : 0.3 + (i / cells.length) * 0.5}>
            <Rect x={c.x} y={c.y} width={c.w} height={c.h} rx={5} fill={on ? ink : withAlpha(ink, 0.1)} stroke={ink} strokeWidth={on ? 0 : 1.2} />
            <Rect x={c.x + 4} y={c.y + 5} width={c.w - 8} height={2} rx={1} fill={on ? '#1D1606' : ink} opacity={on ? 0.75 : 0.9} />
            {on ? <Circle cx={c.x + c.w / 2} cy={c.y + c.h - 8} r={2.6} fill="#1D1606" opacity={0.8} /> : null}
          </G>
        );
      })}
    </>
  );
}

const styles = themedStyles(() => ({
  hero: {
    borderRadius: 22, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18, overflow: 'hidden', gap: 16,
    borderWidth: 1.5, borderColor: 'rgba(255,175,175,0.6)', boxShadow: '0px 20px 40px -12px rgba(0, 0, 0, 0.6)',
  },
  heroCompact: { paddingTop: 14, paddingBottom: 14, gap: 12 },
  codeCompact: { minHeight: 50 },
  codeTight: { minHeight: 46 },
  heroTitleTight: { fontSize: 33, lineHeight: 35 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  heroTitle: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 38, lineHeight: 40 },
  heroHelp: { color: 'rgba(255,255,255,0.85)', fontFamily: font(500), fontSize: 14.5, lineHeight: 20, marginTop: 4 },
  scanBtn: {
    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  codeRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
  codeInput: {
    flex: 1, minWidth: 0, minHeight: 54, borderRadius: 14, paddingHorizontal: 16, color: '#fff', fontFamily: font(600), fontSize: 18, letterSpacing: 2.5,
    backgroundColor: 'rgba(60,0,4,0.32)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  codeGo: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 24, minHeight: 54, justifyContent: 'center' },
  codeGoText: { color: '#B81C23', fontFamily: font(700), fontSize: 17 },
  pair: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  tile: { flex: 1, minHeight: 150, borderRadius: 20, padding: 16, overflow: 'hidden', justifyContent: 'space-between', gap: 14, ...TileSurface },
  tileCompact: { minHeight: 0, padding: 14, gap: 6 },
  tileTitleTight: { fontSize: 24, lineHeight: 25 },
  tileKicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileDetail: { flexShrink: 1, fontFamily: font(600), fontSize: 13.5, lineHeight: 18 },
  tileTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 26, lineHeight: 28, marginTop: 4 },
  tileFoot: { flexDirection: 'row', alignItems: 'center' },
  tileArt: { flex: 1, minWidth: 0, height: ART_H },
  tileGo: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 6px 14px -6px rgba(0, 0, 0, 0.6)' },
}));
