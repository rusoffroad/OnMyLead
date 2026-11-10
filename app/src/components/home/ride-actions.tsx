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
 * Start a Ride and Events, side by side under Join (approved mock v4). Start shows how many rides
 * a Free rider has left (and opens Pro when they're out); Events opens rallies and ride weekends.
 */
export function ActionTiles({ quota, onStart }: { quota: Quota | null; onStart: () => void }) {
  const detail = startRideDetail(quota);
  return (
    <View style={styles.pair}>
      <Tile icon="flag" tone="red" title={t('Start a Ride')} detail={detail} onPress={quota?.tone === 'out' ? () => router.push('/pro') : onStart} />
      <Tile icon="calendar" tone="gold" title={t('Events')} detail={t('Rallies and weekends')} onPress={() => router.push('/events')} />
    </View>
  );
}

/** One of the two action tiles: an icon chip on top, a condensed title and one line at the bottom. */
function Tile({
  icon, title, detail, onPress, tone,
}: { icon: IconName; title: string; detail: string; onPress: () => void; tone: 'red' | 'gold' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={[styles.tileIcon, tone === 'red' ? styles.tileIconRed : styles.tileIconGold]}>
        <Icon name={icon} size={21} color={tone === 'red' ? '#FF4A51' : Colors.gold} strokeWidth={2.1} />
      </View>
      <View>
        <Text style={styles.tileTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
        <Text style={styles.tileDetail} numberOfLines={1}>{detail}</Text>
      </View>
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
  tile: { flex: 1, minHeight: 132, borderRadius: 20, padding: 16, overflow: 'hidden', justifyContent: 'space-between', ...TileSurface },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  tileIconRed: { backgroundColor: 'rgba(229,38,46,0.14)' },
  tileIconGold: { backgroundColor: withAlpha(Colors.gold, 0.14) },
  tileTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 24, lineHeight: 26, marginTop: Spacing.three },
  tileDetail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13.5, lineHeight: 18, marginTop: 2 },
}));
