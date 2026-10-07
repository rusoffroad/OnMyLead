import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { sharedLocationByToken, type SharedLocation } from '@/lib/api';

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

  if (data === undefined) return <Screen><ThemedText>Loading…</ThemedText></Screen>;
  if (!data) return <Screen><ThemedText type="subtitle">No longer shared</ThemedText><ThemedText>This location link has ended.</ThemedText></Screen>;

  const t = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
  return (
    <Screen>
      <Stack.Screen options={{ title: data.display_name }} />
      <ThemedText type="subtitle">{data.display_name}</ThemedText>
      <Card>
        {data.ride_name ? <ThemedText>On ride: {data.ride_name}</ThemedText> : null}
        {data.expected_finish_at ? <ThemedText>Expected back: {t(data.expected_finish_at)}</ThemedText> : null}
        <ThemedText>Last update: {t(data.recorded_at)}</ThemedText>
        <ThemedText>Sharing ends: {t(data.expires_at)}</ThemedText>
      </Card>
      {data.lat != null && data.lng != null ? (
        <Button title="Open in Maps" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`)} />
      ) : (
        <ThemedText>No location received yet.</ThemedText>
      )}
    </Screen>
  );
}
