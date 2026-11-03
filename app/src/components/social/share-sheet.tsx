import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BadgePatch } from '@/components/badge-patch';
import { BottomSheet } from '@/components/bottom-sheet';
import { RiderPhoto } from '@/components/rider-photo';
import { Button, ErrorText } from '@/components/ui';
import { Colors, font } from '@/constants/theme';
import { shareHeadline, shareSubline, shareText, type SocialItem } from '@/core/social';
import { shareActivity, shareActivityText } from '@/lib/share-activity';
import { Home, Initial, faceColor } from '../home/parts';

const wordmark = require('../../../assets/images/logo-wordmark.png');
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://onmylead.com').replace(/\/+$/, '') || 'https://onmylead.com';

// data-share attributes on the website, so the browser can draw the same card on a canvas.
const tagged = (k: string) => ({ dataSet: { share: k } }) as object;

/**
 * The picture that goes to Facebook, Instagram or X: a 4:5 card (Instagram's portrait size) with
 * the rider, the big number or name, one line under it, and onmylead.com. Never a map or a place
 * more exact than the ride or trail name.
 */
export function ShareCard({ item }: { item: SocialItem }) {
  return (
    <View style={styles.card}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 500" preserveAspectRatio="none">
        <Path d="M-10 310 C 120 250, 220 380, 410 260" stroke={Colors.accent} strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.9} />
      </Svg>
      {item.photoUrl ? <Image source={{ uri: item.photoUrl }} contentFit="cover" style={[StyleSheet.absoluteFill, { opacity: 0.38 }]} /> : null}
      <View style={styles.top}>
        <RiderPhoto userId={item.actorId} size={44} zoom={false} fallback={<Initial name={item.actorName} size={44} color={faceColor(item.actorId)} />} />
        <Text style={styles.name} {...tagged('name')}>{item.actorName}</Text>
      </View>
      <View style={styles.middle}>
        {item.badge ? <BadgePatch badge={item.badge.badge} level={item.badge.level} size={84} /> : null}
        <Text style={styles.headline} numberOfLines={3} adjustsFontSizeToFit {...tagged('headline')}>{shareHeadline(item)}</Text>
        <Text style={styles.sub} numberOfLines={4} {...tagged('sub')}>{shareSubline(item)}</Text>
      </View>
      <View style={styles.bottom}>
        <Text style={styles.url}>onmylead.com</Text>
        <Image source={wordmark} contentFit="contain" style={styles.logo} accessibilityLabel="OnMyLead" />
      </View>
    </View>
  );
}

/**
 * Share to Other Apps: a preview of the card, then the phone's share sheet (Facebook, Instagram,
 * X, Messages, anything installed). Share Text Only sends the caption and link without a picture.
 */
export function ShareSheet({ item, onClose }: { item: SocialItem | null; onClose: () => void }) {
  const card = useRef<View>(null);
  const [busy, setBusy] = useState<'image' | 'text' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = item ? shareText(item, WEB_URL) : '';

  const run = async (how: 'image' | 'text') => {
    if (!item) return;
    setBusy(how);
    setError(null);
    setNote(null);
    try {
      const msg = how === 'image' ? await shareActivity(card, text, item.kind) : await shareActivityText(text, item.kind);
      setNote(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t share. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet
      visible={!!item}
      onClose={() => {
        setNote(null);
        setError(null);
        onClose();
      }}
      title="Share to Other Apps"
      footer={
        <View style={{ gap: 8 }}>
          <Button title="Share Picture" loading={busy === 'image'} disabled={!!busy} onPress={() => run('image')} />
          <Button title="Share Text Only" kind="secondary" loading={busy === 'text'} disabled={!!busy} onPress={() => run('text')} />
        </View>
      }>
      {item ? (
        <View style={{ gap: 14 }}>
          <View ref={card} collapsable={false} style={styles.cardWrap}>
            <ShareCard item={item} />
          </View>
          <Text style={styles.caption}>{text}</Text>
          <Text style={styles.hint}>Pick Facebook, Instagram, X or any app on the next screen. Your location is never in a share.</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <ErrorText error={error} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  cardWrap: { alignSelf: 'center', width: 288, height: 360, borderRadius: 18, overflow: 'hidden' },
  card: { flex: 1, backgroundColor: '#0D1E38', padding: 22, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: '#C9D3E1', fontFamily: font(600), fontSize: 16, flexShrink: 1 },
  middle: { gap: 6 },
  headline: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 52, lineHeight: 52 },
  sub: { color: '#C9D3E1', fontFamily: font(500), fontSize: 16, lineHeight: 21 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  url: { color: Colors.text, fontFamily: font(700), fontSize: 14 },
  logo: { width: 92, height: 30 },
  caption: { color: Colors.text, fontFamily: font(500), fontSize: 14, lineHeight: 20, backgroundColor: Home.panel2, borderRadius: 12, padding: 12 },
  hint: { color: Home.muted, fontFamily: font(500), fontSize: 12, lineHeight: 17 },
  note: { color: '#3CC36B', fontFamily: font(700), fontSize: 13 },
});
