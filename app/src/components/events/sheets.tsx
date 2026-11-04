import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { TimePicker } from '@/components/time-picker';
import { Button, Choice, ErrorText, Field } from '@/components/ui';
import { Colors, Radius, Spacing, themedStyles } from '@/constants/theme';
import { AGENDA_KINDS, atMinutesOf, dayChip, eventDays, minutesOf, type AgendaItem, type AgendaKind, type EventDetail } from '@/core/events';
import { minutesText, parseTime } from '@/core/time';
import { confirmAsync } from '@/lib/confirm';
import { deleteAgendaItem, linkRide, saveAgendaItem, type LinkableRide } from '@/lib/events';

import { t } from '@/lib/i18n';
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Add or edit one agenda item: what kind, what it's called, which day, when, where. */
export function AgendaSheet({
  event, item, visible, onClose, onSaved,
}: { event: EventDetail; item: AgendaItem | null; visible: boolean; onClose: () => void; onSaved: () => void }) {
  const days = eventDays(event.starts_at, event.ends_at);
  const [kind, setKind] = useState<AgendaKind>(item?.kind ?? 'other');
  const [title, setTitle] = useState(item?.title ?? '');
  const [day, setDay] = useState(() => dayIndex(days, item?.starts_at ?? event.starts_at));
  const [start, setStart] = useState(item ? minutesText(minutesOf(item.starts_at)) : '10:00 am');
  const [end, setEnd] = useState(item?.ends_at ? minutesText(minutesOf(item.ends_at)) : '');
  const [place, setPlace] = useState(item?.place ?? '');
  const [details, setDetails] = useState(item?.details ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new item (or another one) resets the form: adjusted during render, not in an effect.
  const [shownFor, setShownFor] = useState<string | null>(item?.id ?? null);
  const [wasOpen, setWasOpen] = useState(visible);
  if (visible !== wasOpen || (item?.id ?? null) !== shownFor) {
    setWasOpen(visible);
    setShownFor(item?.id ?? null);
    if (visible) {
      setKind(item?.kind ?? 'other');
      setTitle(item?.title ?? '');
      setDay(dayIndex(days, item?.starts_at ?? event.starts_at));
      setStart(item ? minutesText(minutesOf(item.starts_at)) : '10:00 am');
      setEnd(item?.ends_at ? minutesText(minutesOf(item.ends_at)) : '');
      setPlace(item?.place ?? '');
      setDetails(item?.details ?? '');
      setError(null);
    }
  }

  async function save() {
    if (!title.trim()) return setError(t('Give it a name, like “Poker Run” or “Live Music: The Dust Devils”.'));
    const s = parseTime(start);
    if (s == null) return setError(t('Pick a start time.'));
    const e = end ? parseTime(end) : null;
    const d = days[day] ?? days[0];
    const startsAt = atMinutesOf(d, s);
    let endsAt = e == null ? null : atMinutesOf(d, e);
    // An end time earlier than the start runs past midnight.
    if (endsAt && endsAt < startsAt) endsAt = new Date(endsAt.getTime() + 86400000);
    setBusy(true);
    setError(null);
    try {
      await saveAgendaItem(event.id, item?.id ?? null, {
        kind, title: title.trim(), starts_at: startsAt.toISOString(), ends_at: endsAt?.toISOString() ?? null, place, details,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save it.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!(await confirmAsync(t('Remove From the Agenda?'), `“${item.title}” comes off the agenda for everyone.`, t('Remove'), t('Keep')))) return;
    setBusy(true);
    try {
      await deleteAgendaItem(item.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t remove it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={item ? 'Edit Agenda Item' : 'Add to the Agenda'}
      footer={<Button title={item ? 'Save' : 'Add to the Agenda'} big loading={busy} onPress={save} />}>
      <Choice<AgendaKind> label={t('What Is It')} options={AGENDA_KINDS.map((k) => ({ value: k.kind, label: k.label }))} value={kind} onChange={setKind} />
      <Field label={t('Name')} value={title} onChangeText={setTitle} maxLength={100} placeholder={t('Poker Run, Raffle Drawing, Live Music')} />
      {days.length > 1 ? (
        <Choice<number> label={t('Day')} options={days.map((d, i) => ({ value: i, label: dayChip(d) }))} value={day} onChange={setDay} />
      ) : null}
      <TimePicker label={t('Starts At')} value={start} onChange={setStart} suggest={10 * 60} />
      <TimePicker label={t('Ends At')} value={end} onChange={setEnd} optional suggest={(parseTime(start) ?? 600) + 120} />
      <Field label={t('Where (Optional)')} value={place} onChangeText={setPlace} maxLength={120} placeholder={t('Main stage, arena gate, vendor row')} />
      <Field label={t('Details (Optional)')} value={details} onChangeText={setDetails} multiline maxLength={1000} placeholder={t('Prizes, entry, what to bring')} />
      <ErrorText error={error} />
      {item ? <Button title={t('Remove From the Agenda')} kind="ghost" onPress={remove} /> : null}
    </BottomSheet>
  );
}

function dayIndex(days: Date[], iso: string): number {
  const d = new Date(iso).toDateString();
  const i = days.findIndex((x) => x.toDateString() === d);
  return i < 0 ? 0 : i;
}

/** Add a Ride: one of the rides you organize, or a new one made for this event. */
export function AddRideSheet({
  event, rides, visible, onClose, onAdded,
}: { event: EventDetail; rides: LinkableRide[] | null; visible: boolean; onClose: () => void; onAdded: () => void }) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(r: LinkableRide) {
    setBusy(r.ride_id);
    setError(null);
    try {
      await linkRide(event.id, r.ride_id, label);
      setLabel('');
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add the ride.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('Add a Group Ride')}>
      <Button
        title={t('Create a New Ride for This Event')}
        onPress={() => {
          onClose();
          router.push(`/ride/new?type=public&event=${event.id}`);
        }}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('Or add a ride you already organize. Everyone who opens the event sees it and can join (a private ride stays invite only).')}
      </ThemedText>
      <Field label={t('Label (Optional)')} value={label} onChangeText={setLabel} maxLength={60} placeholder={t('Day 1: Easy Group, Saturday Night Run')} />
      {rides == null ? (
        <ThemedText themeColor="textSecondary">{t('Loading your rides…')}</ThemedText>
      ) : rides.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('You don’t organize any upcoming rides that aren’t already in an event.')}</ThemedText>
      ) : (
        <View style={styles.list}>
          {rides.map((r, i) => (
            <Pressable
              key={r.ride_id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${r.name}`}
              disabled={!!busy}
              onPress={() => add(r)}
              style={({ pressed }) => [styles.row, i > 0 && styles.rule, pressed && { backgroundColor: Colors.backgroundSelected }]}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{r.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {when(r.meet_at)}{r.visibility === 'private' ? ', Private' : ''}{r.meet_area_label ? `, ${r.meet_area_label}` : ''}
                </ThemedText>
              </View>
              <Icon name={busy === r.ride_id ? 'clock' : 'plus'} size={20} color={Colors.sky} />
            </Pressable>
          ))}
        </View>
      )}
      <ErrorText error={error} />
    </BottomSheet>
  );
}

const styles = themedStyles(() => ({
  list: { backgroundColor: Colors.background, borderRadius: Radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
}));
