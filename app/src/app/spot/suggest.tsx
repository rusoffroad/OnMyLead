import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { MeetPointMap } from '@/components/meet-point-map';
import { PlaceSearch } from '@/components/place-search';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { SPOT_KINDS, suggestionProblem, type SpotKind } from '@/core/spots';
import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';
import { currentPosition, stateAt } from '@/lib/location';
import { useSession } from '@/lib/session';
import { suggestSpot } from '@/lib/spots';

/**
 * Suggest a Place (from Scout): a rider tells us about an off-road park, OHV area, trail system,
 * trailhead or track that's missing. It goes to the Admin Dashboard and shows to everyone once
 * approved. Riders never see who suggested a place.
 */
export default function SuggestSpotScreen() {
  const { session, loading } = useSession();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SpotKind | null>(null);
  const [at, setAt] = useState<LatLng | null>(null);
  const [atLabel, setAtLabel] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace('/sign-in');
  }, [loading, session]);

  const place = (p: LatLng, label: string | null, st?: string | null) => {
    setAt(p);
    setAtLabel(label);
    if (st) setState(st);
    else stateAt(p).then(setState).catch(() => {});
  };

  const send = async () => {
    const problem = suggestionProblem({ name, kind, at, website, note });
    if (problem) return setError(t(problem));
    setBusy(true);
    setError(null);
    try {
      await suggestSpot({ name, kind, at, website, note }, state);
      track('spot_suggested', { kind });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Could not send it. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Suggest a Place') }} />
        <Card>
          <ThemedText type="heading">{t('Thanks, We Got It')}</ThemedText>
          <ThemedText>{t('We check every place before it shows in Scout. Once it’s approved, riders near it will see it.')}</ThemedText>
          <Button title={t('Back to Scout')} onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Suggest a Place') }} />
      <ThemedText themeColor="textSecondary">{t('Know an off-road park, OHV area or trail system that isn’t in Scout? Tell us where it is.')}</ThemedText>
      <Field label={t('Name')} value={name} onChangeText={setName} placeholder="Hidden Falls Adventure Park" maxLength={120} />
      <Choice<SpotKind | null> label={t('What Kind of Place')} value={kind} onChange={setKind} options={SPOT_KINDS.map((k) => ({ value: k.kind, label: k.one }))} />

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="heading">{t('Where It Is')}</ThemedText>
        <PlaceSearch label={t('Search a Place or Address')} onPick={(p) => place(p, p.name, p.state)} />
        <MeetPointMap value={at} onPick={(p) => place(p, null)} />
        <Button
          title={t('I’m There Now')}
          kind="ghost"
          onPress={() => currentPosition().then((p) => place(p, t('Where you are now'))).catch((e: Error) => setError(e.message))}
        />
        {at ? (
          <ThemedText type="small" themeColor="textSecondary">
            {atLabel ? `${atLabel}, ` : ''}{at.lat.toFixed(5)}, {at.lng.toFixed(5)}
          </ThemedText>
        ) : null}
      </View>

      <Field label={t('Website (optional)')} value={website} onChangeText={setWebsite} placeholder="hiddenfallsadventure.com" autoCapitalize="none" keyboardType="url" />
      <Field label={t('Anything We Should Know (optional)')} value={note} onChangeText={setNote} multiline maxLength={500} placeholder={t('Hours, fees, what vehicles are allowed')} />
      <ErrorText error={error} />
      <Button title={t('Send Suggestion')} loading={busy} onPress={send} />
    </Screen>
  );
}
