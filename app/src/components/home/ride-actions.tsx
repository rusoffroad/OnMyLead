import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { Colors, font, Spacing, themedStyles, TileSurface } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import { startRideDetail, type Quota } from '@/core/home';
import { showNotice } from '@/lib/confirm';
import { Gradient } from './parts';
import { t } from '@/lib/i18n';

/**
 * Join a Ride: the red hero of the 3.0 home, lifted over the map header, with the invite code box
 * right in it and a QR button (Chris 2026-11-10: "Join a Ride should be the red"). No plan pill:
 * joining is always free.
 */
export function JoinHero({ code, onCode, onOpen }: { code: string; onCode: (c: string) => void; onOpen: () => void }) {
  const ready = code.trim().length >= 4;
  return (
    <View style={styles.hero}>
      <Gradient colors={['#EC2E36', '#D7222A']} radius={22} />
      <View style={styles.heroTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
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
          style={styles.codeInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Join with this code')}
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={onOpen}
          style={({ pressed }) => [styles.codeGo, { opacity: ready ? (pressed ? 0.85 : 1) : 0.6 }]}>
          <Text style={styles.codeGoText}>{t('Join')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Start a Ride and Events and Group Rides, side by side under Join (approved mock v4; renamed in
 * 3.1). Start shows how many rides a Free rider has left (and opens Pro when they're out); the
 * other opens rallies, ride weekends and public group rides near you.
 */
export function ActionTiles({ quota, onStart }: { quota: Quota | null; onStart: () => void }) {
  const detail = startRideDetail(quota);
  return (
    <View style={styles.pair}>
      <Tile icon="flag" tone="red" title={t('Start a Ride')} detail={detail} onPress={quota?.tone === 'out' ? () => router.push('/pro') : onStart} />
      <Tile icon="calendar" tone="gold" title={t('Events and Group Rides')} lines={2} detail={t('Rallies and rides')} onPress={() => router.push('/events')} />
    </View>
  );
}

/**
 * One of the two action tiles (3.1 restyle, Chris 2026-11-16: the old tile had a big empty middle,
 * a lone icon up top and the words squeezed into the bottom). Now the icon chip and an arrow share
 * the top row, the title and line sit right under them, a soft wash of the tile's colour comes in
 * from the top-left and a large faint copy of the icon fills the bottom-right corner.
 */
function Tile({
  icon, title, detail, onPress, tone, lines = 1,
}: { icon: IconName; title: string; detail: string; onPress: () => void; tone: 'red' | 'gold'; lines?: 1 | 2 }) {
  const ink = tone === 'red' ? '#FF4A51' : Colors.gold;
  const wash = tone === 'red' ? 'rgba(229,38,46,0.2)' : withAlpha(Colors.gold, 0.16);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Gradient colors={[wash, withAlpha('#000000', 0)]} angle="diagonal" radius={20} overlay />
      <View pointerEvents="none" style={styles.tileMark}>
        <Icon name={icon} size={96} color={withAlpha(ink, 0.09)} strokeWidth={1.6} />
      </View>
      <View style={[styles.tileEdge, { backgroundColor: ink }]} />
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, tone === 'red' ? styles.tileIconRed : styles.tileIconGold]}>
          <Icon name={icon} size={20} color={ink} strokeWidth={2.1} />
        </View>
        <Icon name="chevron" size={18} color={Colors.textSecondary} strokeWidth={2.2} />
      </View>
      <Text style={styles.tileTitle} numberOfLines={lines} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
      <Text style={styles.tileDetail} numberOfLines={1}>{detail}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  hero: {
    borderRadius: 22, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18, overflow: 'hidden', gap: 16,
    borderWidth: 1.5, borderColor: 'rgba(255,175,175,0.6)', boxShadow: '0px 20px 40px -12px rgba(0, 0, 0, 0.6)',
  },
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
  tile: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, overflow: 'hidden', ...TileSurface },
  tileEdge: { position: 'absolute', top: 0, left: 16, width: 28, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  tileMark: { position: 'absolute', right: -14, bottom: -16, transform: [{ rotate: '-8deg' }] },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  tileIconRed: { backgroundColor: 'rgba(229,38,46,0.16)' },
  tileIconGold: { backgroundColor: withAlpha(Colors.gold, 0.16) },
  tileTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 24 },
  tileDetail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13.5, lineHeight: 18, marginTop: 4 },
}));
