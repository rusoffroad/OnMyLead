import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Cover, DateStub } from '@/components/events/parts';
import { Icon } from '@/components/icon';
import { Colors, font, RideColors, themedStyles, TileSurface } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import { eventDates, sortCards, type EventCard } from '@/core/events';
import { myEvents, upcomingEvents } from '@/lib/events';
import { positionIfAllowed } from '@/lib/location';
import { Gradient, homeStyles } from './parts';
import { t } from '@/lib/i18n';

/**
 * Up Next on the 3.0 home: your next event (one you host or are going to), else the next public
 * one near you, as a photo card with its date, name and who's going; it opens the event. With no
 * event coming up, one quiet row opens the Events area. Never asks for location; with it, nearby
 * events count first.
 */
export function EventsCard({ signedIn, radius }: { signedIn: boolean; radius: number | null }) {
  const [next, setNext] = useState<{ e: EventCard; yours: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (radius == null) return;
      let gone = false;
      (async () => {
        const at = await positionIfAllowed().catch(() => null);
        const [mine, near] = await Promise.all([
          signedIn ? myEvents().catch(() => []) : Promise.resolve([] as EventCard[]),
          upcomingEvents(at, at && radius ? radius : null),
        ]);
        if (gone) return;
        const yours = sortCards(mine).find((e) => Date.parse(e.ends_at) >= Date.now() && e.status === 'scheduled');
        setNext(yours ? { e: yours, yours: true } : near[0] ? { e: near[0], yours: false } : null);
      })().catch(() => {});
      return () => {
        gone = true;
      };
    }, [signedIn, radius]),
  );

  const label = next
    ? t(next.yours ? 'Your next event: {event}. Open Events' : 'Next event: {event}. Open Events', { event: `${next.e.title}, ${eventDates(next.e.starts_at, next.e.ends_at)}` })
    : t('Events: rallies, poker runs and ride weekends. Open Events');

  // No event coming up: one quiet row that says what Events are and opens them.
  if (!next) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push('/events')}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}>
        <View style={styles.icon}><Icon name="calendar" size={22} color={Colors.text} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={homeStyles.cardTitle}>{t('Events')}</Text>
          <Text style={styles.tagline} numberOfLines={1}>{t('Rallies, poker runs and ride weekends')}</Text>
        </View>
        <Icon name="chevron" size={18} color={Colors.textSecondary} />
      </Pressable>
    );
  }

  // The next event as a photo card: date, the Event tag, its name over the cover, then who's going.
  const e = next.e;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(`/e/${e.share_code}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View>
        <Cover path={e.cover_path} seed={e.id} height={196} />
        <Gradient colors={['rgba(10,16,25,0)', 'rgba(10,16,25,0)', 'rgba(10,16,25,0.92)']} />
        <DateStub iso={e.starts_at} size="sm" style={styles.stub} />
        <View style={styles.kind}>
          <Icon name="calendar" size={14} color="#fff" strokeWidth={2.2} />
          <Text style={styles.kindText}>{t('Event')}</Text>
        </View>
        <View style={styles.over}>
          <Text style={styles.title} numberOfLines={2}>{e.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{`${eventDates(e.starts_at, e.ends_at)}. ${e.location_name}`}</Text>
        </View>
      </View>
      <View style={styles.bar}>
        <Text style={styles.going} numberOfLines={1}>
          {e.going === 1 ? t('{n} Rider Going', { n: 1 }) : t('{n} Riders Going', { n: e.going })}
          {e.rides ? <Text style={styles.rides}>{`   ${t('Group Rides')}: ${e.rides}`}</Text> : null}
        </Text>
        {e.mine ? (
          <View style={[styles.mine, e.mine === 'going' ? styles.mineGoing : null]}>
            {e.mine === 'going' ? <Icon name="check" size={14} color={RideColors.green} strokeWidth={2.6} /> : null}
            <Text style={[styles.mineText, e.mine === 'going' ? { color: RideColors.green } : null]}>{t(e.mine === 'going' ? 'Going' : 'Interested')}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, ...TileSurface },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
  tagline: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13.5, lineHeight: 18, marginTop: 2 },
  card: { borderRadius: 22, overflow: 'hidden', ...TileSurface },
  stub: { position: 'absolute', top: 14, left: 14 },
  kind: {
    position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 12, backgroundColor: 'rgba(10,16,25,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  kindText: { color: '#fff', fontFamily: font(600), fontSize: 13 },
  over: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  title: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 30, lineHeight: 32 },
  sub: { color: '#D3DAE3', fontFamily: font(500), fontSize: 14, lineHeight: 19, marginTop: 2 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  going: { flex: 1, color: Colors.text, fontFamily: font(600), fontSize: 14.5 },
  rides: { color: Colors.textSecondary, fontFamily: font(500) },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: Colors.backgroundSelected },
  mineGoing: { backgroundColor: withAlpha(RideColors.green, 0.14) },
  mineText: { color: Colors.text, fontFamily: font(600), fontSize: 13.5 },
}));
