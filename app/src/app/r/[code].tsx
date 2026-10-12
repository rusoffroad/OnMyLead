import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { FuelCheck } from '@/components/fuel-check';
import { InviteCard } from '@/components/invite-card';
import { PinnedAnnouncement, RideChat } from '@/components/ride-chat';
import { RideSummary } from '@/components/ride-summary';
import { RouteSketch } from '@/components/route-sketch';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen, Tag } from '@/components/ui';
import { Colors, RideColors, Spacing } from '@/constants/theme';
import { latestAnnouncement, rideLeaderIds } from '@/core/chat';
import { counts } from '@/core/joining';
import { miles, type RideRoute } from '@/core/route';
import { useRideChat } from '@/hooks/use-ride-chat';
import {
  approveMember, checkIn, getMembers, getPrivateDetails, getRide, getRideRoute, joinRide, leaveRide, setMemberRole, setRideStatus, tripForRide,
} from '@/lib/api';
import { track } from '@/lib/analytics';
import { openStore } from '@/lib/rus';
import { useSession } from '@/lib/session';
import type { Ride, RideMember, RidePrivateDetails } from '@/lib/types';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The ride page. Works signed out (link preview on the web), so people can see the ride
 * before creating an account. Exact meeting point and roster only show once joined.
 */
