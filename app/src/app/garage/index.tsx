import { Image } from 'expo-image';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatDollars, kindLabel, vehicleTitle } from '@/core/garage';
import { myVehicles, type VehicleWithCost } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function Garage() {
  const { session, loading } = useSession();
  const [vehicles, setVehicles] = useState<VehicleWithCost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      myVehicles().then(setVehicles).catch((e) => setError(e.message));
    }, [session]),
  );

  if (!loading && !session) {
    return (
      <Screen>
        <Card>
          <ThemedText type="smallBold">Sign in to build your garage</ThemedText>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Button title="Add a machine" onPress={() => router.push('/garage/new')} />
      <ErrorText error={error} />
      {vehicles && vehicles.length === 0 ? (
        <ThemedText themeColor="textSecondary">Your garage is empty. Add your rig or side-by-side to track the build and fuel range.</ThemedText>
      ) : null}
      {vehicles?.map((v) => (
        <Link key={v.id} href={`/garage/${v.id}`} asChild>
          <Pressable accessibilityRole="link">
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              {v.photo_url ? (
                <Image source={{ uri: v.photo_url }} style={{ width: 88, height: 66, borderRadius: 8 }} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                <View style={{ width: 88, height: 66, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#999' }}>
                  <ThemedText type="small" themeColor="textSecondary">No photo</ThemedText>
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText type="smallBold">{vehicleTitle(v)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {kindLabel(v.kind)} · {v.item_count} item{v.item_count === 1 ? '' : 's'}
                </ThemedText>
                <ThemedText type="smallBold">Build {formatDollars(v.build_cost_cents)}</ThemedText>
              </View>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
