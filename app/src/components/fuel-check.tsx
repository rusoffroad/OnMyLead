import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText } from '@/components/ui';
import { RideColors, Spacing } from '@/constants/theme';
import { rideFuelAdvice, type RangeCheck } from '@/core/fuel';
import { vehicleRange, vehicleTitle } from '@/core/garage';
import { myVehicles, setMyVehicle, type VehicleWithCost } from '@/lib/api';
import type { Ride, RideMember } from '@/lib/types';

const LABEL: Record<RangeCheck, string> = { ok: 'Fuel OK', tight: 'Fuel is tight', over: 'Not enough fuel' };
const COLOR: Record<RangeCheck, string> = { ok: RideColors.green, tight: RideColors.yellow, over: RideColors.red };

/**
 * Pick which machine you're bringing, and if the ride has a planned distance, check it
 * against that machine's fuel range from your garage.
 */
export function FuelCheck({ ride, mine, onChanged }: { ride: Ride; mine: RideMember; onChanged: () => void }) {
  const [vehicles, setVehicles] = useState<VehicleWithCost[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    myVehicles().then(setVehicles).catch(() => setVehicles([]));
  }, []);

  if (!vehicles) return null;
  const vehicle = vehicles.find((v) => v.id === mine.vehicle_id) ?? null;
  const range = vehicle ? vehicleRange(vehicle) : null;
  const advice = ride.route_miles && vehicle && range
    ? rideFuelAdvice(ride.route_miles, { tankGallons: vehicle.tank_gallons!, extraGallons: vehicle.extra_fuel_gallons ?? 0, mpg: vehicle.mpg! })
    : null;
  const canChange = ride.status === 'scheduled' || ride.status === 'live';

  async function pick(id: string | null) {
    setBusy(true);
    setError(null);
    try {
      await setMyVehicle(ride.id, id, mine.riders);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your machine.');
    } finally {
      setBusy(false);
    }
  }

  if (!vehicles.length && !ride.route_miles) return null;

  return (
    <Card style={advice ? { borderLeftWidth: 4, borderLeftColor: COLOR[advice.check] } : undefined}>
      <ThemedText type="heading" style={advice ? { color: COLOR[advice.check] } : undefined}>{advice ? LABEL[advice.check] : 'Your machine'}</ThemedText>
      {advice ? (
        <>
          <ThemedText style={{ fontSize: 18, lineHeight: 24, fontWeight: 700 }}>{advice.line}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {ride.route_miles} mile route · {vehicleTitle(vehicle!)} goes about {Math.round(range!.fullRangeMiles)} miles on{' '}
            {vehicle!.extra_fuel_gallons ? `${range!.totalGallons} gal (${vehicle!.tank_gallons} tank + ${vehicle!.extra_fuel_gallons} extra)` : 'a full tank'}.
            Trail miles burn more fuel than you think; the thirds rule keeps a reserve.
          </ThemedText>
        </>
      ) : vehicle && !range ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            Add tank size and mpg to {vehicleTitle(vehicle)} to check your fuel for this ride.
          </ThemedText>
          <Button title="Edit machine" kind="secondary" onPress={() => router.push(`/garage/${vehicle.id}/edit`)} />
        </View>
      ) : !vehicle && ride.route_miles ? (
        <ThemedText type="small" themeColor="textSecondary">
          This route is about {ride.route_miles} miles. Pick the machine you’re bringing to check your fuel range.
        </ThemedText>
      ) : null}

      {canChange && vehicles.length ? (
        <Choice
          label="Bringing"
          options={[...vehicles.map((v) => ({ value: v.id as string | null, label: vehicleTitle(v) })), { value: null, label: 'None / riding along' }]}
          value={mine.vehicle_id}
          onChange={(v) => (busy || v === mine.vehicle_id ? undefined : pick(v))}
        />
      ) : null}
      {canChange && !vehicles.length ? (
        <Button title="Add your machine to the garage" kind="secondary" onPress={() => router.push('/garage/new')} />
      ) : null}
      <ErrorText error={error} />
    </Card>
  );
}