export default function RidePage() {
  const { code, new: justCreated } = useLocalSearchParams<{ code: string; new?: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);
  const [details, setDetails] = useState<RidePrivateDetails | null>(null);
  const [members, setMembers] = useState<RideMember[]>([]);
  const [route, setRoute] = useState<RideRoute | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isJoined = members.some((m) => m.user_id === me && m.status === 'joined');
  const chat = useRideChat(ride?.id, isJoined);

  const load = useCallback(async () => {
    try {
      const r = await getRide(code);
      setRide(r);
      if (r && me) {
        const [d, m] = await Promise.all([getPrivateDetails(r.id), getMembers(r.id)]);
        setDetails(d);
        setMembers(m);
        // The route is part of the private details, so only riders on the ride get one back.
        if (d) setRoute((await getRideRoute(r.id)).route);
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

  if (ride === undefined) return <Screen><ThemedText themeColor="textSecondary">Loading…</ThemedText></Screen>;
  if (ride === null) return <Screen><ThemedText>We couldn’t find that ride. Check the link or code.</ThemedText></Screen>;

  const mine = members.find((m) => m.user_id === me);
  const isManager = ride.organizer_id === me || mine?.role === 'co_organizer';
  const joined = members.filter((m) => m.status === 'joined');
  const pending = members.filter((m) => m.status === 'pending');
  const waitlist = members.filter((m) => m.status === 'waitlisted');
  const c = counts(members.map((m) => ({ ...m, createdAt: 0, userId: m.user_id })));
  const nameOf = (userId: string) => members.find((m) => m.user_id === userId)?.profiles?.display_name || 'Rider';
  const leaderIds = rideLeaderIds(members, ride.organizer_id);
  const pinned = isJoined ? latestAnnouncement(chat.messages) : null;

  const join = () =>
    me
      ? act('join', () => joinRide({ rideId: ride.id, inviteCode: /^[0-9a-f-]{36}$/i.test(code) ? undefined : ride.invite_code }))
      : router.push('/sign-in');

  return (
    <Screen>
      <View style={{ gap: Spacing.two }}>
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          {ride.status === 'live' ? <Tag label="Live now" color={Colors.accent} solid /> : null}
          {ride.status === 'ended' ? <Tag label="Ended" color={Colors.textSecondary} /> : null}
          {ride.status === 'cancelled' ? <Tag label="Cancelled" color={Colors.danger} /> : null}
          {ride.difficulty ? <Tag label={cap(ride.difficulty)} color={Colors.sky} /> : null}
          <Tag label={ride.visibility === 'private' ? 'Private, invite only' : ride.visibility === 'public' ? 'Public' : 'Anyone with the link'} color={Colors.textSecondary} />
        </View>
        <ThemedText type="title" style={{ fontSize: 40, lineHeight: 42 }}>{ride.name}</ThemedText>
        <ThemedText style={{ color: Colors.sky, fontWeight: 700, fontSize: 17 }}>{when(ride.meet_at)}</ThemedText>
        {ride.description ? <ThemedText themeColor="textSecondary">{ride.description}</ThemedText> : null}
      </View>
      {justCreated && isManager ? <InviteCard ride={ride} fresh /> : null}
      {pinned ? <PinnedAnnouncement message={pinned} senderName={nameOf(pinned.user_id)} /> : null}
      {ride.status === 'ended' && isJoined ? <RideSummary ride={ride} members={members} /> : null}

      <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
        {(
          [
            ['Meet', details ? `${details.meet_label ?? 'Pinned location'} (${details.meet_lat.toFixed(4)}, ${details.meet_lng.toFixed(4)})` : ride.meet_area_label ? `Near ${ride.meet_area_label}` : 'Shown after you join'],
            ride.depart_at ? ['Departs', time(ride.depart_at)] : null,
            ride.expected_finish_at ? ['Back by', time(ride.expected_finish_at)] : null,
            ride.destination_label ? ['Destination', ride.destination_label] : null,
            ride.vehicle_types.length ? ['Vehicles', ride.vehicle_types.join(', ')] : null,
            ride.experience_level ? ['Experience', ride.experience_level] : null,
            ride.route_miles ? ['Route', `${ride.route_miles} miles`] : null,
            ['Spots', ride.max_vehicles ? `${c.vehicles} of ${ride.max_vehicles} vehicles` : ride.max_riders ? `${c.riders} of ${ride.max_riders} riders` : `${joined.length} going`],
            ride.what_to_bring ? ['Bring', ride.what_to_bring] : null,
            ride.required_equipment ? ['Required', ride.required_equipment] : null,
            ride.fuel_notes ? ['Fuel', ride.fuel_notes] : null,
            details?.instructions ? ['Instructions', details.instructions] : null,
          ].filter(Boolean) as [string, string][]
        ).map(([label, value], i) => (
          <Info key={label} label={label} value={value} first={i === 0} />
        ))}
      </Card>

      {details && (route || (isManager && ride.status !== 'ended' && ride.status !== 'cancelled')) ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <ThemedText type="heading">{route?.name || 'The route'}</ThemedText>
            {route ? <ThemedText style={{ color: Colors.sky, fontWeight: 700 }}>{miles(route.lengthM)} mi</ThemedText> : null}
          </View>
          {route ? (
            <>
              <RouteSketch points={route.points} />
              <ThemedText type="small" themeColor="textSecondary">
                {ride.status === 'live'
                  ? 'Open Ride Mode to see where you and everyone else are on it.'
                  : 'Saved on your phone once you’ve opened it, so it’s there without signal.'}
              </ThemedText>
            </>
          ) : (
            <ThemedText themeColor="textSecondary">
              Draw the trail on the map or import a GPX file. Riders see it in Ride Mode with everyone placed along it.
            </ThemedText>
          )}
          {isManager && ride.status !== 'ended' && ride.status !== 'cancelled' ? (
            <Button title={route ? 'Edit route' : 'Build the route'} kind={route ? 'secondary' : 'primary'} onPress={() => router.push(`/ride/${ride.id}/route`)} />
          ) : null}
        </Card>
      ) : null}

      {mine && ['joined', 'pending', 'waitlisted'].includes(mine.status) && (ride.status === 'scheduled' || ride.status === 'live') ? (
        <FuelCheck ride={ride} mine={mine} onChanged={load} />
      ) : null}

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

      {!(justCreated && isManager) && (ride.visibility !== 'private' || mine?.status === 'joined') ? <InviteCard ride={ride} /> : null}

      {isManager ? (
        <Card>
          <ThemedText type="heading">You’re organizing</ThemedText>
          {ride.status === 'scheduled' ? (
            <Button title="Start Ride Mode" big loading={busy === 'start'} onPress={() => act('start', async () => { await setRideStatus(ride.id, 'live'); router.push(`/ride/${ride.id}/live`); })} />
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
          <ThemedText type="heading">Going ({joined.length})</ThemedText>
          {joined.map((m) => (
            <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap', minHeight: 48 }}>
              <Avatar name={m.profiles?.display_name || 'Rider'} color={ROLE_COLOR[m.role]} />
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText style={{ fontWeight: 600 }}>{m.profiles?.display_name || 'Rider'}</ThemedText>
                {m.role !== 'rider' || m.checked_in_at ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {[m.role !== 'rider' ? ROLE_LABEL[m.role] : null, m.checked_in_at ? 'Here' : null].filter(Boolean).join(', ')}
                  </ThemedText>
                ) : null}
              </View>
              {isManager && m.role !== 'organizer' ? (
                <>
                  <Button title="Leader" kind="secondary" style={m.role === 'leader' && { backgroundColor: RideColors.leader }} onPress={() => act('role', () => setMemberRole(ride.id, m.user_id, m.role === 'leader' ? 'rider' : 'leader'))} />
                  <Button title="Sweep" kind="secondary" style={m.role === 'sweep' && { backgroundColor: RideColors.sweep }} onPress={() => act('role', () => setMemberRole(ride.id, m.user_id, m.role === 'sweep' ? 'rider' : 'sweep'))} />
                </>
              ) : null}
            </View>
          ))}
          {waitlist.length ? <ThemedText type="small" themeColor="textSecondary">{waitlist.length} on the waitlist</ThemedText> : null}
        </Card>
      ) : null}

      {isJoined ? (
        <RideChat
          messages={chat.messages}
          nameOf={nameOf}
          me={me}
          canAnnounce={isManager}
          leaderName={leaderIds.length && !leaderIds.includes(me ?? '') ? leaderIds.map(nameOf).join(', ') : null}
          error={chat.error}
          onSend={chat.send}
        />
      ) : null}

      {mine && mine.status !== 'cancelled' && mine.role !== 'organizer' ? (
        <Button title="Leave ride" kind="secondary" onPress={() => act('leave', () => leaveRide(ride.id))} />
      ) : null}

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="OnMyLead is presented by RUS Offroad"
        onPress={() => openStore('ride_page')}
        style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 13 }}>Presented by RUS Offroad</ThemedText>
      </Pressable>
    </Screen>
  );
}

function Info({ label, value, first }: { label: string; value: string; first: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.three, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: Colors.backgroundSelected }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ width: 92 }}>{label}</ThemedText>
      <ThemedText style={{ flex: 1, fontSize: 15, lineHeight: 21, fontWeight: 600 }}>{value}</ThemedText>
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ROLE_LABEL: Record<RideMember['role'], string> = {
  organizer: 'Organizer', co_organizer: 'Co-organizer', leader: 'Leader', sweep: 'Sweep', rider: 'Rider',
};
const ROLE_COLOR: Record<RideMember['role'], string> = {
  organizer: Colors.accent, co_organizer: Colors.accent, leader: RideColors.leader, sweep: RideColors.sweep, rider: RideColors.rider,
};

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <ThemedText style={{ color: '#fff', fontWeight: 700 }}>{name.trim().charAt(0).toUpperCase()}</ThemedText>
    </View>
  );
}
