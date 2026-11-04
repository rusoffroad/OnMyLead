import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText } from '@/components/ui';
import { RideColors, Spacing } from '@/constants/theme';
import { RANGE_LABEL, rideFuelAdvice, type RangeCheck } from '@/core/fuel';
import { rideVehicle, vehicleRange, vehicleTitle } from '@/core/garage';
import { myVehicles, setMyVehicle, type VehicleWithCost } from '@/lib/api';
import type { Ride, RideMember } from '@/lib/types';

import { t } from '@/lib/i18n';
const COLOR: Record<RangeCheck, string> = { get ok() { return RideColors.green; }, get tight() { return RideColors.yellow; }, get over() { return RideColors.red; } };

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
  // Until a machine is picked for the ride, a rider with one machine in the garage is checked against it.
  const vehicle = rideVehicle(vehicles, mine.vehicle_id)?.vehicle ?? null;
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
      <ThemedText type="heading" style={advice ? { color: COLOR[advice.check] } : undefined}>{advice ? RANGE_LABEL[advice.check] : 'Your Machine'}</ThemedText>
      {advice ? (
        <>
          <ThemedText style={{ fontSize: 18, lineHeight: 24, fontWeight: 700 }}>{advice.line}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{t('{route_miles} mile route. {v} goes about {v2} miles on {v3}. Trail miles burn more fuel than you think; the thirds rule keeps a reserve.', { route_miles: ride.route_miles, v: vehicleTitle(vehicle!), v2: Math.round(range!.fullRangeMiles), v3: vehicle!.extra_fuel_gallons ? t('{total} gal ({tank} tank + {extra} extra)', { total: range!.totalGallons, tank: vehicle!.tank_gallons, extra: vehicle!.extra_fuel_gallons }) : t('a full tank') })}</ThemedText>
        </>
      ) : vehicle && !range ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">{t('Add tank size and mpg to {v} to check your fuel for this ride.', { v: vehicleTitle(vehicle) })}</ThemedText>
          <Button title={t('Edit Machine')} kind="secondary" onPress={() => router.push(`/garage/${vehicle.id}/edit`)} />
        </View>
      ) : !vehicle && ride.route_miles ? (
        <ThemedText type="small" themeColor="textSecondary">{t('This route is about {route_miles} miles. Pick the machine you’re bringing to check your fuel range.', { route_miles: ride.route_miles })}</ThemedText>
      ) : null}

      {canChange && vehicles.length ? (
        <Choice
          label={t('Bringing')}
          options={[...vehicles.map((v) => ({ value: v.id as string | null, label: vehicleTitle(v) })), { value: null, label: t('None / Riding Along') }]}
          value={mine.vehicle_id}
          onChange={(v) => (busy || v === mine.vehicle_id ? undefined : pick(v))}
        />
      ) : null}
      {canChange && !vehicles.length ? (
        <Button title={t('Add Your Machine to the Garage')} kind="secondary" onPress={() => router.push('/garage/new')} />
      ) : null}
      <ErrorText error={error} />
    </Card>
  );
}
