import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { ProgressBar } from '@/components/progress-bar';
import { Spacing } from '@/constants/theme';
import { progress, tripDates } from '@/core/trips';
import { myTrips, type TripWithCounts } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function Trips() {
  const { session, loading } = useSession();
  const [trips, setTrips] = useState<TripWithCounts[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      myTrips().then(setTrips).catch((e) => setError(e.message));
    }, [session]),
  );

  if (!loading && !session) {
    return (
      <Screen>
        <Card>
          <ThemedText type="heading">Sign in to plan your trips</ThemedText>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Button title="Plan a new trip" big onPress={() => router.push('/trips/new')} />
      <ErrorText error={error} />
      {trips && trips.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          No trips yet. Make a packing list once, tick things off as they go in the rig, and reuse it next time.
        </ThemedText>
      ) : null}
      {trips?.map((trip) => {
        const p = progress([...Array(trip.total)].map((_, i) => ({ checked: i < trip.packed })));
        const dates = tripDates(trip.starts_on, trip.ends_on);
        return (
          <Link key={trip.id} href={`/trips/${trip.id}`} asChild>
            <Pressable accessibilityRole="link">
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
                  <ThemedText type="heading" style={{ flex: 1 }}>{trip.name}</ThemedText>
                  {dates ? <ThemedText type="small" themeColor="textSecondary">{dates}</ThemedText> : null}
                </View>
                <ProgressBar fraction={p.fraction} done={p.done} />
                <ThemedText type="small" themeColor="textSecondary">{p.done ? `All ${p.total} packed` : p.label}</ThemedText>
              </Card>
            </Pressable>
          </Link>
        );
      })}
    </Screen>
  );
}
