import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DateStub } from '@/components/events/parts';
import { Icon } from '@/components/icon';
import { Colors, font, themedStyles } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import { eventDates, sortCards, type EventCard } from '@/core/events';
import { myEvents, upcomingEvents } from '@/lib/events';
import { positionIfAllowed } from '@/lib/location';
import { Home, homeStyles, Pill } from './parts';
import { t } from '@/lib/i18n';

/**
 * Events on the home screen: a gold-edged row right under Create a Ride and Find a Ride, above
 * Map Mode (Chris 2026-11-04; gold so it stands apart from the red Join and blue Map Mode, Chris
 * 2026-11-03 "make events a little more visible"). It shows your next event (one
 * you host or are going to), else the next public one near you, and opens the Events area.
 * Never asks for location; with it, nearby events count first.
 */
export function EventsCard({ signedIn, radius }: { signedIn: boolean; radius: number | null }) {
  const [next, setNext] = useState<{ e: EventCard; yours: boolean } | null>(null);
  const [count, setCount] = useState<number | null>(null);

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
        setCount(near.length);
      })().catch(() => setCount(null));
      return () => {
        gone = true;
      };
    }, [signedIn, radius]),
  );

  const label = next
    ? t(next.yours ? 'Your next event: {event}. Open Events' : 'Next event: {event}. Open Events', { event: `${next.e.title}, ${eventDates(next.e.starts_at, next.e.ends_at)}` })
    : t('Events: rallies, poker runs and ride weekends. Open Events');

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push('/events')}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}>
      {next ? (
        <DateStub iso={next.e.starts_at} size="sm" />
      ) : (
        <View style={styles.icon}><Icon name="calendar" size={24} color={Colors.background} /></View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={styles.titleRow}>
          <Text style={homeStyles.cardTitle}>{t('Events')}</Text>
          {count ? <Pill text={count === 1 ? t('1 Coming Up') : t('{n} Coming Up', { n: count })} tone="gold" /> : null}
        </View>
        {/* One line under the title, so the card stays short: your next event, else what Events are. */}
        {next ? (
          <Text style={styles.tagline} numberOfLines={1}>
            {`${next.yours ? `${t('Yours')}: ` : `${t('Next')}: `}${next.e.title}, ${eventDates(next.e.starts_at, next.e.ends_at)}`}
          </Text>
        ) : (
          <Text style={styles.tagline} numberOfLines={1}>{t('Rallies, poker runs and ride weekends')}</Text>
        )}
      </View>
      <Icon name="chevron" size={18} color={Home.gold} />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, backgroundColor: withAlpha(Home.gold, 0.1), borderWidth: 1, borderColor: withAlpha(Home.gold, 0.5),
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Home.gold, alignItems: 'center', justifyContent: 'center' },
  tagline: { color: Home.gold, fontFamily: font(600), fontSize: 13, lineHeight: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
