import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Colors, font, themedStyles, TileSurface } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import { staticMapUrl } from '@/core/home';
import { DIFFICULTIES } from '@/core/nav-trails';
import { currentLocale, t } from '@/lib/i18n';
import { MAPBOX_TOKEN } from '@/lib/terrain';
import type { Ride } from '@/lib/types';
import { Icon } from './icon';

const THUMB = 76;

/**
 * A public ride as a 3.0 card (Rides tab, approved mock): a satellite picture of its meeting
 * area with the date on it, then the name, where and when, and tags for difficulty, distance and
 * machines. The picture is the ride's public, rounded meeting area, never the exact spot.
 */
export function RideTile({ ride, distanceMi }: { ride: Ride; distanceMi?: number }) {
  const d = new Date(ride.meet_at);
  const live = ride.status === 'live';
  const map = staticMapUrl({ lat: ride.meet_area_lat, lng: ride.meet_area_lng }, MAPBOX_TOKEN, THUMB, THUMB, 10);
  const diff = DIFFICULTIES.find((x) => x.value === ride.difficulty);
  const time = live ? t('Riding now') : d.toLocaleTimeString(currentLocale(), { hour: 'numeric', minute: '2-digit' });
  const where = [
    ride.meet_area_label,
    distanceMi != null ? t('{n} mi away', { n: distanceMi < 1 ? t('Under 1') : Math.round(distanceMi).toLocaleString(currentLocale()) }) : null,
    time,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${ride.name}. ${d.toLocaleDateString(currentLocale(), { weekday: 'long', month: 'long', day: 'numeric' })}. ${where}`}
      onPress={() => router.push(`/r/${ride.invite_code}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.thumb}>
        {map ? <Image source={{ uri: map }} style={styles.thumbImg} contentFit="cover" cachePolicy="disk" accessible={false} /> : (
          <View style={[styles.thumbImg, { alignItems: 'center', justifyContent: 'center' }]}><Icon name="map" size={26} color={Colors.textSecondary} /></View>
        )}
        <View style={[styles.date, live && { backgroundColor: Colors.accent }]}>
          {live ? <Text style={[styles.dateTop, { color: '#fff' }]}>{t('Live')}</Text> : (
            <>
              <Text style={styles.dateTop}>{d.toLocaleDateString(currentLocale(), { weekday: 'short' }).toUpperCase()}</Text>
              <Text style={styles.dateDay}>{d.getDate()}</Text>
            </>
          )}
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={2}>{ride.name}</Text>
        <Text style={styles.where} numberOfLines={2}>{where}</Text>
        <View style={styles.tags}>
          {diff ? <Text style={[styles.tag, { color: diff.value === 'hard' ? Colors.text : diff.color, backgroundColor: withAlpha(diff.value === 'hard' ? Colors.text : diff.color, 0.14) }]}>{t(diff.label)}</Text> : null}
          {ride.route_miles ? <Text style={styles.tag}>{t('{n} mi', { n: Math.round(ride.route_miles) })}</Text> : null}
          {ride.vehicle_types.length ? <Text style={styles.tag} numberOfLines={1}>{ride.vehicle_types.slice(0, 2).join(', ')}</Text> : null}
        </View>
      </View>
      <Icon name="chevron" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, ...TileSurface },
  thumb: { width: THUMB, height: THUMB, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.backgroundSelected },
  thumbImg: { width: THUMB, height: THUMB },
  date: { position: 'absolute', left: 6, top: 6, minWidth: 34, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center' },
  dateTop: { color: '#1A1D22', fontFamily: font(800), fontSize: 9.5, lineHeight: 11 },
  dateDay: { color: '#1A1D22', fontFamily: font(700, 'display'), fontSize: 17, lineHeight: 18 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 16.5, lineHeight: 21 },
  where: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13.5, lineHeight: 18, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  tag: {
    color: Colors.textSecondary, backgroundColor: Colors.backgroundSelected, fontFamily: font(700), fontSize: 12, lineHeight: 16,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden', maxWidth: 160,
  },
}));
