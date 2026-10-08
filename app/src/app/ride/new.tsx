import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field, MultiChoice, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { BubblePreset } from '@/core/bubble';
import { stateByCode, US_STATES } from '@/core/discovery';
import type { JoinPolicy } from '@/core/joining';
import { parseTime } from '@/core/time';
import { createRide } from '@/lib/api';
import { currentPosition, stateAt } from '@/lib/location';

const VEHICLE_TYPES = ['SXS/UTV', 'ATV', 'Dirt bike', 'Motorcycle', 'Jeep/4x4', 'Truck', 'Overland rig', 'Snowmobile', 'Car'];

function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const at = (day: Date, minutes: number | null) => (minutes == null ? null : new Date(day.getTime() + minutes * 60_000));
const toInt = (s: string) => (s.trim() ? Math.max(1, parseInt(s, 10)) || null : null);

type Kind = 'public' | 'private';

export default function NewRide() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const days = useMemo(() => nextDays(14), []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [day, setDay] = useState<number>(days[0].getTime());
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
  const [meetState, setMeetState] = useState<string | null>(null);
  const [pickingState, setPickingState] = useState(false);
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>('open');
  const [bubble, setBubble] = useState<BubblePreset>('default');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!parsedCoords) return setError('Set the meeting point: use your location or paste coordinates like "38.57, -109.55".');
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
      });
      router.replace(`/r/${ride.invite_code}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the ride.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ThemedText type="heading">What kind of ride?</ThemedText>
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

      <Field label="Ride name" value={name} onChangeText={setName} placeholder="Saturday Hell's Revenge run" />

      <Card>
        <ThemedText type="heading">When</ThemedText>
        <Choice
          value={day}
          onChange={setDay}
          options={days.map((d, i) => ({
            value: d.getTime(),
            label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
          }))}
        />
        <Field label="Meet at" value={meetTime} onChangeText={setMeetTime} placeholder="8:00 am" />
      </Card>

      <Card>
        <ThemedText type="heading">Meeting point</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Only joined riders see the exact spot. Public pages show the area within about a mile.
        </ThemedText>
        <Button title="Use my current location" kind="secondary" onPress={useMyLocation} />
        <Field label="Coordinates" value={coords} onChangeText={setCoords} onEndEditing={fillStateFromCoords} placeholder="38.57330, -109.54980" autoCapitalize="none" />
        <Field label="Place name" value={meetLabel} onChangeText={setMeetLabel} placeholder="Gas station on Main St, Moab, UT" />
        {kind === 'public' ? (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>State</ThemedText>
            <ThemedText>
              {meetState ? `Listed in ${stateByCode(meetState)?.name}.` : 'Set the meeting point and we fill this in, or pick it.'}
            </ThemedText>
            {meetState && !pickingState ? (
              <Button title="Change state" kind="ghost" onPress={() => setPickingState(true)} />
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

      <Card>
        <ThemedText type="heading">Who’s riding</ThemedText>
        <MultiChoice label="Vehicles welcome" options={VEHICLE_TYPES} value={vehicleTypes} onChange={setVehicleTypes} />
        {kind === 'public' ? (
          <Choice
            label="Joining"
            value={joinPolicy}
            onChange={setJoinPolicy}
            options={[
              { value: 'open', label: 'Anyone can join' },
              { value: 'approval', label: 'I approve riders' },
            ]}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field label="Max vehicles" value={maxVehicles} onChangeText={setMaxVehicles} keyboardType="number-pad" placeholder="No limit" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max riders" value={maxRiders} onChangeText={setMaxRiders} keyboardType="number-pad" placeholder="No limit" />
          </View>
        </View>
      </Card>

      <Button title={more ? 'Fewer details' : 'Add route, difficulty and more'} kind="ghost" onPress={() => setMore(!more)} />
      {more ? (
        <Card>
          <Field label="Description" value={description} onChangeText={setDescription} multiline />
          <Field label="Departure time" value={departTime} onChangeText={setDepartTime} placeholder="8:30 am" />
          <Field label="Expected finish" value={finishTime} onChangeText={setFinishTime} placeholder="4:00 pm" />
          <Field label="Destination" value={destination} onChangeText={setDestination} />
          <Field label="Route length (miles)" value={routeMiles} onChangeText={setRouteMiles} keyboardType="decimal-pad" hint="Used to warn riders whose fuel range is too short." />
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
          <Field label="What to bring" value={whatToBring} onChangeText={setWhatToBring} multiline />
          <Field label="Required equipment" value={requiredEquipment} onChangeText={setRequiredEquipment} multiline placeholder="Whip flag, helmet, spare belt" />
          <Field label="Fuel" value={fuelNotes} onChangeText={setFuelNotes} placeholder="Full tank, no gas on the trail" />
          <Field label="Instructions for joined riders" value={instructions} onChangeText={setInstructions} multiline />
          <Choice
            label="Ride Bubble"
            value={bubble}
            onChange={setBubble}
            options={[
              { value: 'default', label: 'Standard' },
              { value: 'tight_trail', label: 'Tight trail' },
              { value: 'desert', label: 'Desert' },
              { value: 'highway', label: 'Highway' },
            ]}
          />
        </Card>
      ) : null}

      <ErrorText error={error} />
      <Button
        title={kind === 'public' ? 'Create public ride' : kind === 'private' ? 'Create private ride' : 'Create ride'}
        big
        loading={busy}
        onPress={submit}
      />
    </Screen>
  );
}

/** One of the two ride kinds: a big tappable card, outlined in red when picked. */
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
