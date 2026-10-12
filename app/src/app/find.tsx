import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { RideRow, RowGroup } from '@/components/ride-row';
import { RidesMap } from '@/components/rides-map';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Screen, Section, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { boundsAround, RADIUS_CHOICES_MI, stateByCode, US_STATES, type Bounds } from '@/core/discovery';
import type { LatLng } from '@/core/geo';
import { publicRidesInArea, publicRidesInState, publicRidesNear } from '@/lib/api';
import { track } from '@/lib/analytics';
import { currentPosition, stateAt } from '@/lib/location';
import type { Ride } from '@/lib/types';

type Mode = 'near' | 'state';
type Found = Ride & { distanceMi?: number };

/**
 * Find public rides: within a distance of where the rider is, or anywhere in a state they pick.
 * Both show a map that opens on the rider's state; moving it offers "Search this area".
 * Private rides never show here; they are reached only by their link or invite code.
 */
export default function FindRides() {
  const [mode, setMode] = useState<Mode>('near');
  const [radius, setRadius] = useState<number>(50);
  const [here, setHere] = useState<LatLng | null>(null);
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

  useEffect(() => {
    let live = true;
    const run = async () => {
      const search: (() => Promise<Found[]>) | null = area
        ? () => publicRidesInArea(area, here)
        : mode === 'near' && here
          ? () => publicRidesNear(here, radius)
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
          mode: area ? 'area' : mode,
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
  }, [mode, here, radius, stateCode, area]);

  const state = stateByCode(stateCode);
  // The map opens on the rider's state; outside the US it falls back to the search radius.
  const frame = useMemo(() => state ?? (here ? boundsAround(here, radius) : null), [state, here, radius]);
  const ring = useMemo(() => (mode === 'near' && here && !area ? { center: here, miles: radius } : null), [mode, here, radius, area]);
  const open = (r: Ride) => router.push(`/r/${r.invite_code}`);

  const switchMode = (m: Mode) => {
    setMode(m);
    setArea(null);
    setPickingState(false);
  };
  const pickState = (code: string | null) => {
    setStateCode(code);
    setPickingState(false);
    // On the near-me map a picked state means "show me rides there", not near me.
    setArea(mode === 'near' && here ? stateByCode(code) ?? null : null);
  };

  const statePicker = (
    <Choice value={stateCode} onChange={pickState} options={US_STATES.map((s) => ({ value: s.code, label: s.name }))} />
  );

  const empty =
    area ? 'No public rides in this map area yet.'
    : mode === 'near' && here ? `No public rides within ${radius} miles yet.`
    : `No public rides in ${state?.name ?? 'this state'} yet.`;

  return (
    <Screen>
      <Segmented<Mode>
        value={mode}
        onChange={switchMode}
        options={[
          { value: 'near', label: 'Near me' },
          { value: 'state', label: 'By state' },
        ]}
      />

      {mode === 'near' && !here ? (
        <Card>
          <ThemedText>{locating ? 'Finding where you are…' : 'Turn on location to see rides near you, or pick your state below.'}</ThemedText>
          {!locating && locError ? <ThemedText type="small" themeColor="textSecondary">{locError}</ThemedText> : null}
          {!locating ? <Button title="Use my location" onPress={locate} /> : null}
        </Card>
      ) : null}

      {mode === 'state' && !state ? <ThemedText type="heading">Pick a state</ThemedText> : null}
      {(!state && !locating) || pickingState ? statePicker : null}

      <ErrorText error={error} />

      {frame ? (
        <RidesMap
          rides={rides ?? []}
          frame={frame}
          frameKey={state?.code ?? 'here'}
          circle={ring}
          title={state?.name ?? null}
          onPressTitle={() => setPickingState((p) => !p)}
          onOpen={open}
          onSearchArea={setArea}
        />
      ) : null}

      {mode === 'near' && here && !area ? (
        <Choice
          label="How far will you go?"
          value={radius}
          onChange={setRadius}
          options={RADIUS_CHOICES_MI.map((mi) => ({ value: mi, label: `${mi} miles` }))}
        />
      ) : null}
      {area ? <Button title={mode === 'near' && here ? 'Back to rides near me' : `Back to all of ${state?.name ?? 'the state'}`} kind="ghost" onPress={() => setArea(null)} /> : null}

      {loading ? <ThemedText themeColor="textSecondary">Looking for rides…</ThemedText> : null}
      {rides && !loading ? (
        rides.length === 0 ? (
          <Card>
            <ThemedText>{empty}</ThemedText>
            <Button title="Create a public ride" onPress={() => router.push('/ride/new?type=public')} />
          </Card>
        ) : (
          <Section title={`${rides.length} ${rides.length === 1 ? 'ride' : 'rides'}${area ? ' in this map area' : ''}`} />
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
    </Screen>
  );
}
