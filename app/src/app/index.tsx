import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { LogoBanner } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { discoverPublicRides, myRides } from '@/lib/api';
import { useSession } from '@/lib/session';
import { isBackendConfigured } from '@/lib/supabase';
import type { Ride, RideMember } from '@/lib/types';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Home() {
  const { session, loading } = useSession();
  const [mine, setMine] = useState<(RideMember & { rides: Ride })[]>([]);
  const [nearby, setNearby] = useState<Ride[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isBackendConfigured) return;
      discoverPublicRides().then(setNearby).catch((e) => setError(e.message));
      if (session) myRides().then(setMine).catch((e) => setError(e.message));
    }, [session]),
  );

  if (!isBackendConfigured) {
    return (
      <Screen>
        <LogoBanner height={110} />
        <ThemedText type="subtitle">Almost ready</ThemedText>
        <ThemedText>Add the backend keys to app/.env (see .env.example), then restart the app.</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <LogoBanner height={110} />
      {!loading && !session ? (
        <Card>
          <ThemedText type="smallBold">Create a free account to start and join rides</ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button title="Create account" style={{ flex: 1 }} onPress={() => router.push('/sign-in?mode=create')} />
            <Button title="Sign in" kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/sign-in')} />
          </View>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title="Create a ride" style={{ flex: 1 }} onPress={() => router.push(session ? '/ride/new' : '/sign-in')} />
        <Button title="Share location" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(session ? '/share' : '/sign-in')} />
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title="My garage" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(session ? '/garage' : '/sign-in')} />
        <Button title="Trip planner" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(session ? '/trips' : '/sign-in')} />
      </View>
      <Button title="Starlink" kind="secondary" onPress={() => router.push('/starlink')} />

      <Card>
        <Field label="Have an invite code?" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="e.g. 7F3A9C21" />
        <Button title="Open ride" kind="secondary" disabled={code.trim().length < 4} onPress={() => router.push(`/r/${code.trim().toUpperCase()}`)} />
      </Card>

      <ErrorText error={error} />

      {mine.length ? <ThemedText type="smallBold">Your rides</ThemedText> : null}
      {mine.map((m) => (
        <RideRow key={m.ride_id} ride={m.rides} note={m.status === 'joined' ? m.role : m.status} />
      ))}

      <ThemedText type="smallBold">Public rides</ThemedText>
      {nearby.length === 0 ? <ThemedText themeColor="textSecondary">No public rides yet. Create the first one.</ThemedText> : null}
      {nearby.map((r) => (
        <RideRow key={r.id} ride={r} />
      ))}
    </Screen>
  );
}

function RideRow({ ride, note }: { ride: Ride; note?: string }) {
  return (
    <Link href={`/r/${ride.invite_code}`} asChild>
      <Pressable>
        <Card>
          <ThemedText type="smallBold">
            {ride.status === 'live' ? 'LIVE · ' : ''}
            {ride.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {when(ride.meet_at)}
            {ride.meet_area_label ? ` · near ${ride.meet_area_label}` : ''}
            {ride.difficulty ? ` · ${ride.difficulty}` : ''}
            {note ? ` · ${note.replace('_', ' ')}` : ''}
          </ThemedText>
        </Card>
      </Pressable>
    </Link>
  );
}
