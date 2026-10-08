import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { RusGear } from '@/components/rus-gear';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  AREAS, buildCsv, buildSheetText, buildTotals, centsToInput, exportFileBase, formatDollars, kindLabel, parseDollars,
  vehicleRange, vehicleTitle, type AreaId,
} from '@/core/garage';
import {
  addVehicleItem, deleteVehicle, deleteVehicleItem, getVehicle, updateVehicleItem, vehicleItems, type VehicleItemInput,
} from '@/lib/api';
import { confirmAsync } from '@/lib/confirm';
import { shareBuildSheet, shareCsv } from '@/lib/export';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import type { Vehicle, VehicleItem } from '@/lib/types';

const miles = (n: number) => `${Math.round(n)} mi`;

/** A real calendar date in YYYY-MM-DD form. */
const isIsoDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export default function VehiclePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const theme = useTheme();
  const [vehicle, setVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [items, setItems] = useState<VehicleItem[]>([]);
  const [editing, setEditing] = useState<VehicleItem | 'new' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [v, list] = await Promise.all([getVehicle(id), vehicleItems(id)]);
      setVehicle(v);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (vehicle === undefined) return <Screen><ErrorText error={error} /></Screen>;
  if (vehicle === null) {
    return (
      <Screen>
        <ThemedText>That machine is not in your garage.</ThemedText>
        <Button title="Back to garage" kind="secondary" onPress={() => router.replace('/garage')} />
      </Screen>
    );
  }

  const mine = session?.user.id === vehicle.owner_id;
  const totals = buildTotals(items);
  const range = vehicleRange(vehicle);
  const title = vehicleTitle(vehicle);

  async function exportSheet() {
    setNote(null);
    try {
      setNote(await shareBuildSheet(title, buildSheetText(vehicle!, items)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share.');
    }
  }

  async function exportCsv() {
    setNote(null);
    try {
      setNote(await shareCsv(exportFileBase(vehicle!), buildCsv(vehicle!, items)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export.');
    }
  }

  async function removeVehicle() {
    if (!(await confirmAsync('Delete this machine?', `${title} and its ${items.length} build item(s) will be removed.`))) return;
    try {
      await deleteVehicle(vehicle!);
      router.replace('/garage');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
    }
  }

  async function removeItem(item: VehicleItem) {
    if (!(await confirmAsync('Remove this item?', item.name, 'Remove'))) return;
    try {
      await deleteVehicleItem(item.id);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove.');
    }
  }

  return (
    <Screen>
      {vehicle.photo_url ? (
        <Image source={{ uri: vehicle.photo_url }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.card }} contentFit="cover" accessibilityLabel={`Photo of ${title}`} />
      ) : null}
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="title" style={{ fontSize: 40, lineHeight: 42 }}>{vehicle.nickname?.trim() || title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[
            vehicle.nickname?.trim() ? vehicleTitle({ ...vehicle, nickname: null }) : null,
            kindLabel(vehicle.kind),
            vehicle.vin ? `VIN ${vehicle.vin}` : null,
            vehicle.odometer_miles != null ? `${vehicle.odometer_miles} mi` : null,
            vehicle.engine_hours != null ? `${vehicle.engine_hours} hrs` : null,
          ].filter(Boolean).join(', ')}
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="heading">Fuel range</ThemedText>
        {range ? (
          <>
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Stat label="Full range" value={miles(range.fullRangeMiles)} />
              <Stat label="Safe turnaround" value={miles(range.safeTurnaroundMiles)} />
              <Stat label="Safe trip" value={miles(range.safeTripMiles)} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {range.totalGallons} gal ({vehicle.tank_gallons} tank + {vehicle.extra_fuel_gallons ?? 0} extra) at {vehicle.mpg} mpg. Thirds rule: a third out, a third back, a third in reserve.
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">Add tank size and mpg to see how far you can go.</ThemedText>
        )}
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <ThemedText type="heading">Build</ThemedText>
        <ThemedText type="heading">{formatDollars(totals.totalCents)}</ThemedText>
      </View>

      {mine && editing === 'new' ? (
        <ItemForm onCancel={() => setEditing(null)} onSave={async (input) => { await addVehicleItem(vehicle.id, input); setEditing(null); await load(); }} />
      ) : mine ? (
        <Button title="Add a part or extra" kind="secondary" onPress={() => setEditing('new')} />
      ) : null}

      {totals.itemCount === 0 ? (
        <ThemedText themeColor="textSecondary">Nothing listed yet. Add tires, lights, armor, comms and everything else you put on it.</ThemedText>
      ) : null}

      {totals.groups.map((g) => (
        <Card key={g.area}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <ThemedText style={{ fontWeight: 700 }}>{g.label}</ThemedText>
            <ThemedText style={{ fontWeight: 700 }}>{formatDollars(g.subtotalCents)}</ThemedText>
          </View>
          {g.items.map((item) =>
            editing !== 'new' && editing?.id === item.id ? (
              <ItemForm
                key={item.id}
                item={item}
                onCancel={() => setEditing(null)}
                onDelete={() => removeItem(item)}
                onSave={async (input) => { await updateVehicleItem(item.id, input); setEditing(null); await load(); }}
              />
            ) : (
              <Pressable
                key={item.id}
                disabled={!mine}
                accessibilityRole={mine ? 'button' : undefined}
                accessibilityHint={mine ? 'Edit this item' : undefined}
                onPress={() => setEditing(item)}
                style={{ borderTopWidth: 1, borderTopColor: theme.backgroundSelected, paddingTop: Spacing.two, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
                  <ThemedText style={{ flex: 1 }}>{item.brand ? `${item.name} · ${item.brand}` : item.name}</ThemedText>
                  <ThemedText>{formatDollars(item.cost_cents, { blank: '—' })}</ThemedText>
                </View>
                {item.installed_on || item.notes ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {[item.installed_on ? `Installed ${item.installed_on}` : null, item.notes].filter(Boolean).join(' · ')}
                  </ThemedText>
                ) : null}
              </Pressable>
            ),
          )}
        </Card>
      ))}

      {totals.itemCount ? (
        <Card>
          <Total label="Build total" cents={totals.totalCents} />
          {vehicle.purchase_price_cents != null ? (
            <>
              <Total label="Purchase price" cents={vehicle.purchase_price_cents} />
              <Total label="All in" cents={vehicle.purchase_price_cents + totals.totalCents} bold />
            </>
          ) : null}
        </Card>
      ) : null}

      {mine ? <RusGear vehicle={vehicle} campaign="garage_vehicle" /> : null}

      <ThemedText type="heading">Export</ThemedText>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title="Build sheet" kind="secondary" style={{ flex: 1 }} onPress={exportSheet} />
        <Button title="CSV" kind="secondary" style={{ flex: 1 }} onPress={exportCsv} />
      </View>
      {note ? <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText> : null}
      <ErrorText error={error} />

      {mine ? (
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <Button title="Edit machine" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/garage/${vehicle.id}/edit`)} />
          <Button title="Delete" kind="danger" style={{ flex: 1 }} onPress={removeVehicle} />
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText type="subtitle" style={{ fontSize: 30, lineHeight: 32 }}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

function Total({ label, cents, bold }: { label: string; cents: number; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <ThemedText type={bold ? 'smallBold' : 'small'}>{label}</ThemedText>
      <ThemedText type={bold ? 'smallBold' : 'small'}>{formatDollars(cents)}</ThemedText>
    </View>
  );
}

function ItemForm({
  item, onSave, onCancel, onDelete,
}: {
  item?: VehicleItem;
  onSave: (input: VehicleItemInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [area, setArea] = useState<AreaId>(item?.area ?? 'wheels_tires');
  const [name, setName] = useState(item?.name ?? '');
  const [brand, setBrand] = useState(item?.brand ?? '');
  const [cost, setCost] = useState(centsToInput(item?.cost_cents));
  const [installed, setInstalled] = useState(item?.installed_on ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  async function save() {
    setError(null);
    if (!name.trim()) return setError('What is it? e.g. "35in tires"');
    const c = parseDollars(cost);
    if (!c.ok) return setError(`Cost: ${c.error}`);
    if (installed.trim() && !isIsoDate(installed.trim())) return setError('Installed date should look like 2026-05-01.');
    setBusy(true);
    try {
      await onSave({
        area,
        name: name.trim(),
        brand: brand.trim() || null,
        cost_cents: c.cents,
        installed_on: installed.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <Card style={{ borderWidth: 1.5, borderColor: theme.sky }}>
      <Choice label="Area" options={AREAS.map((a) => ({ value: a.id, label: a.label }))} value={area} onChange={setArea} />
      <Field label="Item" value={name} onChangeText={setName} placeholder="Beadlock wheels" />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="Optional" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Cost ($)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0.00" />
        </View>
      </View>
      <Field label="Installed" value={installed} onChangeText={setInstalled} placeholder="YYYY-MM-DD" autoCapitalize="none" maxLength={10} />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Part number, where you bought it, wiring" />
      <ErrorText error={error} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title="Cancel" kind="secondary" style={{ flex: 1 }} onPress={onCancel} />
        <Button title={item ? 'Save' : 'Add'} style={{ flex: 1 }} loading={busy} onPress={save} />
      </View>
      {onDelete ? <Button title="Remove item" kind="danger" onPress={onDelete} /> : null}
    </Card>
  );
}
