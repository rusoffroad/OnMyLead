import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { TripForm } from '@/components/trip-form';
import { ErrorText, Screen } from '@/components/ui';
import { getTrip, updateTrip } from '@/lib/api';
import type { Trip } from '@/lib/types';

export default function EditTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTrip(id).then(setTrip).catch((e) => setError(e.message));
  }, [id]);

  return (
    <Screen>
      <ErrorText error={error} />
      {trip === null ? <ThemedText>That trip is not in your list.</ThemedText> : null}
      {trip ? (
        <TripForm
          trip={trip}
          saveLabel="Save"
          onSave={async (input) => {
            await updateTrip(id, input);
            if (router.canGoBack()) router.back();
            else router.replace(`/trips/${id}`);
          }}
        />
      ) : null}
    </Screen>
  );
}
