import { Link, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import { RidesMap } from '@/components/rides-map';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Screen } from '@/components/ui';
import { boundsAround, RADIUS_CHOICES_MI, stateByCode, US_STATES } from '@/core/discovery';
import type { LatLng } from '@/core/geo';
import { publicRidesInState, publicRidesNear } from '@/lib/api';
import { track } from '@/lib/analytics';
import { currentPosition, stateAt } from '@/lib/location';
import type { Ride } from '@/lib/types';

type Mode = 'near' | 'state';
type Found = Ride & { distanceMi?: number };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Find public rides: within a distance of where the rider is, or anywhere in a state they pick.
 * Private rides never show here; they are reached only by their link or invite code.
 */
export default function FindRides() {
  const [mode, setMode] = useState<Mode>('near');
  const [radius, setRadius] = useState<number>(50);
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [pickingState, setPickingState] = useState(false);
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
      if (mode === 'near' && !here) return setRides(null);
      if (mode === 'state' && !stateCode) return setRides(null);
      setLoading(true);
      setError(null);
      try {
        const found = mode === 'near' ? await publicRidesNear(here!, radius) : await publicRidesInState(stateCode!);
        if (live) setRides(found);
        track('rides_searched', { mode, radius: mode === 'near' ? radius : null, state: mode === 'state' ? stateCode : null, results: found.length });
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
  }, [mode, here, radius, stateCode]);

  const state = stateByCode(stateCode);
  const bounds = useMemo(
    () => (mode === 'near' ? (here ? boundsAround(here, radius) : null) : state ?? null),
    [mode, here, radius, state],
  );
  const open = (r: Ride) => router.push(`/r/${r.invite_code}`);

  return (
    <Screen>
      <Choice
        value={mode}
        onChange={setMode}
        options={[
          { value: 'near', label: 'Near me' },
          { value: 'state', label: 'By state' },
        ]}
      />

      {mode === 'near' ? (
        here ? (
          <Choice
            label="How far will you go?"
            value={radius}
            onChange={setRadius}
            options={RADIUS_CHOICES_MI.map((mi) => ({ value: mi, label: `${mi} miles` }))}
          />
        ) : (
          <Card>
            <ThemedText>{locating ? 'Finding where you are…' : 'Turn on location to see rides near you, or search by state.'}</ThemedText>
            {!locating && locError ? <ThemedText type="small" themeColor="textSecondary">{locError}</ThemedText> : null}
            {!locating ? <Button title="Use my location" onPress={locate} /> : null}
          </Card>
        )
      ) : (
        <>
          <ThemedText type="smallBold">{state ? `Public rides in ${state.name}` : 'Pick a state'}</ThemedText>
          {state && !pickingState ? (
            <Button title="Change state" kind="secondary" onPress={() => setPickingState(true)} />
          ) : (
            <Choice
              value={stateCode}
              onChange={(c) => {
                setStateCode(c);
                setPickingState(false);
              }}
              options={US_STATES.map((s) => ({ value: s.code, label: s.name }))}
            />
          )}
        </>
      )}

      <ErrorText error={error} />

      {bounds && rides ? <RidesMap rides={rides} bounds={bounds} onOpen={open} /> : null}

      {loading ? <ThemedText themeColor="textSecondary">Looking for rides…</ThemedText> : null}
      {rides && !loading ? (
        rides.length === 0 ? (
          <Card>
            <ThemedText>
              {mode === 'near' ? `No public rides within ${radius} miles yet.` : `No public rides in ${state?.name ?? 'this state'} yet.`}
            </ThemedText>
            <Button title="Create a public ride" onPress={() => router.push('/ride/new?type=public')} />
          </Card>
        ) : (
          <ThemedText type="smallBold">
            {rides.length} {rides.length === 1 ? 'ride' : 'rides'}
          </ThemedText>
        )
      ) : null}
      {rides?.map((r) => (
        <Link key={r.id} href={`/r/${r.invite_code}`} asChild>
          <Pressable accessibilityRole="link">
            <Card>
              <ThemedText type="smallBold">
                {r.status === 'live' ? 'LIVE · ' : ''}
                {r.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {when(r.meet_at)}
                {r.distanceMi != null ? ` · ${r.distanceMi < 1 ? 'under 1' : Math.round(r.distanceMi)} mi away` : ''}
                {r.meet_area_label ? ` · near ${r.meet_area_label}` : ''}
                {r.difficulty ? ` · ${r.difficulty}` : ''}
              </ThemedText>
              {r.vehicle_types.length ? (
                <ThemedText type="small" themeColor="textSecondary">{r.vehicle_types.join(', ')}</ThemedText>
              ) : null}
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
