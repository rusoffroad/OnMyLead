import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EventOrRide } from '@/components/events/event-or-ride';
import { FeaturedEvent } from '@/components/events/featured-event';
import { EventCardView } from '@/components/events/parts';
import { RideTile } from '@/components/ride-tile';
import { Icon } from '@/components/icon';
import { RadiusChip, RadiusSheet } from '@/components/home/public-rides';
import { Home, Pill } from '@/components/home/parts';
import PageHead from '@/components/page-head';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen, Segmented } from '@/components/ui';
import { Colors, font, Spacing, themedStyles, TileSurface } from '@/constants/theme';
import {
  eventPhase, eventsViews, EVENTS_AND_RIDES_TITLE, EVENTS_NOT_SWITCHED_ON, pickEventsView, sortCards, type EventCard, type EventsView,
} from '@/core/events';
import { parseRadius, RADIUS_STORAGE_KEY } from '@/core/home';
import { useLayout } from '@/hooks/use-layout';
import { discoverPublicRides, publicRidesNear } from '@/lib/api';
import { useFlag } from '@/lib/app-settings';
import { useEntitlements } from '@/lib/entitlements';
import { myEvents, upcomingEvents } from '@/lib/events';
import { positionIfAllowed } from '@/lib/location';
import { requirePro } from '@/lib/pro';
import { setSyncedItem } from '@/lib/settings-sync';
import { useSession } from '@/lib/session';
import type { Ride } from '@/lib/types';
import { currentLocale, t } from '@/lib/i18n';

type Near = Ride & { distanceMi?: number };

/**
 * Events and Group Rides (3.1, Chris 2026-11-14): public events coming up near you, public group
 * rides near you (the same rides as the Rides tab), and the events you host or said you're going
 * to, under one switch. Anyone, signed in or not, sees events and rides; only Pro riders create
 * events. `/events?show=rides` opens on Group Rides.
 */
