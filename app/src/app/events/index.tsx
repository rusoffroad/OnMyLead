import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EventOrRide } from '@/components/events/event-or-ride';
import { FeaturedEvent } from '@/components/events/featured-event';
import { EventCardView } from '@/components/events/parts';
import { Icon } from '@/components/icon';
import { RadiusChip, RadiusSheet } from '@/components/home/public-rides';
import { Home, Pill } from '@/components/home/parts';
import PageHead from '@/components/page-head';
import { ThemedText } from '@/components/themed-text';
import { ErrorText, Screen, Segmented } from '@/components/ui';
import { Colors, font, Spacing, themedStyles, TileSurface } from '@/constants/theme';
import { eventPhase, EVENTS_NOT_SWITCHED_ON, sortCards, type EventCard } from '@/core/events';
import { parseRadius, RADIUS_STORAGE_KEY } from '@/core/home';
import { useLayout } from '@/hooks/use-layout';
import { useEntitlements } from '@/lib/entitlements';
import { myEvents, upcomingEvents } from '@/lib/events';
import { positionIfAllowed } from '@/lib/location';
import { requirePro } from '@/lib/pro';
import { setSyncedItem } from '@/lib/settings-sync';
import { useSession } from '@/lib/session';
import { t } from '@/lib/i18n';

type Tab = 'upcoming' | 'mine';

/**
 * The Events area: public events coming up near you (anyone, signed in or not), and the events you
 * host or said you're going to. Only Pro riders create events; everyone can see them.
 */
export default function EventsScreen() {
  const { session } = useSession();
  const { can } = useEntitlements();
  const layout = useLayout();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [upcoming, setUpcoming] = useState<EventCard[] | null>(null);
  const [mine, setMine] = useState<EventCard[] | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [located, setLocated] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same distance as Public Rides Near You on the home screen.
  useEffect(() => {
    AsyncStorage.getItem(RADIUS_STORAGE_KEY).then((v) => setRadius(parseRadius(v))).catch(() => setRadius(parseRadius(null)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (radius == null) return;
      setError(null);
      positionIfAllowed()
        .then(async (at) => {
          setLocated(!!at);
          setUpcoming(await upcomingEvents(at, radius || null));
        })
        .catch((e) => {
          setUpcoming([]);
          setError(e instanceof Error ? e.message : String(e));
        });
      if (session) myEvents().then((m) => setMine(sortCards(m))).catch(() => setMine([]));
    }, [radius, session]),
  );

  const pickRadius = (mi: number) => {
    setRadius(mi);
    setSyncedItem(RADIUS_STORAGE_KEY, String(mi)).catch(() => {});
  };

  const create = () => {
    if (!session) return router.push('/sign-in?mode=create');
    if (requirePro('create_events')) router.push('/events/new');
  };

  const list = tab === 'mine' ? mine : upcoming;
  const columns = layout.expanded ? 3 : layout.wide ? 2 : 1;
  const off = error === EVENTS_NOT_SWITCHED_ON;
  // The next event coming up leads as a full photo (3.0); the rest follow as cards.
  const featured = tab === 'upcoming' && list?.length ? list.find((e) => eventPhase(e) !== 'over' && eventPhase(e) !== 'cancelled') ?? null : null;
  const rest = list ? list.filter((e) => e !== featured) : [];

  return (
    <>
      {/* 3.0: Create sits in the header, top right, instead of a big button over the list. */}
      <Stack.Screen
        options={{
          title: t('Events'),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Create an Event')}
              hitSlop={8}
              onPress={create}
              style={({ pressed }) => [styles.create, pressed && { opacity: 0.85 }]}>
              <Icon name="plus" size={16} color={Colors.text} />
              <Text style={styles.createText}>{t('Create')}</Text>
              {session && !can('create_events') ? <Pill text="Pro" tone="gold" /> : null}
            </Pressable>
          ),
        }}
      />
      <PageHead><title>{t('Events | OnMyLead')}</title></PageHead>
      <Screen width="wide">
        <View style={{ gap: Spacing.four }}>
          {session ? (
            <Segmented<Tab>
              options={[{ value: 'upcoming', label: t('Coming Up') }, { value: 'mine', label: t('Yours{v}', { v: mine?.length ? ` (${mine.length})` : '' }) }]}
              value={tab}
              onChange={setTab}
            />
          ) : null}

          {off ? (
            <ThemedText themeColor="textSecondary">{EVENTS_NOT_SWITCHED_ON}</ThemedText>
          ) : list == null ? (
            <ThemedText themeColor="textSecondary">{t('Loading…')}</ThemedText>
          ) : list.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {tab === 'mine' ? t('Nothing Here Yet') : t('No Public Events Coming Up')}
              </Text>
              <ThemedText themeColor="textSecondary">
                {tab === 'mine'
                  ? t('Events you host, co-host or say you’re going to show up here.')
                  : located && radius
                    ? t('Nothing within {v} miles yet. Widen the distance, or create one and it shows here for everyone.', { v: radius.toLocaleString('en-US') })
                    : t('Create one and it shows here for everyone.')}
              </ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.three }}>
              {featured ? <FeaturedEvent key={featured.id} e={featured} height={layout.wide ? 380 : 320} /> : null}
              {tab === 'upcoming' && radius != null ? (
                <View style={styles.sectionHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.section} accessibilityRole="header">{located ? t('Near You') : t('Coming Up')}</Text>
                    {!located ? (
                      <ThemedText type="small" themeColor="textSecondary">{t('Public events everywhere. Allow location to see the ones near you first.')}</ThemedText>
                    ) : null}
                  </View>
                  {located ? <RadiusChip radius={radius} onPress={() => setRadiusOpen(true)} /> : null}
                </View>
              ) : null}
              {rowsOf(rest, columns).map((row, r) => (
                <View key={r} style={styles.gridRow}>
                  {row.map((e, i) => (
                    <View key={e?.id ?? `pad${i}`} style={{ flex: 1, minWidth: 0 }}>{e ? <EventCardView e={e} /> : null}</View>
                  ))}
                </View>
              ))}
            </View>
          )}
          {!off ? <ErrorText error={error} /> : null}

          <EventOrRide from="events" />
        </View>
      </Screen>
      <RadiusSheet visible={radiusOpen} radius={radius ?? 0} located={located} onPick={pickRadius} onClose={() => setRadiusOpen(false)} />
    </>
  );
}

/** Cards in rows of `n`, the last row padded so every card keeps the same width. */
function rowsOf<T>(items: T[], n: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += n) {
    const row: (T | null)[] = items.slice(i, i + n);
    while (row.length < n) row.push(null);
    rows.push(row);
  }
  return rows;
}

const styles = themedStyles(() => ({
  create: { marginRight: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 12, ...TileSurface },
  createText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  section: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 26, lineHeight: 29 },
  gridRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'stretch' },
  empty: { gap: 6, padding: Spacing.four, borderRadius: 22, borderWidth: 1, borderColor: Home.line, borderStyle: 'dashed' },
  emptyTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22 },
}));
