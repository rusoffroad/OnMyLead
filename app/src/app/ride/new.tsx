import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { EventOrRide } from '@/components/events/event-or-ride';
import { spotFromParams } from '@/core/spots';
import { ThemedText } from '@/components/themed-text';
import { MeetPointMap } from '@/components/meet-point-map';
import { PlaceSearch } from '@/components/place-search';
import { TimePicker } from '@/components/time-picker';
import { WhenFields } from '@/components/when-fields';
import { Icon } from '@/components/icon';
import { codeCheckOk, ShareCodeField, type CodeCheck } from '@/components/share-code-field';
import { Button, Card, Choice, ErrorText, Field, MultiChoice, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import type { BubblePreset } from '@/core/bubble';
import { rideAllowanceText } from '@/core/entitlements';
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
import { atMinutes as at, canRideOn, nextWeekday } from '@/core/calendar';
import { atSpot, defaultWhen, type RecentSpot } from '@/core/quick-ride';
import { clockText, minutesText, parseTime, shiftClock } from '@/core/time';
import { cleanShareCode, friendlyShareCodeError } from '@/core/share-code';
import { createRide, getPrivateDetails, getRide, getRideRoute, saveRideRoute } from '@/lib/api';
import { linkRide } from '@/lib/events';
import { useEntitlements } from '@/lib/entitlements';
import { inviteGroupToRide, myGroups, type RidingGroup } from '@/lib/groups';
import { currentPosition, positionIfAllowed, stateAt } from '@/lib/location';
import { loadRideDefaults, saveRideDefaults } from '@/lib/quick-ride';
import { useSession } from '@/lib/session';
import { handleProError, requirePro } from '@/lib/pro';
import { ProTag } from '@/components/pro-tag';

import { t as tr } from '@/lib/i18n';


const toInt = (s: string) => (s.trim() ? Math.max(1, parseInt(s, 10)) || null : null);

type Kind = 'public' | 'private';
type RoutePlan = 'mapped' | 'freeride';

export default function NewRide() {
  const { type, copy, trail, group, event, spot, lat, lng, state } = useLocalSearchParams<{ type?: string; copy?: string; trail?: string; group?: string; event?: string; spot?: string; lat?: string; lng?: string; state?: string }>();
  const [fromSpot] = useState(() => (copy ? null : spotFromParams({ spot, lat, lng, state })));
  const { session, loading } = useSession();
  const { ent } = useEntitlements();
  const allowance = rideAllowanceText(ent);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Opens on today at the next quarter hour (core/quick-ride): a ride from here, right now, is two taps.
  const [start] = useState(() => defaultWhen(new Date()));
  const [day, setDay] = useState<number>(() => start.day.getTime());
  const [meetTime, setMeetTime] = useState(() => minutesText(start.minutes));
  const [departTime, setDepartTime] = useState('');
  const [finishTime, setFinishTime] = useState('');
  const [meetLabel, setMeetLabel] = useState(fromSpot?.name ?? '');
  const [coords, setCoords] = useState(fromSpot ? `${fromSpot.lat.toFixed(5)}, ${fromSpot.lng.toFixed(5)}` : '');
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
  // Friends only until the rider says otherwise (or picked Public last time): nothing goes public by accident.
  const [kind, setKind] = useState<Kind>(type === 'public' ? 'public' : 'private');
  const [routePlan, setRoutePlan] = useState<RoutePlan>('freeride');
  /** The meeting point is the rider's own spot, filled in when the screen opened. */
  const [here, setHere] = useState(false);
  const [locating, setLocating] = useState(() => !fromSpot && !copy && !trail);
  /** The search, map and coordinates under the meeting point: open until there is a point, then behind Change. */
  const [spotOpen, setSpotOpen] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<RecentSpot[]>([]);
  const touched = useRef({ kind: false, vehicles: false, joining: false, spot: false, route: false });
  const [meetState, setMeetState] = useState<string | null>(fromSpot?.state ?? null);
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

  // Create a Ride Here, from a Scout place page: the meeting point starts on the place (fields below).
  useEffect(() => {
    if (fromSpot && !fromSpot.state && !copy) stateAt(fromSpot).then(setMeetState).catch(() => {});
    // Only the link the screen opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What the last ride picked leads this one, and the meeting point starts where the rider is
  // (only when location is already allowed: opening this screen never asks).
  useEffect(() => {
    let live = true;
    loadRideDefaults().then((d) => {
      if (!live) return;
      setRecent(d.spots);
      if (copy) return;
      if (type !== 'public' && type !== 'private' && !touched.current.kind) setKind(d.kind);
      if (d.vehicleTypes && !touched.current.vehicles) setVehicleTypes(d.vehicleTypes);
      if (d.joinPolicy && !touched.current.joining) setJoinPolicy(d.joinPolicy);
      // A leader who maps every ride starts on Mapped (a trail's own route already did).
      if (d.route && !trail && !touched.current.route) setRoutePlan(d.route);
    }).catch(() => {});
    if (!fromSpot && !copy && !trail) {
      positionIfAllowed()
        .then(async (p) => {
          if (!live || !p || touched.current.spot) return;
          setCoords(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
          setHere(true);
          const st = await stateAt(p);
          if (live && !touched.current.spot) setMeetState(st);
        })
        .finally(() => live && setLocating(false));
    }
    return () => {
      live = false;
    };
    // Only the link the screen opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setRoutePlan(route ? 'mapped' : 'freeride');
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

  /** The meeting point was set by hand: a late location fix no longer replaces it. */
  function setSpot(p: { lat: number; lng: number }, label?: string) {
    touched.current.spot = true;
    setHere(false);
    setCoords(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    if (label != null) setMeetLabel(label);
  }

  async function useMyLocation() {
    try {
      const p = await currentPosition();
      setSpot(p, '');
      setHere(true);
      setSpotOpen(false);
      setMeetState(await stateAt(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not get your location.'));
    }
  }

  async function pickPlace(p: Place) {
    setSpot(p, p.kind !== 'Coordinates' ? placeLabel(p) : undefined);
    if (p.kind !== 'Coordinates') setSpotOpen(false);
    setMeetState(p.state ?? (await stateAt(p)));
  }

  async function pickOnMap(p: { lat: number; lng: number }) {
    setSpot(p);
    setMeetState(await stateAt(p));
  }

  function pickRecent(s: RecentSpot) {
    setSpot(s, s.label);
    setSpotOpen(false);
    setMeetState(s.state);
  }

  async function fillStateFromCoords() {
    if (parsedCoords) setMeetState(await stateAt({ lat: Number(parsedCoords[1]), lng: Number(parsedCoords[2]) }));
  }

  async function submit() {
    setError(null);
    const dayDate = new Date(day);
    const meetAt = at(dayDate, parseTime(meetTime));
    if (!meetAt) return setError(tr('Pick a meeting time.'));
    if (!canRideOn(dayDate, new Date())) return setError(tr('Pick a day from today up to three years out.'));
    if (!parsedCoords) return setError(tr('Set the meeting point: search a place, use your location or paste coordinates like "38.57, -109.55".'));
    if (!codeCheckOk(codeCheck)) return setError(codeCheck === 'checking' ? tr('Checking your invite code. Try again in a second.') : tr('Pick a different invite code, or clear it to get one made for you.'));
    setBusy(true);
    try {
      const lat = Number(parsedCoords[1]);
      const lng = Number(parsedCoords[2]);
      const state = meetState ?? (await stateAt({ lat, lng }));
      const ride = await createRide({
        name: name.trim() || autoName,
        description,
        meetAt,
        departAt: departTime ? at(dayDate, parseTime(departTime)) : null,
        expectedFinishAt: finishTime ? at(dayDate, parseTime(finishTime)) : null,
        meetLat: lat,
        meetLng: lng,
        meetLabel,
        meetState: state,
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
      // The next ride starts from this one's choices, with this meeting point one tap away.
      saveRideDefaults(
        { kind, vehicleTypes: vehicleTypes.length ? vehicleTypes : null, joinPolicy: joinPolicy === 'approval' ? 'approval' : 'open', route: routePlan },
        meetLabel.trim() ? { lat, lng, label: meetLabel.trim(), state } : null,
      ).catch(() => {});
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

  const point = parsedCoords ? { lat: Number(parsedCoords[1]), lng: Number(parsedCoords[2]) } : null;
  const editing = spotOpen ?? (!point && !locating);
  // A ride with no name is named for its day: "Saturday Ride".
  const autoName = tr('{day} Ride', { day: new Date(day).toLocaleDateString(undefined, { weekday: 'long' }) });
  const spotTitle = meetLabel.trim() || (here ? tr('Where You Are Now') : point ? coords.trim() : locating ? tr('Finding where you are…') : tr('Search a Place or Address'));
  const spotDetail = point && meetState ? stateByCode(meetState)?.name ?? null : null;

  return (
    <Screen width="readable">
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

      <Field label={tr('Ride Name')} value={name} onChangeText={setName} placeholder={autoName} maxLength={120} />

      <WhenFields day={day} onDay={setDay} time={meetTime} onTime={setMeetTime} />

      <View style={{ gap: 6 }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{tr('Meeting Point')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: editing }}
          accessibilityLabel={`${tr('Meeting Point')}: ${spotTitle}. ${editing ? tr('Done') : tr('Change')}`}
          onPress={() => setSpotOpen(!editing)}
          style={({ pressed }) => [styles.spot, pressed && { opacity: 0.85 }]}>
          <View style={styles.spotPin}><Icon name="pin" size={22} color={point ? Colors.accent : Colors.textSecondary} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{spotTitle}</ThemedText>
            {spotDetail ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{spotDetail}</ThemedText> : null}
          </View>
          <ThemedText type="linkPrimary">{editing ? tr('Done') : tr('Change')}</ThemedText>
        </Pressable>
        {recent.length ? (
          <View style={styles.chips} accessibilityRole="radiogroup">
            {recent.map((s) => {
              const on = atSpot(point, s);
              return (
                <Pressable
                  key={s.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => pickRecent(s)}
                  style={[styles.chip, { backgroundColor: on ? Colors.accent : Colors.backgroundSelected }]}>
                  <ThemedText numberOfLines={1} style={[styles.chipText, { color: on ? Colors.onAccent : Colors.text }]}>{s.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {editing ? (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              {tr('Only joined riders see the exact spot. Public pages show the area within about a mile.')}
            </ThemedText>
            <PlaceSearch label={tr('Search a Place or Address')} onPick={pickPlace} />
            <MeetPointMap value={parsedCoords ? { lat: Number(parsedCoords[1]), lng: Number(parsedCoords[2]) } : null} onPick={pickOnMap} />
            <Button title={tr('Use My Current Location')} kind="secondary" onPress={useMyLocation} />
            <Field label={tr('Coordinates')} value={coords} onChangeText={(v) => {
              touched.current.spot = true;
              setHere(false);
              setCoords(v);
            }} onEndEditing={fillStateFromCoords} placeholder="38.57330, -109.54980" autoCapitalize="none" />
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
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{tr('The Route')}</ThemedText>
        <View style={styles.kinds} accessibilityRole="radiogroup">
          {([['mapped', tr('Mapped')], ['freeride', tr('Freeride')]] as const).map(([value, title]) => {
            const on = routePlan === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  if (value === 'mapped' && !requirePro('route_builder')) return;
                  touched.current.route = true;
                  setRoutePlan(value);
                }}
                style={[styles.kind, on && { backgroundColor: Colors.accent }]}>
                <ThemedText style={[styles.kindText, { color: on ? Colors.onAccent : Colors.text }]}>{title}</ThemedText>
                {value === 'mapped' ? <ProTag feature="route_builder" /> : null}
              </Pressable>
            );
          })}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {routePlan === 'mapped' ? tr('Draw the route or import a GPX next. Riders follow it in Ride Mode.') : tr('No set route. Everyone follows the leader.')}
        </ThemedText>
      </View>

      <View style={{ gap: 6 }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{tr('Who Can Join')}</ThemedText>
        <View style={styles.kinds} accessibilityRole="radiogroup">
          {([['private', tr('Friends I Invite')], ['public', tr('Public')]] as const).map(([value, title]) => {
            const on = kind === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  touched.current.kind = true;
                  setKind(value);
                }}
                style={[styles.kind, on && { backgroundColor: Colors.accent }]}>
                <ThemedText style={[styles.kindText, { color: on ? Colors.onAccent : Colors.text }]}>{title}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {kind === 'public' ? tr('Open to anyone. Found by riders near you or in your state.') : tr('Only friends you invite by link, text or email.')}
        </ThemedText>
        {kind === 'public' && !event ? <EventOrRide from="create-ride" /> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: more }}
        onPress={() => setMore(!more)}
        style={({ pressed }) => [styles.spot, pressed && { opacity: 0.85 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={{ fontWeight: 700 }}>{tr('More Options')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{tr('Vehicles, rider limits, invite code, groups and details')}</ThemedText>
        </View>
        <ThemedText type="linkPrimary">{more ? tr('Hide') : tr('Show')}</ThemedText>
      </Pressable>

      {more ? (
        <>
        <Card>
          <ThemedText type="heading">{tr('Who’s Riding')}</ThemedText>
          <MultiChoice label={tr('Vehicles Welcome')} options={VEHICLE_TYPES} value={vehicleTypes} onChange={(v) => {
            touched.current.vehicles = true;
            setVehicleTypes(v);
          }} />
          {kind === 'public' ? (
            <Choice
              label={tr('Joining')}
              value={joinPolicy}
              onChange={(v) => {
                touched.current.joining = true;
                setJoinPolicy(v);
              }}
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
        </>
      ) : null}

      <ErrorText error={error} />
      <Button title={kind === 'public' ? tr('Create Public Ride') : tr('Create Private Ride')} big loading={busy} onPress={submit} />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  spot: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 64, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: Radius.control, backgroundColor: Colors.backgroundElement,
  },
  spotPin: { width: 40, height: 40, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Radius.pill, paddingHorizontal: 16, minHeight: 40, maxWidth: '100%', justifyContent: 'center' },
  chipText: { fontSize: 15, fontFamily: font(600) },
  kinds: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.control, backgroundColor: Colors.backgroundElement },
  kind: { flex: 1, flexDirection: 'row', gap: 8, minHeight: 44, borderRadius: Radius.control - 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  kindText: { fontSize: 16, fontFamily: font(700) },
}));
