import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { isUntilTurnedOff } from '@/core/sharing';
import { sharedLocationByToken, type SharedLocation } from '@/lib/api';

import { t as tr } from '@/lib/i18n';
/** Read-only family link. Opens on the web without an account; shows nothing once sharing ends. */
export default function FamilyLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<SharedLocation | null | undefined>(undefined);

  useEffect(() => {
    const load = () => sharedLocationByToken(token).then(setData).catch(() => setData(null));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [token]);

  if (data === undefined) return <Screen><ThemedText>{tr('Loading…')}</ThemedText></Screen>;
  if (!data) return <Screen><ThemedText type="subtitle">{tr('No Longer Shared')}</ThemedText><ThemedText>{tr('This location link has ended.')}</ThemedText></Screen>;

  const t = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
  // Shares can now run for days, so the end shows its date too.
  const ends = (iso: string | null) => {
    const at = iso ? Date.parse(iso) : null;
    if (isUntilTurnedOff(at)) return 'When they turn it off';
    return new Date(at!).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: data.display_name }} />
      <ThemedText type="subtitle">{data.display_name}</ThemedText>
      <Card>
        {data.ride_name ? <ThemedText>{tr('On ride: {ride_name}', { ride_name: data.ride_name })}</ThemedText> : null}
        {data.expected_finish_at ? <ThemedText>{tr('Expected back: {v}', { v: t(data.expected_finish_at) })}</ThemedText> : null}
        <ThemedText>{tr('Last update: {v}', { v: t(data.recorded_at) })}</ThemedText>
        <ThemedText>{tr('Sharing ends: {v}', { v: ends(data.expires_at) })}</ThemedText>
      </Card>
      {data.lat != null && data.lng != null ? (
        <Button title={tr('Open in Maps')} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`)} />
      ) : (
        <ThemedText>{tr('No location received yet.')}</ThemedText>
      )}
    </Screen>
  );
}
