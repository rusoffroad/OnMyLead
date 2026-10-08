import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { RusGear } from '@/components/rus-gear';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field, Screen } from '@/components/ui';
import { RideColors, Spacing } from '@/constants/theme';
import { vehicleTitle } from '@/core/garage';
import {
  TRIP_CATEGORIES, TRIP_TEMPLATES, categoriesOnList, groupByCategory, itemsToAdd, progress, tripDates, type TripCategory,
} from '@/core/trips';
import {
  addTripItems, copyTrip, deleteTrip, deleteTripItem, getRide, getTrip, getVehicle, tripItems, uncheckAll, updateTripItem,
  type TripItemInput,
} from '@/lib/api';
import { confirmAsync } from '@/lib/confirm';
import { useTheme } from '@/hooks/use-theme';
import type { Ride, Trip, TripItem, Vehicle } from '@/lib/types';

export default function TripPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [items, setItems] = useState<TripItem[]>([]);
  const [ride, setRide] = useState<Ride | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [editing, setEditing] = useState<TripItem | 'new' | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, list] = await Promise.all([getTrip(id), tripItems(id)]);
      setTrip(t);
      setItems(list);
      setRide(t?.ride_id ? await getRide(t.ride_id).catch(() => null) : null);
      setVehicle(t?.vehicle_id ? await getVehicle(t.vehicle_id).catch(() => null) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (trip === undefined) return <Screen><ErrorText error={error} /></Screen>;
  if (trip === null) {
    return (
      <Screen>
        <ThemedText>That trip is not in your list.</ThemedText>
        <Button title="All trips" kind="secondary" onPress={() => router.replace('/trips')} />
      </Screen>
    );
  }

  const p = progress(items);
  const dates = tripDates(trip.starts_on, trip.ends_on);

  async function toggle(item: TripItem) {
    const checked = !item.checked;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, checked } : i)));
    try {
      await updateTripItem(item.id, { checked });
    } catch (e) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, checked: !checked } : i)));
      setError(e instanceof Error ? e.message : 'Could not save. Check your signal and try again.');
    }
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  const addTemplate = (templateId: string) =>
    run(templateId, async () => {
      const tpl = TRIP_TEMPLATES.find((x) => x.id === templateId)!;
      const add = itemsToAdd(items, tpl.items);
      if (!add.length) return setNote(`Everything from "${tpl.label}" is already on your list.`);
      const start = items.reduce((m, i) => Math.max(m, i.position), -1) + 1;
      await addTripItems(trip.id, add, start);
      setNote(`Added ${add.length} item${add.length === 1 ? '' : 's'} from "${tpl.label}".`);
      setShowTemplates(false);
      await load();
    });

  const resetChecks = () =>
    run('uncheck', async () => {
      if (!(await confirmAsync('Uncheck everything?', 'Every item goes back to not packed. The list stays.', 'Uncheck all'))) return;
      await uncheckAll(trip.id);
      await load();
    });

  const copy = () =>
    run('copy', async () => {
      const next = await copyTrip(trip, items);
      router.push(`/trips/${next.id}`);
    });

  const remove = () =>
    run('delete', async () => {
      if (!(await confirmAsync('Delete this trip?', `${trip.name} and its ${items.length} item(s) will be removed.`))) return;
      await deleteTrip(trip.id);
      router.replace('/trips');
    });

  const removeItem = (item: TripItem) =>
    run('item', async () => {
      if (!(await confirmAsync('Remove this item?', item.name, 'Remove'))) return;
      await deleteTripItem(item.id);
      setEditing(null);
      await load();
    });

  return (
    <Screen>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="title" style={{ fontSize: 40, lineHeight: 42 }}>{trip.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[dates, vehicle ? `Taking ${vehicle.nickname || vehicleTitle(vehicle)}` : null].filter(Boolean).join(', ') || 'No dates set'}
        </ThemedText>
        {ride ? (
          <Link href={`/r/${ride.invite_code}`} asChild>
            <Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
              <ThemedText type="link" style={{ color: theme.sky }}>For the ride: {ride.name}</ThemedText>
            </Pressable>
          </Link>
        ) : null}
      </View>

      <Card>
        <ThemedText type="subtitle" style={{ fontSize: 36, lineHeight: 38, color: p.done ? RideColors.green : theme.text }}>
          {p.done ? `All ${p.total} packed` : p.label}
        </ThemedText>
        <ProgressBar fraction={p.fraction} done={p.done} />
      </Card>

      {items.length === 0 || showTemplates ? (
        <Card>
          <ThemedText type="heading">Add a starter list</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">One tap adds the items. Add as many as fit the trip; nothing is added twice.</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {TRIP_TEMPLATES.map((tpl) => (
              <Button
                key={tpl.id}
                title={tpl.label}
                kind="secondary"
                loading={busy === tpl.id}
                style={{ flexGrow: 1, flexBasis: '45%', minHeight: 56 }}
                accessibilityHint={tpl.blurb}
                onPress={() => addTemplate(tpl.id)}
              />
            ))}
          </View>
        </Card>
      ) : (
        <Button title="Add a starter list" kind="ghost" onPress={() => setShowTemplates(true)} />
      )}

      {note ? <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText> : null}
      <ErrorText error={error} />

      {editing === 'new' ? (
        <ItemForm
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            const start = items.reduce((m, i) => Math.max(m, i.position), -1) + 1;
            await addTripItems(trip.id, [{ ...input, notes: input.notes ?? undefined }], start);
            setEditing(null);
            await load();
          }}
        />
      ) : (
        <Button title="Add an item" onPress={() => setEditing('new')} />
      )}

      {groupByCategory(items).map((g) => {
        const gp = progress(g.items);
        return (
          <Card key={g.category}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <ThemedText type="heading">{g.label}</ThemedText>
              <ThemedText style={{ fontWeight: 700, color: gp.done ? RideColors.green : theme.textSecondary }}>{gp.packed} of {gp.total}</ThemedText>
            </View>
            {g.items.map((item) =>
              editing !== 'new' && editing?.id === item.id ? (
                <ItemForm
                  key={item.id}
                  item={item}
                  onCancel={() => setEditing(null)}
                  onDelete={() => removeItem(item)}
                  onSave={async (input) => {
                    await updateTripItem(item.id, input);
                    setEditing(null);
                    await load();
                  }}
                />
              ) : (
                <CheckRow key={item.id} item={item} onToggle={() => toggle(item)} onEdit={() => setEditing(item)} />
              ),
            )}
          </Card>
        );
      })}

      <RusGear vehicle={vehicle} categories={categoriesOnList(items)} campaign="trip_checklist" />

      {items.length ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="heading">After the trip</ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button title="Uncheck all" kind="secondary" style={{ flex: 1 }} loading={busy === 'uncheck'} disabled={p.packed === 0} onPress={resetChecks} />
            <Button title="Copy to a new trip" kind="secondary" style={{ flex: 1 }} loading={busy === 'copy'} onPress={copy} />
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title="Edit trip" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/trips/${trip.id}/edit`)} />
        <Button title="Delete" kind="danger" style={{ flex: 1 }} loading={busy === 'delete'} onPress={remove} />
      </View>
    </Screen>
  );
}

/** A whole-row tap target (gloves) with a big check box. Edit sits on its own target. */
function CheckRow({ item, onToggle, onEdit }: { item: TripItem; onToggle: () => void; onEdit: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', borderTopWidth: 1, borderTopColor: theme.backgroundSelected }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={item.name}
        onPress={onToggle}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 60, paddingVertical: Spacing.two, opacity: pressed ? 0.6 : 1 })}>
        <View
          style={{
            width: 34, height: 34, borderRadius: 10, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
            borderColor: item.checked ? RideColors.green : theme.border,
            backgroundColor: item.checked ? RideColors.green : 'transparent',
          }}>
          {item.checked ? <Icon name="check" size={22} color="#fff" strokeWidth={3} /> : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={item.checked ? { textDecorationLine: 'line-through', color: theme.textSecondary } : undefined}>
            {item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name}
          </ThemedText>
          {item.notes ? <ThemedText type="small" themeColor="textSecondary">{item.notes}</ThemedText> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.name}`}
        onPress={onEdit}
        hitSlop={8}
        style={{ minWidth: 56, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText type="small" style={{ color: theme.sky, fontWeight: 600 }}>Edit</ThemedText>
      </Pressable>
    </View>
  );
}

