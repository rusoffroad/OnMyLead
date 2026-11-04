import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Choice, ErrorText, Field, Screen } from '@/components/ui';
import { Colors, Radius, Spacing, themedStyles } from '@/constants/theme';
import { areaLabel, countryName, searchCountries, stateWord, statesOf } from '@/core/areas';
import { canDetectArea, detectArea, fetchLeaderSettings, saveLeaderArea } from '@/lib/leaderboard';
import { useSession } from '@/lib/session';

/** How many countries show before the rider types (the rest are a search away). */
const FIRST_COUNTRIES = ['US', 'CA', 'MX', 'AU'];

/**
 * Where You Ride: the country and, where we list them, the state the rider rides from, for the
 * leaderboard's filters. Optional. On the apps, Use My Location fills it in from one location fix
 * and the phone's own geocoder; only the two codes are saved.
 */
export default function LeaderboardAreaScreen() {
  const { session, loading } = useSession();
  const [country, setCountry] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ country: string | null; state: string | null } | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/sign-in');
  }, [loading, session]);

  useEffect(() => {
    if (!session) return;
    fetchLeaderSettings()
      .then((s) => {
        setSaved({ country: s?.country ?? null, state: s?.state ?? null });
        setCountry(s?.country ?? null);
        setState(s?.state ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [session]);

  async function useMyLocation() {
    setLocating(true);
    setError(null);
    setNote(null);
    try {
      const found = await detectArea();
      if (!found) {
        setNote('Your phone couldn’t tell which country you’re in. Pick it below.');
      } else {
        setCountry(found.country);
        setState(found.state);
        setQuery('');
        if (!found.state && statesOf(found.country).length) setNote(`Pick your ${stateWord(found.country).toLowerCase()} below.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  async function save(c: string | null, s: string | null) {
    setBusy(true);
    setError(null);
    try {
      await saveLeaderArea(c, s);
      router.back();
    } catch (e) {
      setError(`That didn’t save. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const states = statesOf(country);
  const needsState = states.length > 0 && !state;
  const changed = saved != null && (saved.country !== country || saved.state !== state);
  const shownCountries = query.trim()
    ? searchCountries(query).slice(0, 40)
    : searchCountries('').filter((c) => FIRST_COUNTRIES.includes(c.code)).sort((a, b) => FIRST_COUNTRIES.indexOf(a.code) - FIRST_COUNTRIES.indexOf(b.code));

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: 'Where You Ride' }} />
      <ThemedText themeColor="textSecondary">
        Pick the state or country you ride from to be on its leaderboard. Riders see it beside your name there, and nowhere
        else. It’s optional, and it never shares where you are.
      </ThemedText>

      {saved === null && !error ? <ActivityIndicator color={Colors.text} /> : null}

      {canDetectArea ? (
        <Button title={locating ? 'Finding Your State…' : 'Use My Location'} kind="secondary" loading={locating} onPress={useMyLocation} />
      ) : null}
      {note ? <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText> : null}

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>Country</ThemedText>
        {country ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Country: ${countryName(country)}. Change it`}
            onPress={() => {
              setCountry(null);
              setState(null);
            }}
            style={({ pressed }) => [styles.picked, pressed && { backgroundColor: Colors.backgroundSelected }]}>
            <Icon name="check" size={20} color={Colors.sky} />
            <ThemedText style={{ flex: 1, fontWeight: 600 }}>{countryName(country)}</ThemedText>
            <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>Change</ThemedText>
          </Pressable>
        ) : (
          <>
            <Field
              label="Search Countries"
              value={query}
              onChangeText={setQuery}
              placeholder="Type a country, e.g. Canada"
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
            />
            <View style={styles.list}>
              {shownCountries.map((c, i) => (
                <Pressable
                  key={c.code}
                  accessibilityRole="button"
                  onPress={() => {
                    setCountry(c.code);
                    setState(null);
                    setNote(null);
                  }}
                  style={({ pressed }) => [styles.item, i > 0 && styles.itemLine, pressed && { backgroundColor: Colors.backgroundSelected }]}>
                  <ThemedText style={{ flex: 1 }}>{c.name}</ThemedText>
                  <Icon name="chevron" size={16} color={Colors.textSecondary} />
                </Pressable>
              ))}
              {!shownCountries.length ? (
                <ThemedText type="small" themeColor="textSecondary" style={{ padding: Spacing.three }}>No country matches “{query.trim()}”.</ThemedText>
              ) : null}
            </View>
            {!query.trim() ? <ThemedText type="small" themeColor="textSecondary">Somewhere else? Type its name.</ThemedText> : null}
          </>
        )}
      </View>

      {states.length ? <Choice<string | null> label={stateWord(country)} value={state} onChange={setState} options={states.map((s) => ({ value: s.code, label: s.name }))} /> : null}

      <ErrorText error={error} />
      <Button
        title={country ? `Save ${areaLabel(country, state) ?? ''}`.trim() : 'Save'}
        disabled={!country || needsState || !changed || busy}
        loading={busy}
        onPress={() => save(country, state)}
      />
      {saved?.country ? <Button title="Remove My Area" kind="ghost" disabled={busy} onPress={() => save(null, null)} /> : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  picked: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  list: { borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three },
  itemLine: { borderTopWidth: 1, borderTopColor: Colors.background },
}));
