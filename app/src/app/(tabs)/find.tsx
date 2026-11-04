import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlagGate } from '@/components/app-notices';
import { EventOrRide } from '@/components/events/event-or-ride';
import { RideRow, RowGroup } from '@/components/ride-row';
import { PlaceSearch } from '@/components/place-search';
import { RidesMap } from '@/components/rides-map';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Screen, Section, Segmented } from '@/components/ui';
import { TwoPane } from '@/components/two-pane';
import { Colors, Spacing } from '@/constants/theme';
import { boundsAround, RADIUS_CHOICES_MI, stateByCode, US_STATES, type Bounds } from '@/core/discovery';
import type { LatLng } from '@/core/geo';
import { sideColumnWidth } from '@/core/layout';
import { useFullMap } from '@/hooks/use-full-map';
import { useLayout } from '@/hooks/use-layout';
import type { Place } from '@/core/places';
import { publicRidesInArea, publicRidesInState, publicRidesNear } from '@/lib/api';
import { track } from '@/lib/analytics';
import { currentPosition, stateAt } from '@/lib/location';
import type { Ride } from '@/lib/types';

import { t } from '@/lib/i18n';
type Mode = 'near' | 'state';
type Found = Ride & { distanceMi?: number };

/**
 * Find public rides: within a distance of where the rider is, or anywhere in a state they pick.
 * Both show a map that opens on the rider's state; moving it offers "Search this area".
 * Private rides never show here; they are reached only by their link or invite code.
 */
export default function FindRidesScreen() {
  return (
    <FlagGate flag="find_a_ride">
      <FindRides />
    </FlagGate>
  );
}

