import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { vehicleTitle } from '@/core/garage';
import { isIsoDate } from '@/core/trips';
import { myRides, myVehicles, type TripInput, type VehicleWithCost } from '@/lib/api';
import type { Ride, Trip } from '@/lib/types';
import { Button, Card, Choice, ErrorText, Field } from './ui';

/** Name, dates, and optional ride and vehicle for a trip. Used to create and to edit. */
export function TripForm({ trip, onSave, saveLabel }: { trip?: Trip; onSave: (input: TripInput) => Promise<void>; saveLabel: string }) {
  const [name, setName] = useState(trip?.name ?? '');
  const [startsOn, setStartsOn] = useState(trip?.starts_on ?? '');
  const [endsOn, setEndsOn] = useState(trip?.ends_on ?? '');
  const [rideId, setRideId] = useState<string | null>(trip?.ride_id ?? null);
  const [vehicleId, setVehicleId] = useState<string | null>(trip?.vehicle_id ?? null);
  const [vehicles, setVehicles] = useState<VehicleWithCost[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    myVehicles().then(setVehicles).catch(() => {});
    myRides()
      .then((rows) => setRides(rows.filter((m) => m.status === 'joined' && m.rides.status !== 'cancelled').map((m) => m.rides)))
      .catch(() => {});
  }, []);

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Give the trip a name, like "Moab long weekend".');
    const s = startsOn.trim();
    const e = endsOn.trim();
    if (s && !isIsoDate(s)) return setError('Start date should look like 2026-10-12.');
    if (e && !isIsoDate(e)) return setError('End date should look like 2026-10-14.');
    if (s && e && e < s) return setError('The trip ends before it starts.');
    setBusy(true);
    try {
      await onSave({ name: name.trim(), starts_on: s || null, ends_on: e || null, ride_id: rideId, vehicle_id: vehicleId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setBusy(false);
    }
  }

  // A linked ride stays selectable even if it is no longer in "your rides".
  const rideOptions = rides;

  return (
    <Card>
      <Field label="Trip name" value={name} onChangeText={setName} placeholder="Moab long weekend" maxLength={120} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <Field label="Starts" value={startsOn} onChangeText={setStartsOn} placeholder="YYYY-MM-DD" autoCapitalize="none" maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Ends" value={endsOn} onChangeText={setEndsOn} placeholder="Optional" autoCapitalize="none" maxLength={10} />
        </View>
      </View>
      {vehicles.length ? (
        <Choice
          label="Taking"
          options={[{ value: null, label: 'Not set' }, ...vehicles.map((v) => ({ value: v.id as string | null, label: v.nickname || vehicleTitle(v) }))]}
          value={vehicleId}
          onChange={setVehicleId}
        />
      ) : null}
      {rideOptions.length || rideId ? (
        <Choice
          label="For a ride"
          options={[
            { value: null, label: 'No ride' },
            ...rideOptions.map((r) => ({ value: r.id as string | null, label: r.name })),
            ...(rideId && !rideOptions.some((r) => r.id === rideId) ? [{ value: rideId as string | null, label: 'Linked ride' }] : []),
          ]}
          value={rideId}
          onChange={setRideId}
        />
      ) : null}
      <ErrorText error={error} />
      <Button title={saveLabel} big loading={busy} onPress={save} />
    </Card>
  );
}
