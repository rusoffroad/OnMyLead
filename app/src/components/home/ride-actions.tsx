import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { JOIN_QUOTA, type Quota } from '@/core/home';
import { Gradient, Home, Pill } from './parts';

/** Faint contour lines in the corner of the red cards: trail-map texture, not decoration for its own sake. */
function Topo({ size = 220 }: { size?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: -40, top: -30, opacity: 0.16 }}>
      <Svg width={size} height={size} viewBox="0 0 200 200" fill="none" stroke="#fff" strokeWidth={1.4}>
        <Path d="M20 120c30-40 60-50 90-40s50 0 70-30" />
        <Path d="M10 140c35-45 70-55 100-45s55 2 80-32" />
        <Path d="M30 100c25-32 50-42 78-34s44-2 62-26" />
        <Path d="M45 82c20-24 40-31 62-25s36-3 50-20" />
        <Path d="M0 162c40-50 80-60 112-50s60 4 88-34" />
        <Path d="M62 66c14-16 28-21 44-17s26-3 36-14" />
      </Svg>
    </View>
  );
}

/** Join a Ride: the big red card at the top, with the invite code box right in it. */
export function JoinHero({ code, onCode, onOpen }: { code: string; onCode: (c: string) => void; onOpen: () => void }) {
  const ready = code.trim().length >= 4;
  return (
    <View style={styles.hero}>
      <Gradient colors={['#F0323A', '#C41820', '#9E1218']} angle="diagonal" radius={28} />
      <Topo />
      <View style={styles.heroTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle} accessibilityRole="header">Join a Ride</Text>
          <Text style={styles.heroDetail}>Got a code from the leader? Type it here.</Text>
        </View>
        <Pill text={JOIN_QUOTA.text} tone="onRed" />
      </View>
      <View style={styles.codeBox}>
        <TextBox
          value={code}
          onChangeText={onCode}
          onSubmitEditing={onOpen}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          placeholder="Invite code, e.g. 7F3A9C21"
          placeholderTextColor="rgba(255,255,255,0.62)"
          selectionColor="#fff"
          accessibilityLabel="Invite code"
          style={styles.codeInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Join with this code"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={onOpen}
          style={({ pressed }) => [styles.codeGo, { opacity: ready ? (pressed ? 0.85 : 1) : 0.55 }]}>
          <Text style={styles.codeGoText}>Join</Text>
        </Pressable>
      </View>
      <Text style={styles.scan}>Or open the ride link or QR code with your camera.</Text>
    </View>
  );
}

/** Create a Ride and Find a Ride, side by side under Join. */
export function ActionTiles({
  quota, findText, findOn, onCreate, onFind,
}: {
  quota: Quota | null;
  findText: string | null;
  findOn: boolean;
  onCreate: () => void;
  onFind: () => void;
}) {
  return (
    <View style={styles.pair}>
      <Tile
        accent
        icon="flag"
        title="Create a Ride"
        detail="You lead. Public or friends only."
        onPress={onCreate}
        pill={quota ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={quota.upgrade ? `${quota.text}. See Pro for unlimited rides` : `${quota.text} rides with Pro`}
            disabled={!quota.upgrade}
            hitSlop={8}
            onPress={() => router.push('/pro')}>
            <Pill text={quota.text} tone={quota.tone === 'pro' ? 'gold' : quota.tone === 'out' ? 'out' : 'plain'} />
          </Pressable>
        ) : null}
      />
      {findOn ? (
        <Tile icon="search" title="Find a Ride" detail="Near you or by state" onPress={onFind} pill={findText ? <Pill text={findText} /> : null} />
      ) : null}
    </View>
  );
}

/**
 * One half of the Create / Find pair. Both are the same dark card (Join a Ride above is the one
 * red card); Create gets red only as an accent: its icon chip and a thin red edge along the top.
 * Icon, title and detail line up across the pair, and the pill always sits on the card's bottom
 * edge, so the two cards read as one even row whatever the text wraps to.
 */
function Tile({
  icon, title, detail, onPress, pill, accent,
}: { icon: IconName; title: string; detail: string; onPress: () => void; pill: React.ReactNode; accent?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Gradient colors={[Home.panel2, Home.panel]} radius={22} />
      {accent ? <View style={styles.accentEdge} /> : null}
      <View style={[styles.tileIcon, accent && styles.tileIconRed]}>
        <Icon name={icon} size={22} color={accent ? Colors.accent : '#fff'} strokeWidth={2.4} />
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
        <Text style={styles.tileDetail} numberOfLines={2}>{detail}</Text>
      </View>
      {pill ? <View style={styles.tilePill}>{pill}</View> : null}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  hero: { borderRadius: 28, padding: 22, overflow: 'hidden', gap: Spacing.three },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  heroTitle: { color: '#fff', fontFamily: font(800, 'display'), fontSize: 44, lineHeight: 44 },
  heroDetail: { color: 'rgba(255,255,255,0.84)', fontFamily: font(500), fontSize: 15, lineHeight: 20, marginTop: 6 },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(0,0,0,0.22)', paddingLeft: 14, padding: 6,
  },
  codeInput: { flex: 1, minWidth: 0, minHeight: 44, color: '#fff', fontFamily: font(600), fontSize: 17, letterSpacing: 1.5 },
  codeGo: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
  codeGoText: { color: '#B3161D', fontFamily: font(700, 'display'), fontSize: 19 },
  scan: { color: 'rgba(255,255,255,0.75)', fontFamily: font(500), fontSize: 13, marginTop: -6 },
  pair: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  tile: {
    flex: 1, minHeight: 168, borderRadius: 22, padding: 16, overflow: 'hidden', gap: 14,
    borderWidth: 1, borderColor: Home.line, backgroundColor: Home.panel,
  },
  accentEdge: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: Colors.accent },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  tileIconRed: { backgroundColor: 'rgba(229,38,46,0.14)', borderWidth: 1, borderColor: 'rgba(229,38,46,0.38)' },
  tileBody: { gap: 4 },
  tileTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 26, lineHeight: 28 },
  tileDetail: { color: Home.muted, fontFamily: font(500), fontSize: 13, lineHeight: 17, minHeight: 34 },
  tilePill: { marginTop: 'auto', flexDirection: 'row' },
}));
