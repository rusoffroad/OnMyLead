import { Image } from 'expo-image';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { Icon } from '@/components/icon';
import { Colors, Spacing } from '@/constants/theme';
import { formatDollars, kindLabel, vehicleTitle } from '@/core/garage';
import { myVehicles, type VehicleWithCost } from '@/lib/api';
import { useSession } from '@/lib/session';

import { t } from '@/lib/i18n';
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
          <ThemedText type="heading">{t('Sign In to Build Your Garage')}</ThemedText>
          <Button title={t('Sign In')} onPress={() => router.push('/sign-in')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Button title={t('Add a Machine')} big onPress={() => router.push('/garage/new')} />
      <ErrorText error={error} />
      {vehicles && vehicles.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('Your garage is empty. Add your rig or side-by-side to track the build and fuel range.')}</ThemedText>
      ) : null}
      {vehicles?.map((v) => (
        <Link key={v.id} href={`/garage/${v.id}`} asChild>
          <Pressable accessibilityRole="link">
            <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
              {v.photo_url ? (
                <Image source={{ uri: v.photo_url }} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                <View style={{ width: '100%', aspectRatio: 16 / 7, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected, gap: Spacing.one }}>
                  <Icon name="machine" size={44} color={Colors.textSecondary} strokeWidth={1.5} />
                  <ThemedText type="small" themeColor="textSecondary">{t('Add a photo from the machine’s page')}</ThemedText>
                </View>
              )}
              <View style={{ padding: Spacing.three, gap: Spacing.one }}>
                <ThemedText type="subtitle" style={{ fontSize: 28, lineHeight: 30 }}>{v.nickname?.trim() || vehicleTitle(v)}</ThemedText>
                {v.nickname?.trim() ? <ThemedText style={{ fontWeight: 600 }}>{vehicleTitle({ ...v, nickname: null })}</ThemedText> : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: Spacing.one }}>
                  <ThemedText type="small" themeColor="textSecondary">{`${t(kindLabel(v.kind))}, ${t(v.item_count === 1 ? '{n} item' : '{n} items', { n: v.item_count })}`}</ThemedText>
                  <ThemedText type="heading" style={{ color: Colors.text }}>{formatDollars(v.build_cost_cents)}</ThemedText>
                </View>
              </View>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
