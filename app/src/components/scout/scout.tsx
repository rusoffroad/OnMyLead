import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { PlaceSearch } from '@/components/place-search';
import { awayText, mapFrameStyle, SpotPin } from '@/components/rides-map-chrome';
import { RidesMap } from '@/components/rides-map';
import { SPOT_INK } from '@/components/spot-pin-art';
import { RowGroup } from '@/components/ride-row';
import { ThemedText } from '@/components/themed-text';
import { TwoPane } from '@/components/two-pane';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { boundsAround } from '@/core/discovery';
import type { LatLng } from '@/core/geo';
import { sideColumnWidth } from '@/core/layout';
import type { Place } from '@/core/places';
import { boundsOfSpots, filterKinds, kindCounts, placeLine, SCOUT_DEFAULT_MILES, SPOT_KINDS, spotKindInfo, toggleKind, type Spot, type SpotKind } from '@/core/spots';
import { useFullMap } from '@/hooks/use-full-map';
import { useLayout } from '@/hooks/use-layout';
import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';
import { quickPosition } from '@/lib/location';
import { useSession } from '@/lib/session';
import { favoriteSpots, readScoutMiles, saveScoutMiles, spotsNear } from '@/lib/spots';
import { MileSlider } from './mile-slider';
import { useDiscoverActivity } from '@/lib/activity';

/**
 * Scout (Find > Places to Ride): off-road parks, OHV areas, trail systems, trailheads and
 * motocross tracks within a distance of the rider (250 miles to start, 10 to 1,000 on the slider),
 * nearest first, on a map and in a list. Searching a town or park looks around there instead.
 * Tapping a place opens its page (app/spot/[id].tsx) with directions, rides there and Create a Ride
 * Here. On a tablet the controls and the list sit beside a full-height map.
 *
 * Favorite Places (4.0): the heart chip shows only the places the rider saved (newest first, any
 * distance away); `start="favorites"` opens on them.
 */
