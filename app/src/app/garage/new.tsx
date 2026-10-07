import { router } from 'expo-router';

import { Screen } from '@/components/ui';
import { VehicleForm } from '@/components/vehicle-form';

export default function NewVehicle() {
  return (
    <Screen>
      <VehicleForm onSaved={(v) => router.replace(`/garage/${v.id}`)} />
    </Screen>
  );
}