export default function EventsScreen({ inTab = false }: { inTab?: boolean } = {}) {
  const { session } = useSession();
  const { can } = useEntitlements();
  const layout = useLayout();
  const ridesOn = useFlag('find_a_ride');
  const views = eventsViews({ signedIn: !!session, ridesOn });
  const { show } = useLocalSearchParams<{ show?: string }>();
  // The view the rider picked; until they pick, the one a link asks for (`?show=rides`), else
  // Events. A view that goes away (signed out, Find a Ride off) falls back to Events.
  const [chosen, setChosen] = useState<EventsView | null>(null);
  const [showFor, setShowFor] = useState(show);
  if (show !== showFor) {
    setShowFor(show);
    setChosen(null);
  }
  const wanted = chosen ?? pickEventsView(show, views);
  const tab: EventsView = views.includes(wanted) ? wanted : 'events';
  const setTab = setChosen;
  const [rides, setRides] = useState<Near[] | null>(null);
  const [upcoming, setUpcoming] = useState<EventCard[] | null>(null);
  const [mine, setMine] = useState<EventCard[] | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [located, setLocated] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ridesError, setRidesError] = useState<string | null>(null);


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

  // Group rides load when that view is open: nearest first with location, every public ride without.
  const ridesOpen = tab === 'rides' && ridesOn;
  useFocusEffect(
    useCallback(() => {
      if (radius == null || !ridesOpen) return;
      let gone = false;
      setRidesError(null);
      positionIfAllowed()
        .then(async (at) => {
          setLocated(!!at);
          const found: Near[] = at && radius > 0 ? await publicRidesNear(at, radius) : await discoverPublicRides();
          if (!gone) setRides(found);
        })
        .catch((e) => {
          if (gone) return;
          setRides([]);
          setRidesError(e instanceof Error ? e.message : String(e));
        });
      return () => {
        gone = true;
      };
    }, [radius, ridesOpen]),
  );

  const pickRadius = (mi: number) => {
    setRadius(mi);
    setSyncedItem(RADIUS_STORAGE_KEY, String(mi)).catch(() => {});
  };

  const create = () => {
    if (!session) return router.push('/sign-in?mode=create');
    if (tab === 'rides') {
      if (requirePro('create_ride')) router.push('/ride/new?type=public');
      return;
    }
    if (requirePro('create_events')) router.push('/events/new');
  };

  const list = tab === 'mine' ? mine : upcoming;
  const narrow = layout.width < 430;
  const columns = layout.expanded ? 3 : layout.wide ? 2 : 1;
  const off = error === EVENTS_NOT_SWITCHED_ON;
  // The next event coming up leads as a full photo (3.0); the rest follow as cards.
  const featured = tab === 'events' && list?.length ? list.find((e) => eventPhase(e) !== 'over' && eventPhase(e) !== 'cancelled') ?? null : null;
  const rest = list ? list.filter((e) => e !== featured) : [];

  return (
    <>
      {/* 3.0: Create sits in the header, top right, instead of a big button over the list. */}
      {/* 3.1: the full name fits a phone header because Create shrinks to its + on a phone. */}
      <Stack.Screen
        options={{
          title: t(EVENTS_AND_RIDES_TITLE),
          // In the tab the header title is the big 30 pt one; it shrinks to fit a phone.
          headerTitle: inTab ? ({ children, tintColor }) => (
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[styles.headTitle, narrow && styles.headTitleNarrow, tintColor ? { color: tintColor } : null]}>
              {children}
            </Text>
          ) : undefined,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tab === 'rides' ? t('Create a Public Ride') : t('Create an Event')}
              hitSlop={8}
              onPress={create}
              style={({ pressed }) => [styles.create, narrow && styles.createNarrow, pressed && { opacity: 0.85 }]}>
              <Icon name="plus" size={narrow ? 20 : 16} color={Colors.text} />
              {narrow ? null : <Text style={styles.createText}>{t('Create')}</Text>}
              {tab !== 'rides' && session && !can('create_events') && !narrow ? <Pill text="Pro" tone="gold" /> : null}
            </Pressable>
          ),
        }}
      />
      <PageHead><title>{t('Events and Group Rides | OnMyLead')}</title></PageHead>
      <Screen width="wide">
        <View style={{ gap: Spacing.four }}>
          {views.length > 1 ? (
            <Segmented<EventsView>
              options={views.map((v) => ({
                value: v,
                label: v === 'events' ? t('Events') : v === 'rides' ? t('Group Rides') : t('Yours{v}', { v: mine?.length ? ` (${mine.length})` : '' }),
              }))}
              value={tab}
              onChange={setTab}
            />
          ) : null}

          {tab === 'rides' ? (
            <GroupRides
              rides={rides}
              radius={radius}
              located={located}
              columns={columns}
              error={ridesError}
              onRadius={() => setRadiusOpen(true)}
            />
          ) : off ? (
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
              {tab === 'events' && radius != null ? (
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
          {!off && tab !== 'rides' ? <ErrorText error={error} /> : null}

          <EventOrRide from="events" />
        </View>
      </Screen>
      <RadiusSheet visible={radiusOpen} radius={radius ?? 0} located={located} onPick={pickRadius} onClose={() => setRadiusOpen(false)} />
    </>
  );
}

/**
 * Group Rides: public rides coming up, nearest first with the same distance chip as Events, as
 * the Rides tab's cards (in columns on a tablet), with a way to the map and to create one.
 */
function GroupRides({
  rides, radius, located, columns, error, onRadius,
}: { rides: Near[] | null; radius: number | null; located: boolean; columns: number; error: string | null; onRadius: () => void }) {
  if (rides == null) return <ThemedText themeColor="textSecondary">{t('Looking for rides…')}</ThemedText>;
  const head = (
    <View style={styles.sectionHead}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.section} accessibilityRole="header">{located ? t('Group Rides Near You') : t('Public Group Rides')}</Text>
        <ThemedText type="small" themeColor="textSecondary">
          {located ? t('One ride on one day. Join one and ride together in Ride Mode.') : t('Every public ride coming up. Allow location to see the ones near you first.')}
        </ThemedText>
      </View>
      {located && radius != null ? <RadiusChip radius={radius} onPress={onRadius} /> : null}
    </View>
  );
  return (
    <View style={{ gap: Spacing.three }}>
      {head}
      {rides.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('No Public Rides Coming Up')}</Text>
          <ThemedText themeColor="textSecondary">
            {located && radius
              ? t('No public rides coming up within {n} miles. Widen the distance, or create one and it shows here for everyone.', { n: radius.toLocaleString(currentLocale()) })
              : t('No public rides coming up. Create one and it shows here for everyone.')}
          </ThemedText>
          <Button title={t('Create a Public Ride')} kind="secondary" onPress={() => router.push('/ride/new?type=public')} />
        </View>
      ) : (
        rowsOf(rides, columns).map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((ride, i) => (
              <View key={ride?.id ?? `pad${i}`} style={{ flex: 1, minWidth: 0 }}>{ride ? <RideTile ride={ride} distanceMi={ride.distanceMi} /> : null}</View>
            ))}
          </View>
        ))
      )}
      {rides.length ? <Button title={t('See Them on the Map')} kind="ghost" onPress={() => router.push('/find')} /> : null}
      <ErrorText error={error} />
    </View>
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
  createNarrow: { width: 40, paddingHorizontal: 0, justifyContent: 'center' },
  headTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30 },
  headTitleNarrow: { fontSize: 25 },
  createText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  section: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 26, lineHeight: 29 },
  gridRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'stretch' },
  empty: { gap: 6, padding: Spacing.four, borderRadius: 22, borderWidth: 1, borderColor: Home.line, borderStyle: 'dashed' },
  emptyTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22 },
}));
