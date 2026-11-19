import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ProTag } from '@/components/pro-tag';
import { SpotPinArt } from '@/components/spot-pin';
import { font, themedStyles } from '@/constants/theme';
import { activityHero, type ActivityId } from '@/core/activities';
import { staticMapUrl } from '@/core/home';
import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';
import { MAPBOX_TOKEN } from '@/lib/terrain';
import { Gradient } from './parts';

/** The card's picture: Hidden Falls Adventure Park from above (a fixed spot, so it's the same for everyone and cached). */
const PICTURE_AT = { lat: 30.6079, lng: -98.1582 };
const PICTURE = staticMapUrl(PICTURE_AT, MAPBOX_TOKEN, 360, 140, 13.2);
/** Once a rider has opened Places to Ride from Home, the New tag goes. */
const SEEN_KEY = 'places.seen.v1';
const RED = '#E5262E';
const PANEL = 'rgba(18,27,42,';

/**
 * Places to Ride on Home (4.0, approved mock v3, Chris 2026-11-18): its own card under Create a
 * Ride and Events. Satellite ground on the right with a few pins in the kinds' colours, the words
 * on the left, and the red go button. Opens /places (Scout on a page of its own). Shows only while
 * the scout flag is on.
 */
export function PlacesCard({ compact, tight, line, activity }: { compact?: boolean; tight?: boolean; line?: string; activity?: ActivityId }) {
  // Activities (4.0): the go button wears the activity's colour; Offroad keeps the red.
  const hue = activity ? activityHero(activity) : null;
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => setFresh(!v)).catch(() => {});
  }, []);
  const open = () => {
    if (fresh) {
      setFresh(false);
      AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    }
    track('home_places_opened');
    router.push('/places');
  };
  const sub = line ?? t('Parks, forests and trails near you.');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('Places to Ride')}. ${sub}`}
      onPress={open}
      style={({ pressed }) => [styles.card, compact && styles.cardCompact, tight && styles.cardTight, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      {PICTURE ? (
        <Image source={{ uri: PICTURE }} style={styles.picture} contentFit="cover" cachePolicy="disk" accessible={false} />
      ) : null}
      <Gradient colors={[`${PANEL}1)`, `${PANEL}0.92)`, `${PANEL}0.35)`]} angle="across" overlay />
      <View pointerEvents="none" style={styles.pins} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={[styles.pin, { right: 118, top: 14 }]}><SpotPinArt kind="park" scale={0.62} /></View>
        <View style={[styles.pin, { right: 74, top: 40 }]}><SpotPinArt kind="trail_system" scale={0.56} /></View>
        <View style={[styles.pin, { right: 30, top: 10 }]}><SpotPinArt kind="ohv_area" scale={0.56} /></View>
      </View>
      <View style={styles.words}>
        <View style={styles.kicker}>
          <Icon name="pin" size={15} color="#F27A74" strokeWidth={2.2} />
          <Text style={styles.kickerText} numberOfLines={1}>{t('Find somewhere new')}</Text>
          {fresh ? <Text style={styles.newTag}>{t('New')}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.title, tight && styles.titleTight, { flexShrink: 1 }]} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('Places to Ride')}</Text>
          <ProTag feature="places" />
        </View>
        <Text style={styles.sub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{sub}</Text>
      </View>
      <View style={[styles.go, hue && { backgroundColor: hue.top, boxShadow: `0px 0px 0px 3px ${hue.edge}` }]}>
        <Icon name="chevron" size={20} color="#fff" strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: {
    minHeight: 132, borderRadius: 22, overflow: 'hidden', padding: 16, justifyContent: 'center', backgroundColor: '#121B2A',
    borderWidth: 1.5, borderColor: 'rgba(120,140,175,0.45)', boxShadow: '0px 18px 36px -14px rgba(0, 0, 0, 0.7)',
  },
  cardCompact: { minHeight: 114, paddingVertical: 12, paddingHorizontal: 14 },
  cardTight: { minHeight: 100, paddingVertical: 10 },
  titleTight: { fontSize: 30, lineHeight: 33 },
  picture: { position: 'absolute', top: 0, bottom: 0, right: 0, left: '38%' },
  pins: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  pin: { position: 'absolute' },
  words: { maxWidth: '72%', paddingRight: 4 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerText: { color: '#F27A74', fontFamily: font(600), fontSize: 13.5, flexShrink: 1 },
  newTag: {
    color: '#fff', backgroundColor: RED, fontFamily: font(700), fontSize: 11.5, lineHeight: 16, paddingHorizontal: 6,
    borderRadius: 6, overflow: 'hidden', marginLeft: 2,
  },
  title: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 34, lineHeight: 38, marginTop: 2 },
  sub: { color: '#C9D6DE', fontFamily: font(500), fontSize: 14, lineHeight: 19, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  go: {
    position: 'absolute', right: 14, bottom: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: RED,
    alignItems: 'center', justifyContent: 'center', boxShadow: '0px 0px 0px 3px rgba(229,38,46,0.25)',
  },
}));
