import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { TripForm } from '@/components/trip-form';
import { Screen } from '@/components/ui';
import { createTrip } from '@/lib/api';

export default function NewTrip() {
  return (
    <Screen>
      <ThemedText themeColor="textSecondary">Name it now. You can add a starter list on the next screen.</ThemedText>
      <TripForm
        saveLabel="Create trip"
        onSave={async (input) => {
          const trip = await createTrip(input);
          router.replace(`/trips/${trip.id}`);
        }}
      />
    </Screen>
  );
}
