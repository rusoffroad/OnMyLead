import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { EventOrRide } from '@/components/events/event-or-ride';
import { EventCardView } from '@/components/events/parts';
import { RadiusChip, RadiusSheet } from '@/components/home/public-rides';
import { Home, Pill } from '@/components/home/parts';
import PageHead from '@/components/page-head';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen, Segmented } from '@/components/ui';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { EVENTS_NOT_SWITCHED_ON, sortCards, type EventCard } from '@/core/events';
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

  return (
    <>
      <Stack.Screen options={{ title: t('Events') }} />
      <PageHead><title>Events | OnMyLead</title></PageHead>
      <Screen width="wide">
        <View style={{ gap: Spacing.four }}>
          <View style={[styles.head, layout.wide && styles.headWide]}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.title} accessibilityRole="header">Rallies, Runs and Ride Weekends</Text>
              <ThemedText themeColor="textSecondary">
                See what’s happening, who’s going, the agenda and the group rides to join.
              </ThemedText>
            </View>
            <View style={{ gap: 6, alignItems: layout.wide ? 'flex-end' : 'stretch' }}>
              <Button title="Create an Event" pro="create_events" onPress={create} style={layout.wide ? { minWidth: 220 } : undefined} />
              {session && !can('create_events') ? <Pill text="Pro" tone="gold" style={{ alignSelf: layout.wide ? 'flex-end' : 'center' }} /> : null}
            </View>
          </View>

          <EventOrRide from="events" />

          {session ? (
            <Segmented<Tab>
              options={[{ value: 'upcoming', label: 'Coming Up' }, { value: 'mine', label: `Yours${mine?.length ? ` (${mine.length})` : ''}` }]}
              value={tab}
              onChange={setTab}
            />
          ) : null}

          {tab === 'upcoming' && radius != null ? (
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                {located ? 'Public events, soonest first.' : 'Public events everywhere. Allow location to see the ones near you first.'}
              </ThemedText>
              {located ? <RadiusChip radius={radius} onPress={() => setRadiusOpen(true)} /> : null}
            </View>
          ) : null}

          {off ? (
            <ThemedText themeColor="textSecondary">{EVENTS_NOT_SWITCHED_ON}</ThemedText>
          ) : list == null ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : list.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {tab === 'mine' ? 'Nothing Here Yet' : 'No Public Events Coming Up'}
              </Text>
              <ThemedText themeColor="textSecondary">
                {tab === 'mine'
                  ? 'Events you host, co-host or say you’re going to show up here.'
                  : located && radius
                    ? `Nothing within ${radius.toLocaleString('en-US')} miles yet. Widen the distance, or create one and it shows here for everyone.`
                    : 'Create one and it shows here for everyone.'}
              </ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.three }}>
              {rowsOf(list, columns).map((row, r) => (
                <View key={r} style={styles.gridRow}>
                  {row.map((e, i) => (
                    <View key={e?.id ?? `pad${i}`} style={{ flex: 1, minWidth: 0 }}>{e ? <EventCardView e={e} /> : null}</View>
                  ))}
                </View>
              ))}
            </View>
          )}
          {!off ? <ErrorText error={error} /> : null}
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
  head: { gap: Spacing.three },
  headWide: { flexDirection: 'row', alignItems: 'flex-end' },
  title: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 32, lineHeight: 35 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  gridRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'stretch' },
  empty: { gap: 6, padding: Spacing.four, borderRadius: 22, borderWidth: 1, borderColor: Home.line, borderStyle: 'dashed' },
  emptyTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22 },
}));