function FindRides() {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  // Full Map: the map fills the screen (on a tablet, the list beside it tucks away). Starts off
  // each visit, since Find is mostly a list.
  const fullMap = useFullMap(null);
  const [mode, setMode] = useState<Mode>('near');
  const [radius, setRadius] = useState<number>(50);
  const [here, setHere] = useState<LatLng | null>(null);
  // A park, trailhead or town the rider searched for: "near me" then means near there.
  const [place, setPlace] = useState<Place | null>(null);
  const [locating, setLocating] = useState(true);
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [pickingState, setPickingState] = useState(false);
  // Set by "Search this area" or by picking a state on the near-me map; replaces the radius search.
  const [area, setArea] = useState<Bounds | null>(null);
  const [rides, setRides] = useState<Found[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  const findHere = () =>
    currentPosition()
      .then(async (p) => {
        setHere(p);
        const code = await stateAt(p);
        setStateCode((s) => s ?? code);
      })
      .catch((e) => setLocError(e instanceof Error ? e.message : 'Could not get your location.'))
      .finally(() => setLocating(false));

  const locate = () => {
    setLocating(true);
    setLocError(null);
    findHere();
  };

  // Ask for the rider's location as soon as the screen opens (locating starts true).
  useEffect(() => void findHere(), []);

  const origin: LatLng | null = place ?? here;

  useEffect(() => {
    let live = true;
    const run = async () => {
      const search: (() => Promise<Found[]>) | null = area
        ? () => publicRidesInArea(area, here)
        : mode === 'near' && origin
          ? () => publicRidesNear(origin, radius)
          : stateCode
            ? () => publicRidesInState(stateCode)
            : null;
      if (!search) return setRides(null);
      setLoading(true);
      setError(null);
      try {
        const found = await search();
        if (live) setRides(found);
        track('rides_searched', {
          mode: area ? 'area' : place && mode === 'near' ? 'place' : mode,
          radius: mode === 'near' && !area ? radius : null,
          state: stateCode,
          results: found.length,
        });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load rides.');
      } finally {
        if (live) setLoading(false);
      }
    };
    run();
    return () => {
      live = false;
    };
  }, [mode, origin, radius, stateCode, area]);

  const state = stateByCode(stateCode);
  // The map opens on the rider's state (or around a searched place); outside the US it falls back to the search radius.
  const frame = useMemo(
    () => (place ? boundsAround(place, radius) : state ?? (here ? boundsAround(here, radius) : null)),
    [place, state, here, radius],
  );
  const ring = useMemo(() => (mode === 'near' && origin && !area ? { center: origin, miles: radius } : null), [mode, origin, radius, area]);
  const open = (r: Ride) => router.push(`/r/${r.invite_code}`);

  const goToPlace = (p: Place) => {
    setPlace(p);
    setMode('near');
    setArea(null);
    setPickingState(false);
    if (p.state) setStateCode(p.state);
  };
  const clearPlace = () => {
    setPlace(null);
    setArea(null);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === 'state') setPlace(null);
    setArea(null);
    setPickingState(false);
  };
  const pickState = (code: string | null) => {
    setStateCode(code);
    setPickingState(false);
    // On the near-me map a picked state means "show me rides there", not near me.
    setArea(mode === 'near' && origin ? stateByCode(code) ?? null : null);
  };

  const statePicker = (
    <Choice value={stateCode} onChange={pickState} options={US_STATES.map((s) => ({ value: s.code, label: s.name }))} />
  );

  const empty =
    area ? 'No public rides in this map area yet.'
    : mode === 'near' && origin ? `No public rides within ${radius} miles${place ? ` of ${place.name}` : ''} yet.`
    : `No public rides in ${state?.name ?? 'this state'} yet.`;

  const map = frame ? (
        <RidesMap
          rides={rides ?? []}
          frame={frame}
          frameKey={place ? `${place.id}:${radius}` : state?.code ?? 'here'}
          circle={ring}
          title={place?.name ?? state?.name ?? null}
          onPressTitle={() => {
            // The state list is beside or under the map, so picking a state leaves Full Map.
            if (fullMap.full) {
              fullMap.exit();
              setPickingState(true);
            } else setPickingState((p) => !p);
          }}
          onOpen={open}
          onSearchArea={setArea}
          height={layout.wide || fullMap.full ? '100%' : undefined}
          full={fullMap.full}
          onToggleFull={fullMap.full ? fullMap.exit : fullMap.enter}
        />
  ) : null;
  const search = (
    <>
      <Segmented<Mode>
        value={mode}
        onChange={switchMode}
        options={[
          { value: 'near', label: t('Near Me') },
          { value: 'state', label: t('By State') },
        ]}
      />

      <PlaceSearch label={t('Search Near a Place')} near={here} onPick={goToPlace} />
      {place ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <ThemedText style={{ flex: 1, fontWeight: 600 }}>{t('Rides Near {name}', { name: place.name })}</ThemedText>
          <Button title={here ? 'Back to Near Me' : 'Clear'} kind="ghost" onPress={clearPlace} />
        </View>
      ) : null}

      {mode === 'near' && !origin ? (
        <Card>
          <ThemedText>{locating ? 'Finding where you are…' : 'Turn on location to see rides near you, or pick your state below.'}</ThemedText>
          {!locating && locError ? <ThemedText type="small" themeColor="textSecondary">{locError}</ThemedText> : null}
          {!locating ? <Button title={t('Use My Location')} onPress={locate} /> : null}
        </Card>
      ) : null}

      {mode === 'state' && !state ? <ThemedText type="heading">{t('Pick a State')}</ThemedText> : null}
      {(!state && !locating) || pickingState ? statePicker : null}

      <ErrorText error={error} />
      <EventOrRide from="find" />

    </>
  );
  const results = (
    <>

      {mode === 'near' && origin && !area ? (
        <Choice
          label={t('How Far Will You Go?')}
          value={radius}
          onChange={setRadius}
          options={RADIUS_CHOICES_MI.map((mi) => ({ value: mi, label: `${mi} Miles` }))}
        />
      ) : null}
      {area ? <Button title={mode === 'near' && origin ? (place ? `Back to Rides Near ${place.name}` : 'Back to Rides Near Me') : `Back to All of ${state?.name ?? 'the State'}`} kind="ghost" onPress={() => setArea(null)} /> : null}

      {loading ? <ThemedText themeColor="textSecondary">{t('Looking for rides…')}</ThemedText> : null}
      {rides && !loading ? (
        rides.length === 0 ? (
          <Card>
            <ThemedText>{empty}</ThemedText>
            <Button title={t('Create a Public Ride')} onPress={() => router.push('/ride/new?type=public')} />
          </Card>
        ) : (
          <Section title={`${rides.length} ${rides.length === 1 ? 'Ride' : 'Rides'}${area ? ' in This Map Area' : ''}`} />
        )
      ) : null}
      {rides?.length ? (
        <RowGroup>
          {rides.map((r) => (
            <RideRow
              key={r.id}
              ride={r}
              note={[
                r.distanceMi != null ? `${r.distanceMi < 1 ? 'Under 1' : Math.round(r.distanceMi)} mi away` : null,
                r.vehicle_types.length ? r.vehicle_types.join(', ') : null,
              ].filter(Boolean).join(', ') || undefined}
            />
          ))}
        </RowGroup>
      ) : null}
      <View style={{ height: Spacing.two }} />
    </>
  );

  if (fullMap.full && map) {
    return <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: Colors.background }}>{map}</View>;
  }

  // On a tablet (or a wide window) the search and the list sit beside a map as tall as the screen.
  if (layout.wide) {
    return (
      <TwoPane
        sideWidth={sideColumnWidth(layout.width)}
        side={<>{search}{results}</>}
        mainScroll={false}
        main={map ?? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ThemedText themeColor="textSecondary">{t('The map opens on your location or the state you pick.')}</ThemedText>
          </View>
        )}
      />
    );
  }

  return (
    <Screen>
      {search}
      {map}
      {results}
    </Screen>
  );
}
