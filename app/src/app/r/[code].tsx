import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { counts } from '@/core/joining';
import {
  approveMember, checkIn, getMembers, getPrivateDetails, getRide, joinRide, leaveRide, setMemberRole, setRideStatus, tripForRide,
} from '@/lib/api';
import { track } from '@/lib/analytics';
import { useSession } from '@/lib/session';
import type { Ride, RideMember, RidePrivateDetails } from '@/lib/types';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The ride page. Works signed out (link preview on the web), so people can see the ride
 * before creating an account. Exact meeting point and roster only show once joined.
 */
export default function RidePage() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);
  const [details, setDetails] = useState<RidePrivateDetails | null>(null);
  const [members, setMembers] = useState<RideMember[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getRide(code);
      setRide(r);
      if (r && me) {
        const [d, m] = await Promise.all([getPrivateDetails(r.id), getMembers(r.id)]);
        setDetails(d);
        setMembers(m);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the ride.');
    }
  }, [code, me]);

  useFocusEffect(
    useCallback(() => {
      load();
      track('ride_preview_opened', { signed_in: !!me });
    }, [load, me]),
  );

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  if (ride === undefined) return <Screen><ThemedText>Loading…</ThemedText></Screen>;
  if (ride === null) return <Screen><ThemedText>We couldn’t find that ride. Check the link or code.</ThemedText></Screen>;

  const mine = members.find((m) => m.user_id === me);
  const isManager = ride.organizer_id === me || mine?.role === 'co_organizer';
  const joined = members.filter((m) => m.status === 'joined');
  const pending = members.filter((m) => m.status === 'pending');
  const waitlist = members.filter((m) => m.status === 'waitlisted');
  const c = counts(members.map((m) => ({ ...m, createdAt: 0, userId: m.user_id })));
  const link = WEB_URL ? `${WEB_URL}/r/${ride.invite_code}` : `Invite code ${ride.invite_code}`;

  const join = () =>
    me
      ? act('join', () => joinRide({ rideId: ride.id, inviteCode: /^[0-9a-f-]{36}$/i.test(code) ? undefined : ride.invite_code }))
      : router.push('/sign-in');

  return (
    <Screen>
      <Stack.Screen options={{ title: ride.name }} />
      <ThemedText type="subtitle">{ride.name}</ThemedText>
      {ride.status === 'live' ? <ThemedText style={{ color: '#E03131', fontWeight: '800' }}>RIDE IS LIVE</ThemedText> : null}
      <ThemedText>{when(ride.meet_at)}</ThemedText>
      {ride.description ? <ThemedText>{ride.description}</ThemedText> : null}

      <Card>
        <Info label="Meet" value={details ? `${details.meet_label ?? 'Pinned location'} (${details.meet_lat.toFixed(4)}, ${details.meet_lng.toFixed(4)})` : ride.meet_area_label ? `Near ${ride.meet_area_label}` : 'Shown after you join'} />
        {ride.depart_at ? <Info label="Departs" value={time(ride.depart_at)} /> : null}
        {ride.expected_finish_at ? <Info label="Back by" value={time(ride.expected_finish_at)} /> : null}
        {ride.destination_label ? <Info label="Destination" value={ride.destination_label} /> : null}
        {ride.vehicle_types.length ? <Info label="Vehicles" value={ride.vehicle_types.join(', ')} /> : null}
        {ride.difficulty ? <Info label="Difficulty" value={ride.difficulty} /> : null}
        {ride.experience_level ? <Info label="Experience" value={ride.experience_level} /> : null}
        {ride.route_miles ? <Info label="Route" value={`${ride.route_miles} miles`} /> : null}
        <Info label="Spots" value={ride.max_vehicles ? `${c.vehicles} of ${ride.max_vehicles} vehicles` : ride.max_riders ? `${c.riders} of ${ride.max_riders} riders` : `${joined.length} going`} />
        {ride.what_to_bring ? <Info label="Bring" value={ride.what_to_bring} /> : null}
        {ride.required_equipment ? <Info label="Required" value={ride.required_equipment} /> : null}
        {ride.fuel_notes ? <Info label="Fuel" value={ride.fuel_notes} /> : null}
        {details?.instructions ? <Info label="Instructions" value={details.instructions} /> : null}
      </Card>

      <ErrorText error={error} />

      {!mine || mine.status === 'cancelled' || mine.status === 'declined' ? (
        ride.status === 'ended' || ride.status === 'cancelled' ? (
          <ThemedText>This ride has {ride.status}.</ThemedText>
        ) : (
          <Button title={me ? (ride.join_policy === 'approval' ? 'Request to join' : 'Join ride') : 'Sign in to join'} big loading={busy === 'join'} onPress={join} />
        )
      ) : mine.status === 'pending' ? (
        <ThemedText>Your request is waiting for the organizer.</ThemedText>
      ) : mine.status === 'waitlisted' ? (
        <ThemedText>You’re on the waitlist. You’ll move up automatically if a spot opens.</ThemedText>
      ) : (
        <View style={{ gap: Spacing.two }}>
          {ride.status === 'live' ? (
            <Button title="Enter Ride Mode" big onPress={() => router.push(`/ride/${ride.id}/live`)} />
          ) : null}
          {!mine.checked_in_at && ride.status !== 'ended' ? (
            <Button title="I'm here and ready" kind="secondary" loading={busy === 'checkin'} onPress={() => act('checkin', () => checkIn(ride.id))} />
          ) : mine.checked_in_at ? (
            <ThemedText>Checked in at {time(mine.checked_in_at)}</ThemedText>
          ) : null}
        </View>
      )}

      {mine && ['joined', 'pending', 'waitlisted'].includes(mine.status) && ride.status !== 'cancelled' ? (
        <Button
          title="Plan what to bring"
          kind="secondary"
          loading={busy === 'trip'}
          accessibilityHint="Opens your packing checklist for this ride"
          onPress={() => act('trip', async () => {
            const trip = await tripForRide(ride, mine.vehicle_id);
            router.push(`/trips/${trip.id}`);
          })}
        />
      ) : null}

      <Button
        title="Invite riders"
        kind="secondary"
        onPress={async () => {
          await Share.share({ message: `Join "${ride.name}" ${link}` });
          track('invite_shared', { platform: Platform.OS });
        }}
      />
      <ThemedText type="small" themeColor="textSecondary">Invite code: {ride.invite_code}</ThemedText>

      {isManager ? (
        <Card>
          <ThemedText type="smallBold">Organizer</ThemedText>
          {ride.status === 'scheduled' ? (
            <Button title="Start Ride Mode" loading={busy === 'start'} onPress={() => act('start', async () => { await setRideStatus(ride.id, 'live'); router.push(`/ride/${ride.id}/live`); })} />
          ) : null}
          {ride.status === 'live' ? (
            <Button title="End ride for everyone" kind="danger" loading={busy === 'end'} onPress={() => act('end', () => setRideStatus(ride.id, 'ended'))} />
          ) : null}
          {pending.map((m) => (
            <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <ThemedText style={{ flex: 1 }}>{m.profiles?.display_name || 'Rider'} wants to join</ThemedText>
              <Button title="Approve" onPress={() => act('approve', () => approveMember(ride.id, m.user_id, true))} />
              <Button title="Decline" kind="secondary" onPress={() => act('decline', () => approveMember(ride.id, m.user_id, false))} />
            </View>
          ))}
        </Card>
      ) : null}

      {mine?.status === 'joined' ? (
        <Card>
          <ThemedText type="smallBold">Going ({joined.length})</ThemedText>
          {joined.map((m) => (
            <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
              <ThemedText style={{ flex: 1 }}>
                {m.profiles?.display_name || 'Rider'}
                {m.role !== 'rider' ? ` · ${m.role.replace('_', '-')}` : ''}
                {m.checked_in_at ? ' · here' : ''}
              </ThemedText>
              {isManager && m.role !== 'organizer' ? (
                <>
                  <Button title="Leader" kind={m.role === 'leader' ? 'primary' : 'secondary'} onPress={() => act('role', () => setMemberRole(ride.id, m.user_id, m.role === 'leader' ? 'rider' : 'leader'))} />
                  <Button title="Sweep" kind={m.role === 'sweep' ? 'primary' : 'secondary'} onPress={() => act('role', () => setMemberRole(ride.id, m.user_id, m.role === 'sweep' ? 'rider' : 'sweep'))} />
                </>
              ) : null}
            </View>
          ))}
          {waitlist.length ? <ThemedText type="small" themeColor="textSecondary">{waitlist.length} on the waitlist</ThemedText> : null}
        </Card>
      ) : null}

      {mine && mine.status !== 'cancelled' && mine.role !== 'organizer' ? (
        <Button title="Leave ride" kind="secondary" onPress={() => act('leave', () => leaveRide(ride.id))} />
      ) : null}
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.two }}>
      <ThemedText type="smallBold" style={{ width: 96 }}>{label}</ThemedText>
      <ThemedText type="small" style={{ flex: 1 }}>{value}</ThemedText>
    </View>
  );
}
