import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MeetPointMap } from '@/components/meet-point-map';
import { PlaceSearch } from '@/components/place-search';
import { RideDatePicker } from '@/components/ride-date-picker';
import { Button, Card, Choice, ErrorText, Field, MultiChoice, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { BubblePreset } from '@/core/bubble';
import { rideAllowanceText } from '@/core/entitlements';
import { stateByCode, US_STATES } from '@/core/discovery';
import type { JoinPolicy } from '@/core/joining';
import { placeLabel, type Place } from '@/core/places';
import type { RideRoute } from '@/core/route';
import { atMinutes as at, canRideOn, nextWeekday, startOfDay } from '@/core/calendar';
import { clockText, parseTime } from '@/core/time';
import { createRide, getPrivateDetails, getRide, getRideRoute, saveRideRoute } from '@/lib/api';
import { useEntitlements } from '@/lib/entitlements';
import { inviteGroupToRide, myGroups, type RidingGroup } from '@/lib/groups';
import { currentPosition, stateAt } from '@/lib/location';
import { useSession } from '@/lib/session';
import { handleProError } from '@/lib/pro';

const VEHICLE_TYPES = ['SXS/UTV', 'ATV', 'Dirt Bike', 'Motorcycle', 'Jeep/4x4', 'Truck', 'Overland Rig', 'Snowmobile', 'Car'];

const toInt = (s: string) => (s.trim() ? Math.max(1, parseInt(s, 10)) || null : null);

type Kind = 'public' | 'private';
type RoutePlan = 'mapped' | 'freeride';

export default function NewRide() {
  const { type, copy } = useLocalSearchParams<{ type?: string; copy?: string }>();
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
    })().catch((e) => setError(e instanceof Error ? e.message : 'Could not copy that ride.'));
  }, [copy]);

  // Riding groups to invite as soon as the ride exists (none until groups are switched on).
  useEffect(() => {
    myGroups().then(setGroups).catch(() => setGroups([]));
  }, []);

  const parsedCoords = coords.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);

  async function useMyLocation() {
    try {
      const p = await currentPosition();
      setCoords(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
      setMeetState(await stateAt(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get your location.');
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
    if (!kind) return setError('Pick Public or Private at the top.');
    if (!name.trim()) return setError('Give the ride a name.');
    if (!meetAt) return setError('Meeting time looks off. Try "8:00 am".');
    if (!canRideOn(dayDate, new Date())) return setError('Pick a day from today up to a year out.');
    if (!parsedCoords) return setError('Set the meeting point: search a place, use your location or paste coordinates like "38.57, -109.55".');
    if (!routePlan) return setError('Pick Mapped or Freeride under The Route.');
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
      });
      // A group that fails to invite can be invited again from the ride page.
      for (const g of groups.filter((x) => groupNames.includes(x.name))) {
        await inviteGroupToRide(ride.id, g.id).catch(() => {});
      }
      // Ride Again brings the old route along; if it can't save, the leader lands in the builder instead.
      const routeCopied = routePlan === 'mapped' && copiedRoute ? await saveRideRoute(ride.id, copiedRoute).then(() => true, () => false) : false;
      router.replace(`/r/${ride.invite_code}?new=1`);
      // A mapped ride goes straight to the route builder; saving it lands back on the new ride.
      if (routePlan === 'mapped' && !routeCopied) router.push(`/ride/${ride.id}/route`);
    } catch (e) {
      if (!handleProError(e)) setError(e instanceof Error ? e.message : 'Could not create the ride.');
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
          Plan it here on the big screen. The ride, its route and its stops show up in the OnMyLead app on your iPhone as soon as you save.
        </ThemedText>
      ) : null}
      {copiedFrom ? (
        <View style={{ gap: 2, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderLeftWidth: 4, borderLeftColor: Colors.sky }}>
          <ThemedText style={{ fontWeight: 700 }}>Riding {copiedFrom} Again</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {copiedRoute
              ? 'The details, meeting point and route are filled in. Pick the day, check the times and create it.'
              : 'The details and meeting point are filled in. Pick the day, check the times and create it.'}
          </ThemedText>
        </View>
      ) : null}
      {allowance ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement }}>
          <ThemedText type="small" style={{ flex: 1, fontWeight: 600 }}>{allowance}</ThemedText>
          <Pressable accessibilityRole="link" onPress={() => router.push('/pro')} hitSlop={8}>
            <ThemedText type="linkPrimary">Unlimited With Pro</ThemedText>
          </Pressable>
        </View>
      ) : null}
      <ThemedText type="heading">What Kind of Ride?</ThemedText>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <KindCard
          title="Public"
          detail="Open to anyone. Found by riders near you or in your state."
          on={kind === 'public'}
          onPress={() => setKind('public')}
        />
        <KindCard
          title="Private"
          detail="Only friends you invite by link, text or email."
          on={kind === 'private'}
          onPress={() => setKind('private')}
        />
      </View>

      <Field label="Ride Name" value={name} onChangeText={setName} placeholder="Saturday Hell's Revenge run" />

      <Card>
        <ThemedText type="heading">When</ThemedText>
        <RideDatePicker value={day} onChange={setDay} />
        <Field label="Meet At" value={meetTime} onChangeText={setMeetTime} placeholder="8:00 am" />
      </Card>

      <Card>
        <ThemedText type="heading">Meeting Point</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Only joined riders see the exact spot. Public pages show the area within about a mile.
        </ThemedText>
        <PlaceSearch label="Search a Place or Address" onPick={pickPlace} />
        <MeetPointMap value={parsedCoords ? { lat: Number(parsedCoords[1]), lng: Number(parsedCoords[2]) } : null} onPick={pickOnMap} />
        <Button title="Use My Current Location" kind="secondary" onPress={useMyLocation} />
        <Field label="Coordinates" value={coords} onChangeText={setCoords} onEndEditing={fillStateFromCoords} placeholder="38.57330, -109.54980" autoCapitalize="none" />
        <Field label="Place Name" value={meetLabel} onChangeText={setMeetLabel} placeholder="Gas station on Main St, Moab, UT" />
        {kind === 'public' ? (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>State</ThemedText>
            <ThemedText>
              {meetState ? `Listed in ${stateByCode(meetState)?.name}.` : 'Set the meeting point and we fill this in, or pick it.'}
            </ThemedText>
            {meetState && !pickingState ? (
              <Button title="Change State" kind="ghost" onPress={() => setPickingState(true)} />
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
        <ThemedText type="heading">The Route</ThemedText>
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <KindCard
            title="Mapped"
            detail="Draw the route or import a GPX next. Riders follow it in Ride Mode."
            on={routePlan === 'mapped'}
            onPress={() => setRoutePlan('mapped')}
          />
          <KindCard
            title="Freeride"
            detail="No set route. Everyone follows the leader."
            on={routePlan === 'freeride'}
            onPress={() => setRoutePlan('freeride')}
          />
        </View>
      </View>

      <Card>
        <ThemedText type="heading">Who’s Riding</ThemedText>
        <MultiChoice label="Vehicles Welcome" options={VEHICLE_TYPES} value={vehicleTypes} onChange={setVehicleTypes} />
        {kind === 'public' ? (
          <Choice
            label="Joining"
            value={joinPolicy}
            onChange={setJoinPolicy}
            options={[
              { value: 'open', label: 'Anyone Can Join' },
              { value: 'approval', label: 'I Approve Riders' },
            ]}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field label="Max Vehicles" value={maxVehicles} onChangeText={setMaxVehicles} keyboardType="number-pad" placeholder="No limit" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max Riders" value={maxRiders} onChangeText={setMaxRiders} keyboardType="number-pad" placeholder="No limit" />
          </View>
        </View>
      </Card>

      {groups.length ? (
        <Card>
          <ThemedText type="heading">Invite a Group</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Everyone in the groups you pick gets a notification and sees the ride on their home screen. They join with one tap.
          </ThemedText>
          <MultiChoice label="Your Riding Groups" options={[...new Set(groups.map((g) => g.name))]} value={groupNames} onChange={setGroupNames} />
        </Card>
      ) : null}

      <Button title={more ? 'Fewer Details' : 'Add Route, Difficulty and More'} kind="ghost" onPress={() => setMore(!more)} />
      {more ? (
        <Card>
          <Field label="Description" value={description} onChangeText={setDescription} multiline />
          <Field label="Departure Time" value={departTime} onChangeText={setDepartTime} placeholder="8:30 am" />
          <Field label="Expected Finish" value={finishTime} onChangeText={setFinishTime} placeholder="4:00 pm" />
          <PlaceSearch label="Search a Destination" onPick={(p) => setDestination(placeLabel(p))} />
          <Field
            label="Destination"
            value={destination}
            onChangeText={setDestination}
            placeholder="Trailhead, town or street address"
            hint="Anyone who can see the ride sees this. Riders get directions to it in Apple Maps or Google Maps."
          />
          <Field label="Route Length (Miles)" value={routeMiles} onChangeText={setRouteMiles} keyboardType="decimal-pad" hint="Used to warn riders whose fuel range is too short." />
          <Choice
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }, { value: 'extreme', label: 'Extreme' }]}
          />
          <Choice
            label="Experience"
            value={experience}
            onChange={setExperience}
            options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }, { value: 'expert', label: 'Expert' }]}
          />
          <Field label="What to Bring" value={whatToBring} onChangeText={setWhatToBring} multiline />
          <Field label="Required Equipment" value={requiredEquipment} onChangeText={setRequiredEquipment} multiline placeholder="Whip flag, helmet, spare belt" />
          <Field label="Fuel" value={fuelNotes} onChangeText={setFuelNotes} placeholder="Full tank, no gas on the trail" />
          <Field label="Instructions for Joined Riders" value={instructions} onChangeText={setInstructions} multiline />
          <Choice
            label="Ride Bubble"
            value={bubble}
            onChange={setBubble}
            options={[
              { value: 'default', label: 'Standard' },
              { value: 'tight_trail', label: 'Tight Trail' },
              { value: 'desert', label: 'Desert' },
              { value: 'highway', label: 'Highway' },
            ]}
          />
        </Card>
      ) : null}

      <ErrorText error={error} />
      <Button
        title={kind === 'public' ? 'Create Public Ride' : kind === 'private' ? 'Create Private Ride' : 'Create Ride'}
        big
        loading={busy}
        onPress={submit}
      />
    </Screen>
  );
}

/** One of two choices (Public or Private, Mapped or Freeride): a big tappable card, outlined in red when picked. */
function KindCard({ title, detail, on, onPress }: { title: string; detail: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        flex: 1, gap: Spacing.one, padding: Spacing.three, minHeight: 128, borderRadius: Radius.card, borderWidth: 2,
        borderColor: on ? Colors.accent : 'transparent', backgroundColor: on ? '#2A1620' : Colors.backgroundElement,
      }}>
      <ThemedText type="subtitle" style={{ fontSize: 30, lineHeight: 32 }}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
    </Pressable>
  );
}
