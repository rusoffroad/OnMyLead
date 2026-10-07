import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ErrorText, Screen } from '@/components/ui';
import { VehicleForm } from '@/components/vehicle-form';
import { getVehicle } from '@/lib/api';
import type { Vehicle } from '@/lib/types';

export default function EditVehicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVehicle(id).then(setVehicle).catch((e) => setError(e.message));
  }, [id]);

  return (
    <Screen>
      <ErrorText error={error} />
      {vehicle === null ? <ThemedText>That machine is not in your garage.</ThemedText> : null}
      {vehicle ? <VehicleForm vehicle={vehicle} onSaved={() => (router.canGoBack() ? router.back() : router.replace(`/garage/${id}`))} /> : null}
    </Screen>
  );
}
