import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { MeetPointMap } from '@/components/meet-point-map';
import { PlaceSearch } from '@/components/place-search';
import { RideDatePicker } from '@/components/ride-date-picker';
import { ThemedText } from '@/components/themed-text';
import { TimePicker } from '@/components/time-picker';
import { Button, Card, Choice, ErrorText, Field, MultiChoice, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import { stateByCode, US_STATES } from '@/core/discovery';
import { placeLabel, type Place } from '@/core/places';
import {
  canEditRide, canEditWhenAndWhere, changeLabel, formFromRide, isEmptyPatch, parseCoords, ridePatch, VEHICLE_TYPES, type RideEditForm,
} from '@/core/ride-edit';
import { parseTime, shiftClock } from '@/core/time';
import { useLayout } from '@/hooks/use-layout';
import { editRide, getMembers, getPrivateDetails, getRide } from '@/lib/api';
import { currentNotificationSettings } from '@/lib/notification-settings';
import { syncRideReminders } from '@/lib/push';
import { currentPosition, stateAt } from '@/lib/location';
import { useSession } from '@/lib/session';
import type { Ride, RidePrivateDetails } from '@/lib/types';

import { t } from '@/lib/i18n';
/**
 * Edit Ride Details: the ride's leader or a co-leader changes the name, day and times, meeting
 * point and the rest after creating it. Same screen on iPhone, iPad, Android and the website.
 * Phones get one column; a tablet or wide window puts When and Where beside the details. The
 * rules (what can change once the ride is live, what gets saved, what riders are told) are in
 * core/ride-edit.ts.
 */
export default function EditRide() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const layout = useLayout();
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);
  const [details, setDetails] = useState<RidePrivateDetails | null>(null);
  const [manager, setManager] = useState(false);
  const [form, setForm] = useState<RideEditForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !me) return;
    (async () => {
      const r = await getRide(id);
      if (!r) return setRide(null);
      const [d, members] = await Promise.all([getPrivateDetails(r.id), getMembers(r.id)]);
      const mine = members.find((m) => m.user_id === me);
      setManager(r.organizer_id === me || (mine?.status === 'joined' && mine.role === 'co_organizer'));
      setRide(r);
      setDetails(d);
      setForm(formFromRide(r, d));
    })().catch((e) => setError(e instanceof Error ? e.message : t('Could not load the ride.')));
  }, [id, me]);

  const set = <K extends keyof RideEditForm>(key: K, value: RideEditForm[K]) =>
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [key]: value };
      // On a ride whose spot never saved, instructions go up with the spot and the box shows once
      // one is picked; clearing the spot clears them too, rather than dropping them quietly on save.
      if (key === 'coords' && !details && !parseCoords(String(value))) next.instructions = '';
      return next;
    });

  // What saving would do right now, worked out as the leader types.
  const preview = useMemo(() => (ride && form ? ridePatch(ride, details, form, new Date()) : null), [ride, details, form]);

  if (ride === undefined || !form) {
    return (
      <Screen>
        {error ? <ErrorText error={error} /> : <ThemedText themeColor="textSecondary">{t('Loading…')}</ThemedText>}
      </Screen>
    );
  }
  if (ride === null) return <Screen><ThemedText>{t('We couldn’t find that ride.')}</ThemedText></Screen>;
  if (!canEditRide(ride.status, manager)) {
    return (
      <Screen width="readable">
        <ThemedText type="heading">{manager ? (ride.status === 'ended' ? t('This Ride Has Ended') : t('This Ride Has Been Cancelled')) : t('Only the Ride’s Leaders Can Edit It')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {manager ? t('Its details stay as they were. Copy it from the ride page to plan the next one.') : t('Ask the leader to make the change.')}
        </ThemedText>
        <Button title={t('Back to the Ride')} kind="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const whenWhere = canEditWhenAndWhere(ride.status);
  const spot = parseCoords(form.coords);
  const instructionsShown = !!(details || (whenWhere && spot));

  async function pickPlace(p: Place) {
    set('coords', `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    if (p.kind !== 'Coordinates') set('meetLabel', placeLabel(p));
    if (ride?.visibility === 'public') set('meetState', p.state ?? (await stateAt(p)));
  }
  async function pickOnMap(p: { lat: number; lng: number }) {
    set('coords', `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    if (ride?.visibility === 'public') set('meetState', await stateAt(p));
  }
  async function useMyLocation() {
    try {
      const p = await currentPosition();
      await pickOnMap(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not get your location.'));
    }
  }

  async function save() {
    if (!ride || !form) return;
    setError(null);
    const patch = ridePatch(ride, details, form, new Date());
    if ('error' in patch) return setError(patch.error);
    if (isEmptyPatch(patch)) return router.back();
    setBusy(true);
    try {
      await editRide(ride.id, patch);
      // A new time moves this phone's ride reminders too (other riders' phones catch up when they open the app).
      if (patch.changed.includes('time')) syncRideReminders(currentNotificationSettings().reminder_minutes);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save the ride.'));
      setBusy(false);
    }
  }

  const when = whenWhere ? (
    <Card>
      <ThemedText type="heading">{t('When')}</ThemedText>
      <RideDatePicker value={form.day} onChange={(d) => set('day', d)} />
      <TimePicker label={t('Meet At')} value={form.meetTime} onChange={(v) => set('meetTime', v)} />
      <TimePicker
        label={t('Departure Time (Optional)')}
        value={form.departTime}
        onChange={(v) => set('departTime', v)}
        optional
        suggest={shiftClock(parseTime(form.meetTime) ?? 8 * 60, 30)}
      />
      <TimePicker
        label={t('Expected Finish (Optional)')}
        value={form.finishTime}
        onChange={(v) => set('finishTime', v)}
        optional
        suggest={shiftClock(parseTime(form.meetTime) ?? 8 * 60, 8 * 60)}
      />
    </Card>
  ) : (
    <Locked title={t('The Ride Is Live')}>
      {t('The day, times and meeting point stay as they are while everyone is out riding. The name and details below can still change.')}
    </Locked>
  );

  const where = whenWhere ? (
    <Card>
      <ThemedText type="heading">{t('Meeting Point')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('Only joined riders see the exact spot. Public pages show the area within about a mile.')}
      </ThemedText>
      <PlaceSearch label={t('Search a Place or Address')} near={spot} onPick={pickPlace} />
      <MeetPointMap value={spot} onPick={pickOnMap} />
      <Button title={t('Use My Current Location')} kind="secondary" onPress={useMyLocation} />
      <Field label={t('Coordinates')} value={form.coords} onChangeText={(v) => set('coords', v)} placeholder="38.57330, -109.54980" autoCapitalize="none" />
      <Field label={t('Place Name')} value={form.meetLabel} onChangeText={(v) => set('meetLabel', v)} placeholder={t('Gas station on Main St, Moab, UT')} />
      {ride.visibility === 'public' ? (
        <Choice
          label={form.meetState ? t('Listed in {v}', { v: stateByCode(form.meetState)?.name ?? form.meetState }) : t('State')}
          value={form.meetState}
          onChange={(v) => set('meetState', v)}
          options={US_STATES.map((st) => ({ value: st.code, label: st.code }))}
        />
      ) : null}
    </Card>
  ) : null;

  const rest = (
    <>
      <Card>
        <ThemedText type="heading">{t('About the Ride')}</ThemedText>
        <Field label={t('Description')} value={form.description} onChangeText={(v) => set('description', v)} multiline />
        <PlaceSearch label={t('Search a Destination')} onPick={(p) => set('destination', placeLabel(p))} />
        <Field label={t('Destination')} value={form.destination} onChangeText={(v) => set('destination', v)} placeholder={t('Trailhead, town or street address')} />
        <Field
          label={t('Route Length (Miles)')}
          value={form.routeMiles}
          onChangeText={(v) => set('routeMiles', v)}
          keyboardType="decimal-pad"
          hint={t('Used to warn riders whose fuel range is too short.')}
        />
        <Choice
          label={t('Difficulty')}
          value={form.difficulty}
          onChange={(v) => set('difficulty', v)}
          options={[{ value: 'easy', label: t('Easy') }, { value: 'moderate', label: t('Moderate') }, { value: 'hard', label: t('Hard') }, { value: 'extreme', label: t('Extreme') }]}
        />
        <Choice
          label={t('Experience')}
          value={form.experience}
          onChange={(v) => set('experience', v)}
          options={[{ value: 'beginner', label: t('Beginner') }, { value: 'intermediate', label: t('Intermediate') }, { value: 'advanced', label: t('Advanced') }, { value: 'expert', label: t('Expert') }]}
        />
      </Card>
      <Card>
        <ThemedText type="heading">{t('Who’s Riding')}</ThemedText>
        <MultiChoice label={t('Vehicles Welcome')} options={VEHICLE_TYPES} value={form.vehicleTypes} onChange={(v) => set('vehicleTypes', v)} />
        {ride.visibility === 'public' ? (
          <Choice
            label={t('Joining')}
            value={form.joinPolicy}
            onChange={(v) => set('joinPolicy', v)}
            options={[{ value: 'open', label: t('Anyone Can Join') }, { value: 'approval', label: t('I Approve Riders') }]}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field label={t('Max Vehicles')} value={form.maxVehicles} onChangeText={(v) => set('maxVehicles', v)} keyboardType="number-pad" placeholder={t('No limit')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('Max Riders')} value={form.maxRiders} onChangeText={(v) => set('maxRiders', v)} keyboardType="number-pad" placeholder={t('No limit')} />
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary">{t('Lowering a limit never removes anyone who already joined.')}</ThemedText>
      </Card>
      <Card>
        <ThemedText type="heading">{t('Bring and Know')}</ThemedText>
        <Field label={t('What to Bring')} value={form.whatToBring} onChangeText={(v) => set('whatToBring', v)} multiline />
        <Field label={t('Required Equipment')} value={form.requiredEquipment} onChangeText={(v) => set('requiredEquipment', v)} multiline placeholder={t('Whip flag, helmet, spare belt')} />
        <Field label={t('Fuel')} value={form.fuelNotes} onChangeText={(v) => set('fuelNotes', v)} placeholder={t('Full tank, no gas on the trail')} />
        {instructionsShown ? (
          <Field label={t('Instructions for Joined Riders')} value={form.instructions} onChangeText={(v) => set('instructions', v)} multiline />
        ) : null}
      </Card>
    </>
  );

  const saveBar = <SaveBar preview={preview} live={!whenWhere} busy={busy} error={error} onSave={save} />;
  const name = <Field label={t('Ride Name')} value={form.name} onChangeText={(v) => set('name', v)} maxLength={120} />;

  // A tablet or wide window: When and Where on the left, the rest beside it, the save bar under both.
  if (layout.expanded) {
    return (
      <Screen width="wide">
        {name}
        <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: Spacing.three }}>
            {when}
            {where}
          </View>
          <View style={{ flex: 1, gap: Spacing.three }}>{rest}</View>
        </View>
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>{saveBar}</View>
      </Screen>
    );
  }
  return (
    <Screen width="readable">
      {name}
      {when}
      {where}
      {rest}
      {saveBar}
    </Screen>
  );
}

/**
 * The bottom of the form: what saving changes and who hears about it, in words, before the leader
 * taps Save. A new time or meeting point notifies everyone on the ride; other details don't.
 */
function SaveBar({
  preview, live, busy, error, onSave,
}: {
  preview: ReturnType<typeof ridePatch> | null;
  live: boolean;
  busy: boolean;
  error: string | null;
  onSave: () => void;
}) {
  const patch = preview && !('error' in preview) ? preview : null;
  const label = patch ? changeLabel(patch.changed) : null;
  const tells = !live && !!patch && (patch.changed.includes('time') || patch.changed.includes('place'));
  return (
    <View style={{ gap: Spacing.two }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          gap: 2, padding: 12, borderRadius: Radius.card, borderLeftWidth: 4,
          borderLeftColor: label ? (tells ? Colors.accent : Colors.sky) : Colors.border,
          backgroundColor: label ? withAlpha(tells ? Colors.accent : Colors.sky, 0.1) : Colors.backgroundElement,
        }}>
        <ThemedText style={{ fontWeight: 700 }}>{label ?? t('No Changes Yet')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {!label
            ? t('Change anything above, then save. Riders see the new details right away.')
            : tells
              ? t('Everyone on the ride gets a notification, and the ride page shows what changed.')
              : t('No notification for this. Riders see it on the ride page, marked Updated.')}
        </ThemedText>
      </View>
      <ErrorText error={error} />
      <Button title={t('Save Changes')} big loading={busy} disabled={!label && !error} onPress={onSave} />
      <Button title={t('Cancel')} kind="ghost" disabled={busy} onPress={() => router.back()} />
    </View>
  );
}

function Locked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 2, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderLeftWidth: 4, borderLeftColor: Colors.accent }}>
      <ThemedText style={{ fontWeight: 700 }}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{children}</ThemedText>
    </View>
  );
}