function ItemForm({
  item, onSave, onCancel, onDelete,
}: {
  item?: TripItem;
  onSave: (input: TripItemInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<TripCategory>(item?.category ?? 'other');
  const [qty, setQty] = useState(String(item?.quantity ?? 1));
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError('What do you need to bring?');
    const quantity = Number(qty.trim() || '1');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return setError('Quantity should be a whole number from 1 to 999.');
    setBusy(true);
    try {
      await onSave({ name: name.trim(), category, quantity, notes: notes.trim() || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <Card style={{ borderWidth: 1.5, borderColor: theme.sky }}>
      <Field label="Item" value={name} onChangeText={setName} placeholder="Tow strap" maxLength={200} />
      <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' }}>
        <View style={{ width: 96 }}>
          <Field label="How many" value={qty} onChangeText={setQty} keyboardType="number-pad" maxLength={3} />
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.two, flex: 1 }}>
          <Button title="−" kind="secondary" style={{ flex: 1 }} accessibilityLabel="One less" onPress={() => setQty(String(Math.max(1, (Number(qty) || 1) - 1)))} />
          <Button title="+" kind="secondary" style={{ flex: 1 }} accessibilityLabel="One more" onPress={() => setQty(String(Math.min(999, (Number(qty) || 0) + 1)))} />
        </View>
      </View>
      <Choice label="Category" options={TRIP_CATEGORIES.map((c) => ({ value: c.id as TripCategory, label: c.label }))} value={category} onChange={setCategory} />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional: size, where it lives in the rig" maxLength={1000} />
      <ErrorText error={error} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title="Cancel" kind="secondary" style={{ flex: 1 }} onPress={onCancel} />
        <Button title={item ? 'Save' : 'Add'} style={{ flex: 1 }} loading={busy} onPress={save} />
      </View>
      {onDelete ? <Button title="Remove item" kind="danger" onPress={onDelete} /> : null}
    </Card>
  );
}