export function Scout({ top, start = 'near' }: { top: React.ReactNode; start?: 'near' | 'favorites' }) {
  // Activities (4.0): only the rider's activity while the switcher is on.
  const activity = useDiscoverActivity();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const fullMap = useFullMap(null);
  // The saved distance is read first, so the first search isn't run twice (default, then saved).
  const [savedMiles, setSavedMiles] = useState<number | null>(null);
  const miles = savedMiles ?? SCOUT_DEFAULT_MILES;
  const setMiles = setSavedMiles;
  const [here, setHere] = useState<LatLng | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [locating, setLocating] = useState(true);
  const [locError, setLocError] = useState<string | null>(null);
  const [kinds, setKinds] = useState<SpotKind[]>([]);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [notYet, setNotYet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useSession();
  const [onlyFavs, setOnlyFavs] = useState(start === 'favorites');
  const [favs, setFavs] = useState<Spot[] | null>(null);

  // Favorites reload each time Scout comes back into view (a place page may have saved or unsaved one).
  useFocusEffect(
    useCallback(() => {
      if (!session) return setFavs([]);
      favoriteSpots(here).then(setFavs).catch(() => setFavs((f) => f ?? []));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user.id, here?.lat, here?.lng]),
  );

  useEffect(() => {
    readScoutMiles().then(setSavedMiles).catch(() => setSavedMiles(SCOUT_DEFAULT_MILES));
  }, []);

  // The phone's recent fix opens the map at once; a fresh High fix could take 10 seconds (Chris, build 27).
  const findHere = () =>
    quickPosition()
      .then(setHere)
      // Only our own words reach the rider; a phone error (kCLErrorDomain, no fix yet) gets the plain line.
      .catch((e) => setLocError(e instanceof Error && /^Allow location access/.test(e.message) ? t(e.message) : t('Could not get your location.')))
      .finally(() => setLocating(false));
  const locate = () => {
    setLocating(true);
    setLocError(null);
    findHere();
  };
  // Ask for the rider's location as soon as Scout opens (locating starts true).
  useEffect(() => void findHere(), []);

  const origin: LatLng | null = place ?? here;

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (!origin) return setSpots(null);
      if (savedMiles == null) return;
      setLoading(true);
      setError(null);
      try {
        const found = await spotsNear(origin, miles, [], activity);
        if (!live) return;
        setNotYet(found === null);
        setSpots(found ?? []);
        track('spots_searched', { miles, place: !!place, results: found?.length ?? 0 });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : t('Could not load places.'));
      } finally {
        if (live) setLoading(false);
      }
    };
    run();
    return () => {
      live = false;
    };
    // origin is a new object only when the rider or the searched place moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, savedMiles, activity]);

  const changeMiles = (m: number) => {
    setMiles(m);
    saveScoutMiles(m);
  };

  const pool = onlyFavs ? favs : spots;
  const shown = useMemo(() => filterKinds(pool ?? [], kinds), [pool, kinds]);
  const counts = useMemo(() => kindCounts(pool ?? []), [pool]);
  // Like the search, the map waits for the saved distance so it doesn't frame 250 mi and then jump.
  const ready = origin && savedMiles != null ? origin : null;
  const favFrame = useMemo(() => boundsOfSpots(favs ?? []), [favs]);
  const frame = useMemo(
    () => (onlyFavs && favFrame ? favFrame : ready ? boundsAround(ready, miles) : null),
    [onlyFavs, favFrame, ready, miles],
  );
  const ring = useMemo(() => (ready && !onlyFavs ? { center: ready, miles } : null), [ready, miles, onlyFavs]);
  const toggleFavs = () => {
    if (!session) return router.push('/sign-in');
    setKinds([]);
    setOnlyFavs((on) => !on);
    track('spot_favorites_viewed');
  };
  const open = (s: Pick<Spot, 'id'>) => router.push(`/spot/${s.id}`);

  const map = frame ? (
    <RidesMap
      rides={[]}
      spots={shown}
      onOpenSpot={open}
      onOpen={() => {}}
      frame={frame}
      frameKey={onlyFavs ? `favs:${favs?.length ?? 0}` : `${place?.id ?? 'here'}:${miles}`}
      circle={ring}
      title={place?.name ?? null}
      height={layout.wide || fullMap.full ? '100%' : 340}
      full={fullMap.full}
      onToggleFull={fullMap.full ? fullMap.exit : fullMap.enter}
      cover
      loading={onlyFavs ? favs === null : loading || spots === null}
    />
  ) : (locating || origin) && !onlyFavs ? (
    // Holds the map's place while the phone finds the rider, so the page doesn't sit half empty.
    <View style={[mapFrameStyle(layout.wide ? '100%' : 340), styles.waiting]} accessibilityLiveRegion="polite">
      <ActivityIndicator color={Colors.text} />
      <ThemedText themeColor="textSecondary">{t('Finding where you are…')}</ThemedText>
    </View>
  ) : null;

  const controls = (
    <>
      {top}
      <PlaceSearch label={t('Look Around a Town or Park')} near={here} onPick={(p) => setPlace(p)} />
      {place ? (
        <View style={styles.placeRow}>
          <ThemedText style={{ flex: 1, fontWeight: 600 }}>{t('Places Near {name}', { name: place.name })}</ThemedText>
          <Button title={here ? t('Back to Near Me') : t('Clear')} kind="ghost" onPress={() => setPlace(null)} />
        </View>
      ) : null}
      {!origin && !onlyFavs && !locating ? (
        <Card>
          <ThemedText>{t('Turn on location to see places to ride near you, or search a town or park above.')}</ThemedText>
          {locError ? <ThemedText type="small" themeColor="textSecondary">{locError}</ThemedText> : null}
          <Button title={t('Use My Location')} onPress={locate} />
        </Card>
      ) : null}
      {onlyFavs ? null : <MileSlider miles={miles} onChange={changeMiles} />}
      {spots?.length || favs?.length || onlyFavs ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindScroll} contentContainerStyle={styles.kinds} accessibilityRole="toolbar">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: onlyFavs }}
            accessibilityLabel={`${t('Favorite Places')}${favs?.length ? `, ${favs.length}` : ''}`}
            onPress={toggleFavs}
            style={({ pressed }) => [styles.kind, onlyFavs && styles.kindOn, pressed && { opacity: 0.7 }]}>
            <Icon name="heart" size={15} color={onlyFavs ? Colors.onScout : Colors.scout} strokeWidth={2.4} />
            <Text style={[styles.kindText, onlyFavs && styles.kindTextOn]}>{t('Favorites')}</Text>
            {favs?.length ? <Text style={[styles.kindCount, onlyFavs && styles.kindTextOn]}>{favs.length}</Text> : null}
          </Pressable>
          {SPOT_KINDS.filter((k) => counts[k.kind] > 0).map((k) => {
            const on = kinds.includes(k.kind);
            return (
              <Pressable
                key={k.kind}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${t(k.label)}, ${counts[k.kind]}`}
                onPress={() => setKinds((ks) => toggleKind(ks, k.kind))}
                style={({ pressed }) => [styles.kind, on && styles.kindOn, pressed && { opacity: 0.7 }]}>
                <Icon name={k.icon} size={15} color={on ? Colors.onScout : SPOT_INK[k.kind]} strokeWidth={2.4} />
                <Text style={[styles.kindText, on && styles.kindTextOn]}>{t(k.label)}</Text>
                <Text style={[styles.kindCount, on && styles.kindTextOn]}>{counts[k.kind]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <ErrorText error={error} />
    </>
  );

  const list = (
    <>
      {loading && !onlyFavs ? <ThemedText themeColor="textSecondary">{t('Looking for places to ride…')}</ThemedText> : null}
      {onlyFavs ? (
        favs === null ? (
          <ThemedText themeColor="textSecondary">{t('Loading your favorite places…')}</ThemedText>
        ) : favs.length === 0 ? (
          <Card>
            <ThemedText>{t('No favorite places yet. Open a place and tap Save to keep it here.')}</ThemedText>
          </Card>
        ) : (
          <ThemedText type="heading">
            {favs.length === 1 ? t('1 Favorite Place') : t('{n} Favorite Places', { n: favs.length })}
          </ThemedText>
        )
      ) : spots && !loading ? (
        notYet ? (
          <Card>
            <ThemedText>{t('Places to Ride is almost here. Check back after the next update.')}</ThemedText>
          </Card>
        ) : shown.length === 0 ? (
          <Card>
            <ThemedText>
              {kinds.length ? t('None of these within {n} miles. Turn a filter off or look farther.', { n: miles.toLocaleString('en-US') }) : t('No places to ride within {n} miles yet. Look farther, or tell us about one.', { n: miles.toLocaleString('en-US') })}
            </ThemedText>
          </Card>
        ) : (
          <ThemedText type="heading">
            {shown.length === 1 ? t('1 Place to Ride') : t('{n} Places to Ride', { n: shown.length })}
          </ThemedText>
        )
      ) : null}
      {shown.length ? <RowGroup>{shown.slice(0, 150).map((s) => <SpotRow key={s.id} spot={s} onPress={() => open(s)} away={!onlyFavs || !!here} />)}</RowGroup> : null}
      {shown.length > 150 ? <ThemedText type="small" themeColor="textSecondary">{t('Showing the nearest 150. Zoom the map or shorten the distance to see the rest.')}</ThemedText> : null}
      {spots && !notYet && !onlyFavs ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/spot/suggest')} style={({ pressed }) => [styles.suggest, pressed && { opacity: 0.7 }]}>
          <Icon name="plus" size={18} color={Colors.sky} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 700 }}>{t('Know a Place We’re Missing?')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{t('Suggest it. We check every one before it shows.')}</ThemedText>
          </View>
          <Icon name="chevron" size={20} color={Colors.textSecondary} />
        </Pressable>
      ) : null}
      <View style={{ height: Spacing.two }} />
    </>
  );

  if (fullMap.full && map) {
    return <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: Colors.background }}>{map}</View>;
  }
  if (layout.wide) {
    return (
      <TwoPane
        sideWidth={sideColumnWidth(layout.width)}
        side={<>{controls}{list}</>}
        mainScroll={false}
        main={map ?? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ThemedText themeColor="textSecondary">{t('The map opens on your location or the place you search.')}</ThemedText>
          </View>
        )}
      />
    );
  }
  return (
    <Screen>
      {controls}
      {map}
      {list}
    </Screen>
  );
}

/** One place in the list: its sign, name, where it is, how far, and rides coming up there. */
export function SpotRow({ spot, onPress, away = true }: { spot: Spot; onPress: () => void; away?: boolean }) {
  const where = placeLine(spot);
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <SpotPin spot={spot} />
      <View style={{ flex: 1, gap: 1 }}>
        <ThemedText style={{ fontSize: 17, lineHeight: 22, fontWeight: 700 }} numberOfLines={2}>{spot.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {[t(spotKindInfo(spot.kind).one), where].filter(Boolean).join(', ')}
        </ThemedText>
        {spot.ridesComingUp ? (
          <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 700 }}>
            {spot.ridesComingUp === 1 ? t('1 ride coming up') : t('{n} rides coming up', { n: spot.ridesComingUp })}
          </ThemedText>
        ) : null}
      </View>
      {away ? <Text style={styles.away}>{awayText(spot.distanceMi)}</Text> : null}
      <Icon name="chevron" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  waiting: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  // The chips scroll sideways in one row so the map stays near the top on a phone.
  kindScroll: { marginHorizontal: -Spacing.three, flexGrow: 0 },
  kinds: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.three },
  kind: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40,
    borderRadius: Radius.pill, borderWidth: 1.5, borderColor: Colors.backgroundSelected, backgroundColor: Colors.backgroundElement,
  },
  kindOn: { backgroundColor: Colors.scout, borderColor: Colors.scout },
  kindText: { color: Colors.text, fontFamily: font(600), fontSize: 15 },
  kindCount: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 16 },
  kindTextOn: { color: Colors.onScout },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.three, paddingVertical: 12, minHeight: 64 },
  away: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18 },
  suggest: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.three, borderRadius: Radius.card,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.backgroundSelected,
  },
}));
