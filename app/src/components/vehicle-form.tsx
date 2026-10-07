import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  centsToInput, isPlausibleVin, parseAmount, parseDollars, parseVpic, vehicleRange, VEHICLE_KINDS, type VehicleKind,
} from '@/core/garage';
import { createVehicle, decodeVin, setVehiclePhoto, updateVehicle, type VehicleInput } from '@/lib/api';
import type { PickedPhoto } from '@/lib/photo-bytes';
import type { Vehicle } from '@/lib/types';

const str = (n: number | null | undefined) => (n == null ? '' : String(n));
const text = (s: string) => (s.trim() ? s.trim() : null);

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: Spacing.two }}>{children}</View>;
}
const Half = ({ children }: { children: ReactNode }) => <View style={{ flex: 1 }}>{children}</View>;

export function VehicleForm({ vehicle, onSaved }: { vehicle?: Vehicle | null; onSaved: (v: Vehicle) => void }) {
  // Set once a new machine is created, so a retry after a failed photo upload updates it instead of adding a duplicate.
  const [created, setCreated] = useState<Vehicle | null>(null);
  const current = created ?? vehicle ?? null;
  const [kind, setKind] = useState<VehicleKind | null>(vehicle?.kind ?? null);
  const [nickname, setNickname] = useState(vehicle?.nickname ?? '');
  const [year, setYear] = useState(str(vehicle?.year));
  const [make, setMake] = useState(vehicle?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [trim, setTrim] = useState(vehicle?.trim ?? '');
  const [vin, setVin] = useState(vehicle?.vin ?? '');
  const [price, setPrice] = useState(centsToInput(vehicle?.purchase_price_cents));
  const [hours, setHours] = useState(str(vehicle?.engine_hours));
  const [odometer, setOdometer] = useState(str(vehicle?.odometer_miles));
  const [tank, setTank] = useState(str(vehicle?.tank_gallons));
  const [extra, setExtra] = useState(vehicle?.extra_fuel_gallons ? String(vehicle.extra_fuel_gallons) : '');
  const [mpg, setMpg] = useState(str(vehicle?.mpg));
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [vinBusy, setVinBusy] = useState(false);
  const [vinNote, setVinNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tankN = parseAmount(tank);
  const extraN = parseAmount(extra);
  const mpgN = parseAmount(mpg);
  const range =
    tankN.ok && extraN.ok && mpgN.ok
      ? vehicleRange({ tank_gallons: tankN.value, extra_fuel_gallons: extraN.value, mpg: mpgN.value })
      : null;

  async function pickPhoto() {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.7 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setPhoto({ uri: a.uri, mimeType: a.mimeType ?? null, file: a.file ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open your photos.');
    }
  }

  async function lookUpVin() {
    setVinNote(null);
    if (!isPlausibleVin(vin)) return setVinNote('A VIN is 17 letters and numbers (no I, O or Q).');
    setVinBusy(true);
    try {
      const found = parseVpic(await decodeVin(vin));
      if (!found) return setVinNote('No match for that VIN. Enter the details by hand.');
      if (found.year) setYear(String(found.year));
      if (found.make) setMake(found.make);
      if (found.model) setModel(found.model);
      if (found.trim) setTrim(found.trim);
      setVinNote('Filled in from the VIN. Check it looks right.');
    } catch (e) {
      setVinNote(e instanceof Error ? e.message : 'VIN lookup failed. Enter the details by hand.');
    } finally {
      setVinBusy(false);
    }
  }

  async function save() {
    setError(null);
    if (!kind) return setError('Pick Vehicle or SXS/UTV first.');
    const yearN = year.trim() ? Number(year.trim()) : null;
    if (yearN != null && !(Number.isInteger(yearN) && yearN >= 1900 && yearN <= 2100)) return setError('Year should look like 2022.');
    const priceP = parseDollars(price);
    if (!priceP.ok) return setError(`Purchase price: ${priceP.error}`);
    const nums = { hours: parseAmount(hours), odometer: parseAmount(odometer), tank: tankN, extra: extraN, mpg: mpgN };
    const bad = Object.entries(nums).find(([, p]) => !p.ok);
    if (bad) return setError(`Check the ${bad[0] === 'extra' ? 'extra fuel' : bad[0]} number.`);
    const val = (p: ReturnType<typeof parseAmount>) => (p.ok ? p.value : null);
    if (!text(nickname) && !text(make) && !text(model)) return setError('Give it a nickname or a make and model.');

    const input: VehicleInput = {
      kind,
      nickname: text(nickname),
      year: yearN,
      make: text(make),
      model: text(model),
      trim: text(trim),
      vin: text(vin)?.toUpperCase() ?? null,
      purchase_price_cents: priceP.cents,
      engine_hours: val(nums.hours),
      odometer_miles: val(nums.odometer),
      tank_gallons: val(nums.tank),
      extra_fuel_gallons: val(nums.extra) ?? 0,
      mpg: val(nums.mpg),
    };
    setBusy(true);
    try {
      let saved = current ? await updateVehicle(current.id, input) : await createVehicle(input);
      if (!vehicle) setCreated(saved);
      if (photo) {
        try {
          saved = await setVehiclePhoto(saved, photo);
        } catch (e) {
          return setError(`Saved, but the photo did not upload (${e instanceof Error ? e.message : String(e)}). Tap save to try again.`);
        }
      }
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const shownPhoto = photo?.uri ?? current?.photo_url ?? null;

  return (
    <>
      <Choice label="What are you adding?" options={VEHICLE_KINDS} value={kind} onChange={setKind} />

      <Card>
        {shownPhoto ? (
          <Image source={{ uri: shownPhoto }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} contentFit="cover" accessibilityLabel="Photo of your machine" />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">Add a photo of your machine.</ThemedText>
        )}
        <Button title={shownPhoto ? 'Change photo' : 'Choose photo'} kind="secondary" onPress={pickPhoto} />
      </Card>

      <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Dusty" />
      <Row>
        <Half>
          <Field label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="2022" maxLength={4} />
        </Half>
        <Half>
          <Field label="Make" value={make} onChangeText={setMake} placeholder={kind === 'sxs_utv' ? 'Polaris' : 'Toyota'} />
        </Half>
      </Row>
      <Row>
        <Half>
          <Field label="Model" value={model} onChangeText={setModel} placeholder={kind === 'sxs_utv' ? 'RZR Pro R' : 'Tacoma'} />
        </Half>
        <Half>
          <Field label="Trim" value={trim} onChangeText={setTrim} placeholder="Optional" />
        </Half>
      </Row>
      <Field label="VIN" value={vin} onChangeText={setVin} autoCapitalize="characters" autoCorrect={false} maxLength={17} placeholder="Optional" />
      <Button title="Fill year, make and model from VIN" kind="secondary" loading={vinBusy} disabled={!vin.trim()} onPress={lookUpVin} />
      {vinNote ? <ThemedText type="small" themeColor="textSecondary">{vinNote}</ThemedText> : null}

      <Field label="Purchase price ($)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Optional" />
      <Row>
        <Half>
          <Field label="Engine hours" value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
        </Half>
        <Half>
          <Field label="Odometer (miles)" value={odometer} onChangeText={setOdometer} keyboardType="decimal-pad" />
        </Half>
      </Row>

      <Card>
        <ThemedText type="smallBold">Fuel and mileage</ThemedText>
        <Row>
          <Half>
            <Field label="Tank (gal)" value={tank} onChangeText={setTank} keyboardType="decimal-pad" placeholder="10" />
          </Half>
          <Half>
            <Field label="Extra fuel (gal)" value={extra} onChangeText={setExtra} keyboardType="decimal-pad" placeholder="0" />
          </Half>
        </Row>
        <Field label="Miles per gallon" value={mpg} onChangeText={setMpg} keyboardType="decimal-pad" placeholder="12" hint="Your real-world trail mpg, not the sticker." />
        {range ? (
          <ThemedText type="small" themeColor="textSecondary">
            About {Math.round(range.fullRangeMiles)} miles on {range.totalGallons} gallons. Turn around by {Math.round(range.safeTurnaroundMiles)} miles out.
          </ThemedText>
        ) : null}
      </Card>

      <ErrorText error={error} />
      <Button title={current ? 'Save changes' : 'Add to garage'} big loading={busy} onPress={save} />
    </>
  );
}
