import { useLocalSearchParams } from 'expo-router';

import { FlagGate } from '@/components/app-notices';
import { Scout } from '@/components/scout/scout';

/**
 * Places to Ride, opened from its Home card (3.4): the same search as Find > Places to Ride, on a
 * page of its own. /places?show=favorites opens on the rider's Favorite Places.
 */
export default function PlacesScreen() {
  const { show } = useLocalSearchParams<{ show?: string }>();
  return (
    <FlagGate flag="scout">
      <Scout top={null} start={show === 'favorites' ? 'favorites' : 'near'} />
    </FlagGate>
  );
}
