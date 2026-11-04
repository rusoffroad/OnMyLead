import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { EventOrRide } from '@/components/events/event-or-ride';
import { ThemedText } from '@/components/themed-text';
import { MeetPointMap } from '@/components/meet-point-map';
import { PlaceSearch } from '@/components/place-search';
import { RideDatePicker } from '@/components/ride-date-picker';
import { TimePicker } from '@/components/time-picker';
import { codeCheckOk, ShareCodeField, type CodeCheck } from '@/components/share-code-field';
import { Button, Card, Choice, ErrorText, Field, MultiChoice, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import type { BubblePreset } from '@/core/bubble';
import { rideAllowanceText, type FeatureKey } from '@/core/entitlements';
import { stateByCode, US_STATES } from '@/core/discovery';
import type { JoinPolicy } from '@/core/joining';
import { placeLabel, type Place } from '@/core/places';
import type { RideRoute } from '@/core/route';
import { trailAsRoute } from '@/core/nav-trails';
import { VEHICLE_TYPES } from '@/core/ride-edit';
import { inches } from '@/core/trail-width';
import { RigFitLine, WidthIcon } from '@/components/trail-width-row';
import { useGarageWidths } from '@/lib/trail-width';
import { metersToMiles } from '@/core/geo';
import { getLocalTrail, loadTrails, trailLine } from '@/lib/nav-trails';
import { atMinutes as at, canRideOn, nextWeekday, startOfDay } from '@/core/calendar';
import { clockText, parseTime, shiftClock } from '@/core/time';
import { cleanShareCode, friendlyShareCodeError } from '@/core/share-code';
import { createRide, getPrivateDetails, getRide, getRideRoute, saveRideRoute } from '@/lib/api';
import { linkRide } from '@/lib/events';
import { useEntitlements } from '@/lib/entitlements';
import { inviteGroupToRide, myGroups, type RidingGroup } from '@/lib/groups';
import { currentPosition, stateAt } from '@/lib/location';
import { useSession } from '@/lib/session';
import { handleProError, requirePro } from '@/lib/pro';
import { ProTag } from '@/components/pro-tag';

import { t as tr } from '@/lib/i18n';


const toInt = (s: string) => (s.trim() ? Math.max(1, parseInt(s, 10)) || null : null);

type Kind = 'public' | 'private';
type RoutePlan = 'mapped' | 'freeride';

export default function NewRide() {
  const { type, copy, trail, group, event } = useLocalSearchParams<{ type?: string; copy?: string; trail?: string; group?: string; event?: string }>();
  const { session, loading } = useSession();
  const { ent } = useEntitlements();
  const allowance = rideAllowanceText(ent);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [day, setDay] = useState<number>(() => startOfDay(new Date()).getTime());
  const [meetTime, setMeetTime] = useState('8:00 am');
  const [departTime, setDepartTime] = useState('');
  const [finishTime, setFinishTime] = useState('');
  const [meetLabel, setMeetLabel] = useState('');
  const [coords, setCoords] = useState('');
  const [destination, setDestination] = useState('');
  const [vehicleTypes, setVehicleTypes] = useState<string[]>(['SXS/UTV']);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [experience, setExperience] = useState<string | null>(null);
  const [maxVehicles, setMaxVehicles] = useState('');
  const [maxRiders, setMaxRiders] = useState('');
  const [routeMiles, setRouteMiles] = useState('');
  const [whatToBring, setWhatToBring] = useState('');
  const [requiredEquipment, setRequiredEquipment] = useState('');
  const [fuelNotes, setFuelNotes] = useState('');
  const [instructions, setInstructions] = useState('');
  const [kind, setKind] = useState<Kind | null>(type === 'public' || type === 'private' ? type : null);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [meetState, setMeetState] = useState<string | null>(null);
  const [pickingState, setPickingState] = useState(false);
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>('open');
  const [bubble, setBubble] = useState<BubblePreset>('default');
  const [more, setMore] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [codeCheck, setCodeCheck] = useState<CodeCheck>('empty');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<RidingGroup[]>([]);
  const [groupNames, setGroupNames] = useState<string[]>([]);

  /** Ride Again: the ride this one copies, and its route, which comes along when the new ride is saved. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [copiedRoute, setCopiedRoute] = useState<RideRoute | null>(null);

  useEffect(() => {
    if (!copy) return;
    (async () => {
      const src = await getRide(copy);
      if (!src) return;
      const [details, route] = await Promise.all([getPrivateDetails(src.id), getRideRoute(src.id).then((r) => r.route).catch(() => null)]);
      const clockOf = (iso: string | null) => (iso ? clockText(new Date(iso)) : '');
      setName(src.name);
      // The next one on the same weekday: a Saturday ride stays a Saturday ride.
      setDay(nextWeekday(new Date(), new Date(src.meet_at).getDay()).getTime());
      setDescription(src.description ?? '');
      setMeetTime(clockOf(src.meet_at));
      setDepartTime(clockOf(src.depart_at));
      setFinishTime(clockOf(src.expected_finish_at));
      setDestination(src.destination_label ?? '');
      setVehicleTypes(src.vehicle_types);
      setDifficulty(src.difficulty);
      setExperience(src.experience_level);
      setMaxVehicles(src.max_vehicles ? String(src.max_vehicles) : '');
      setMaxRiders(src.max_riders ? String(src.max_riders) : '');
      setRouteMiles(src.route_miles ? String(src.route_miles) : '');
      setWhatToBring(src.what_to_bring ?? '');
      setRequiredEquipment(src.required_equipment ?? '');
      setFuelNotes(src.fuel_notes ?? '');
      setKind(src.visibility === 'private' ? 'private' : 'public');
      setJoinPolicy(src.join_policy);
      if (src.bubble_preset !== 'custom') setBubble(src.bubble_preset);
      setMeetState(src.meet_state ?? null);
      setRoutePlan(route ? 'mapped' : src.freeride ? 'freeride' : null);
      if (details) {
        setCoords(`${details.meet_lat.toFixed(5)}, ${details.meet_lng.toFixed(5)}`);
        setMeetLabel(details.meet_label ?? '');
        setInstructions(details.instructions ?? '');
      }
      setCopiedRoute(route);
      setCopiedFrom(src.name);
      setMore(true);
    })().catch((e) => setError(e instanceof Error ? e.message : tr('Could not copy that ride.')));
  }, [copy]);

  // Plan a Group Ride on This Trail (Map Mode): the trail becomes the route, its start the meeting point.
  const [fromTrail, setFromTrail] = useState<string | null>(null);
  const [trailWidth, setTrailWidth] = useState<number | null>(null);
  const garage = useGarageWidths();
  useEffect(() => {
    if (!trail) return;
    loadTrails().then(() => {
      const t = getLocalTrail(trail);
      if (!t) return;
      const route = trailAsRoute(trailLine(t), t.details.name || null);
      const start = route.points[0];
      setName((n) => n || t.details.name);
      setRoutePlan('mapped');
      setCopiedRoute(route);
      setRouteMiles((m) => m || String(Math.round(metersToMiles(route.lengthM) * 10) / 10));
      if (start) setCoords((c) => c || `${start.lat.toFixed(5)}, ${start.lng.toFixed(5)}`);
      setFromTrail(t.details.name || 'Your Trail');
      setTrailWidth(t.details.maxWidthIn);
      // Riders who join see the limit in the ride's instructions.
      if (t.details.maxWidthIn != null) {
        const note = tr('Trail width limit: {v}. Wider machines won’t fit.', { v: inches(t.details.maxWidthIn) });
        setInstructions((v) => (v.includes('width limit') ? v : v ? `${v}\n${note}` : note));
        setMore(true);
      }
    });
  }, [trail]);

  // Riding groups to invite as soon as the ride exists (none until groups are switched on).
  useEffect(() => {
    myGroups()
      .then((all) => {
        setGroups(all);
        // Plan a Group Ride on the home screen's group card: that group comes ticked.
        const picked = group ? all.find((g) => g.id === group) : undefined;
        if (picked) setGroupNames((names) => (names.includes(picked.name) ? names : [...names, picked.name]));
      })
      .catch(() => setGroups([]));
  }, [group]);

  const parsedCoords = coords.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);

  async function useMyLocation() {
    try {
      const p = await currentPosition();
      setCoords(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
      setMeetState(await stateAt(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not get your location.'));
    }
  }

  async function pickPlace(p: Place) {
    setCoords(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    if (p.kind !== 'Coordinates') setMeetLabel(placeLabel(p));
    setMeetState(p.state ?? (await stateAt(p)));
  }

  async function pickOnMap(p: { lat: number; lng: number }) {
    setCoords(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    setMeetState(await stateAt(p));
  }

  async function fillStateFromCoords() {
    if (parsedCoords) setMeetState(await stateAt({ lat: Number(parsedCoords[1]), lng: Number(parsedCoords[2]) }));
  }

  async function submit() {
    setError(null);
    const dayDate = new Date(day);
    const meetAt = at(dayDate, parseTime(meetTime));
    if (!kind) return setError(tr('Pick Public or Private at the top.'));
    if (!name.trim()) return setError(tr('Give the ride a name.'));
    if (!meetAt) return setError(tr('Pick a meeting time.'));
    if (!canRideOn(dayDate, new Date())) return setError(tr('Pick a day from today up to three years out.'));
    if (!parsedCoords) return setError(tr('Set the meeting point: search a place, use your location or paste coordinates like "38.57, -109.55".'));
    if (!routePlan) return setError(tr('Pick Mapped or Freeride under The Route.'));
    if (!codeCheckOk(codeCheck)) return setError(codeCheck === 'checking' ? tr('Checking your invite code. Try again in a second.') : tr('Pick a different invite code, or clear it to get one made for you.'));
    setBusy(true);
    try {
      const lat = Number(parsedCoords[1]);
      const lng = Number(parsedCoords[2]);
      const ride = await createRide({
        name: name.trim(),
        description,
        meetAt,
        departAt: departTime ? at(dayDate, parseTime(departTime)) : null,
        expectedFinishAt: finishTime ? at(dayDate, parseTime(finishTime)) : null,
        meetLat: lat,
        meetLng: lng,
        meetLabel,
        meetState: meetState ?? (await stateAt({ lat, lng })),
        destinationLabel: destination,
        instructions,
        vehicleTypes,
        difficulty,
        experienceLevel: experience,
        maxVehicles: toInt(maxVehicles),
        maxRiders: toInt(maxRiders),
        routeMiles: routeMiles ? Number(routeMiles) : null,
        whatToBring,
        requiredEquipment,
        fuelNotes,
        visibility: kind,
        // A private ride's invite code is the invitation, so anyone holding it can join.
        joinPolicy: kind === 'private' ? 'open' : joinPolicy,
        bubblePreset: bubble,
        freeride: routePlan === 'freeride',
        inviteCode: cleanShareCode(inviteCode) || null,
      });
      // A group that fails to invite can be invited again from the ride page.
      for (const g of groups.filter((x) => groupNames.includes(x.name))) {
        await inviteGroupToRide(ride.id, g.id).catch(() => {});
      }
      // Create a Ride from an event's Group Rides: the new ride joins that event (it can be added later if this fails).
      if (event) await linkRide(event, ride.id).catch(() => {});
      // Ride Again brings the old route along; if it can't save, the leader lands in the builder instead.
      const routeCopied = routePlan === 'mapped' && copiedRoute ? await saveRideRoute(ride.id, copiedRoute).then(() => true, () => false) : false;
      router.replace(`/r/${ride.invite_code}?new=1`);
      // A mapped ride goes straight to the route builder; saving it lands back on the new ride.
      if (routePlan === 'mapped' && !routeCopied) router.push(`/ride/${ride.id}/route`);
    } catch (e) {
      if (!handleProError(e)) setError(e instanceof Error ? friendlyShareCodeError(e.message, 'ride') : tr('Could not create the ride.'));
    } finally {
      setBusy(false);
    }
  }

  // Someone who opens onmylead.com/ride/new signed out signs in first, then comes straight back here.
  if (Platform.OS === 'web' && !loading && !session) return <Redirect href="/sign-in?next=/ride/new" />;

  return (
    <Screen width="readable">
      {Platform.OS === 'web' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {tr('Plan it here on the big screen. The ride, its route and its stops show up in the OnMyLead app on your iPhone as soon as you save.')}
        </ThemedText>
      ) : null}
      {copiedFrom ? (
        <View style={{ gap: 2, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderLeftWidth: 4, borderLeftColor: Colors.sky }}>
          <ThemedText style={{ fontWeight: 700 }}>{tr('Riding {copiedFrom} Again', { copiedFrom })}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {copiedRoute
              ? tr('The details, meeting point and route are filled in. Pick the day, check the times and create it.')
              : tr('The details and meeting point are filled in. Pick the day, check the times and create it.')}
          </ThemedText>
        </View>
      ) : null}
      {fromTrail ? (
        <View style={{ gap: 2, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderLeftWidth: 4, borderLeftColor: Colors.sky }}>
          <ThemedText style={{ fontWeight: 700 }}>{tr('Riding {fromTrail}', { fromTrail })}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {tr('The trail is the route, and its start is the meeting point. Change anything, pick the day and create it.')}
          </ThemedText>
          {trailWidth != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <WidthIcon />
              <ThemedText style={{ fontWeight: 700 }}>{tr('{v} Width Limit', { v: inches(trailWidth) })}</ThemedText>
            </View>
          ) : null}
          <RigFitLine limitIn={trailWidth} garage={garage} />
        </View>
      ) : null}
      {event ? (
        <View style={{ gap: 2, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderLeftWidth: 4, borderLeftColor: Colors.accent }}>
          <ThemedText style={{ fontWeight: 700 }}>{tr('For Your Event')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {tr('Once it’s created, this ride shows under the event’s Group Rides.')}
          </ThemedText>
        </View>
      ) : null}
      {allowance ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement }}>
          <ThemedText type="small" style={{ flex: 1, fontWeight: 600 }}>{allowance}</ThemedText>
          <Pressable accessibilityRole="link" onPress={() => router.push('/pro')} hitSlop={8}>
            <ThemedText type="linkPrimary">{tr('Unlimited With Pro')}</ThemedText>
          </Pressable>
        </View>
      ) : null}
      {!event ? <EventOrRide from="create-ride" /> : null}
      <ThemedText type="heading">{tr('What Kind of Ride?')}</ThemedText>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <KindCard
          title={tr('Public')}
          detail={tr('Open to anyone. Found by riders near you or in your state.')}
          on={kind === 'public'}
          onPress={() => setKind('public')}
        />
        <KindCard
          title={tr('Private')}
          detail={tr('Only friends you invite by link, text or email.')}
          on={kind === 'private'}
          onPress={() => setKind('private')}
        />
      </View>

      <Field label={tr('Ride Name')} value={name} onChangeText={setName} placeholder={tr('Saturday Hell\'s Revenge run')} />

      <Card>
        <ThemedText type="heading">{tr('When')}</ThemedText>
        <RideDatePicker value={day} onChange={setDay} />
        <TimePicker label={tr('Meet At')} value={meetTime} onChange={setMeetTime} />
      </Card>

      <Card>
        <ThemedText type="heading">{tr('Meeting Point')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {tr('Only joined riders see the exact spot. Public pages show the area within about a mile.')}
        </ThemedText>
        <PlaceSearch label={tr('Search a Place or Address')} onPick={pickPlace} />
        <MeetPointMap value={parsedCoords ? { lat: Number(parsedCoords[1]), lng: Number(parsedCoords[2]) } : null} onPick={pickOnMap} />
        <Button title={tr('Use My Current Location')} kind="secondary" onPress={useMyLocation} />
        <Field label={tr('Coordinates')} value={coords} onChangeText={setCoords} onEndEditing={fillStateFromCoords} placeholder="38.57330, -109.54980" autoCapitalize="none" />
        <Field label={tr('Place Name')} value={meetLabel} onChangeText={setMeetLabel} placeholder={tr('Gas station on Main St, Moab, UT')} />
        {kind === 'public' ? (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{tr('State')}</ThemedText>
            <ThemedText>
              {meetState ? tr('Listed in {name}.', { name: stateByCode(meetState)?.name }) : tr('Set the meeting point and we fill this in, or pick it.')}
            </ThemedText>
            {meetState && !pickingState ? (
              <Button title={tr('Change State')} kind="ghost" onPress={() => setPickingState(true)} />
            ) : (
              <Choice
                value={meetState}
                onChange={(c) => {
                  setMeetState(c);
                  setPickingState(false);
                }}
                options={US_STATES.map((st) => ({ value: st.code, label: st.name }))}
              />
            )}
          </View>
        ) : null}
      </Card>

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="heading">{tr('The Route')}</ThemedText>
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <KindCard
            title={tr('Mapped')}
            detail={tr('Draw the route or import a GPX next. Riders follow it in Ride Mode.')}
            on={routePlan === 'mapped'}
            onPress={() => requirePro('route_builder') && setRoutePlan('mapped')}
            pro="route_builder"
          />
          <KindCard
            title={tr('Freeride')}
            detail={tr('No set route. Everyone follows the leader.')}
            on={routePlan === 'freeride'}
            onPress={() => setRoutePlan('freeride')}
          />
        </View>
      </View>

      <Card>
        <ThemedText type="heading">{tr('Who’s Riding')}</ThemedText>
        <MultiChoice label={tr('Vehicles Welcome')} options={VEHICLE_TYPES} value={vehicleTypes} onChange={setVehicleTypes} />
        {kind === 'public' ? (
          <Choice
            label={tr('Joining')}
            value={joinPolicy}
            onChange={setJoinPolicy}
            options={[
              { value: 'open', label: tr('Anyone Can Join') },
              { value: 'approval', label: tr('I Approve Riders') },
            ]}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field label={tr('Max Vehicles')} value={maxVehicles} onChangeText={setMaxVehicles} keyboardType="number-pad" placeholder={tr('No limit')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={tr('Max Riders')} value={maxRiders} onChangeText={setMaxRiders} keyboardType="number-pad" placeholder={tr('No limit')} />
          </View>
        </View>
      </Card>

      <Card>
        <ThemedText type="heading">{tr('Invite Code')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{tr('Riders open the ride with its link, QR code or this code. Leave it empty and OnMyLead makes one, or type your own so it’s easy to say out loud.{v}', { v: kind === 'private' ? ` ${tr('Anyone with the code can join, so pick one that’s hard to guess.')}` : '' })}</ThemedText>
        <ShareCodeField kind="ride" label={tr('Your Own Code (Optional)')} value={inviteCode} onChange={setInviteCode} onCheck={setCodeCheck} />
      </Card>

      {groups.length ? (
        <Card>
          <ThemedText type="heading">{tr('Invite a Group')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {tr('Everyone in the groups you pick gets a notification and sees the ride on their home screen. They join with one tap.')}
          </ThemedText>
          <MultiChoice label={tr('Your Riding Groups')} options={[...new Set(groups.map((g) => g.name))]} value={groupNames} onChange={setGroupNames} />
        </Card>
      ) : null}

      <Button title={more ? tr('Fewer Details') : tr('Add Route, Difficulty and More')} kind="ghost" onPress={() => setMore(!more)} />
      {more ? (
        <Card>
          <Field label={tr('Description')} value={description} onChangeText={setDescription} multiline />
          <TimePicker
            label={tr('Departure Time (Optional)')}
            value={departTime}
            onChange={setDepartTime}
            optional
            suggest={shiftClock(parseTime(meetTime) ?? 8 * 60, 30)}
          />
          <TimePicker
            label={tr('Expected Finish (Optional)')}
            value={finishTime}
            onChange={setFinishTime}
            optional
            suggest={shiftClock(parseTime(meetTime) ?? 8 * 60, 8 * 60)}
          />
          <PlaceSearch label={tr('Search a Destination')} onPick={(p) => setDestination(placeLabel(p))} />
          <Field
            label={tr('Destination')}
            value={destination}
            onChangeText={setDestination}
            placeholder={tr('Trailhead, town or street address')}
            hint={tr('Anyone who can see the ride sees this. Riders get directions to it in Apple Maps or Google Maps.')}
          />
          <Field label={tr('Route Length (Miles)')} value={routeMiles} onChangeText={setRouteMiles} keyboardType="decimal-pad" hint={tr('Used to warn riders whose fuel range is too short.')} />
          <Choice
            label={tr('Difficulty')}
            value={difficulty}
            onChange={setDifficulty}
            options={[{ value: 'easy', label: tr('Easy') }, { value: 'moderate', label: tr('Moderate') }, { value: 'hard', label: tr('Hard') }, { value: 'extreme', label: tr('Extreme') }]}
          />
          <Choice
            label={tr('Experience')}
            value={experience}
            onChange={setExperience}
            options={[{ value: 'beginner', label: tr('Beginner') }, { value: 'intermediate', label: tr('Intermediate') }, { value: 'advanced', label: tr('Advanced') }, { value: 'expert', label: tr('Expert') }]}
          />
          <Field label={tr('What to Bring')} value={whatToBring} onChangeText={setWhatToBring} multiline />
          <Field label={tr('Required Equipment')} value={requiredEquipment} onChangeText={setRequiredEquipment} multiline placeholder={tr('Whip flag, helmet, spare belt')} />
          <Field label={tr('Fuel')} value={fuelNotes} onChangeText={setFuelNotes} placeholder={tr('Full tank, no gas on the trail')} />
          <Field label={tr('Instructions for Joined Riders')} value={instructions} onChangeText={setInstructions} multiline />
          <Choice
            label={tr('Ride Bubble')}
            value={bubble}
            onChange={setBubble}
            options={[
              { value: 'default', label: tr('Standard') },
              { value: 'tight_trail', label: tr('Tight Trail') },
              { value: 'desert', label: tr('Desert') },
              { value: 'highway', label: tr('Highway') },
            ]}
          />
        </Card>
      ) : null}

      <ErrorText error={error} />
      <Button
        title={kind === 'public' ? tr('Create Public Ride') : kind === 'private' ? tr('Create Private Ride') : tr('Create Ride')}
        big
        loading={busy}
        onPress={submit}
      />
    </Screen>
  );
}

/** One of two choices (Public or Private, Mapped or Freeride): a big tappable card, outlined in red when picked. */
function KindCard({ title, detail, on, onPress, pro }: { title: string; detail: string; on: boolean; onPress: () => void; pro?: FeatureKey }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        flex: 1, gap: Spacing.one, padding: Spacing.three, minHeight: 128, borderRadius: Radius.card, borderWidth: 2,
        borderColor: on ? Colors.accent : 'transparent', backgroundColor: on ? withAlpha(Colors.accent, 0.14) : Colors.backgroundElement,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ThemedText type="subtitle" style={{ fontSize: 30, lineHeight: 32 }}>{title}</ThemedText>
        {pro ? <ProTag feature={pro} /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
    </Pressable>
  );
}
