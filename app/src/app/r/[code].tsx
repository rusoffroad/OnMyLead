import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DirectionsCard } from '@/components/directions';
import { FollowLeaders } from '@/components/follow-leaders';
import { FuelCheck } from '@/components/fuel-check';
import { GetTheApp } from '@/components/get-the-app';
import { InviteCard } from '@/components/invite-card';
import { PinnedAnnouncement, RideChat } from '@/components/ride-chat';
import { ReportSheet } from '@/components/report-sheet';
import { RideDay } from '@/components/ride-day';
import { RideRoster } from '@/components/ride-roster';
import { RideSummary } from '@/components/ride-summary';
import { RouteSketch } from '@/components/route-sketch';
import { ThemedText } from '@/components/themed-text';
import { waypointDots } from '@/components/waypoint-blaze';
import { WaypointRow } from '@/components/waypoint-row';
import { Button, Card, ErrorText, Screen, Tag } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { canCancel, cancelPrompt, deletePrompt, ridersToTell } from '@/core/cancel';
import { latestAnnouncement, rideLeaderIds } from '@/core/chat';
import { rideDirections } from '@/core/directions';
import { leadersToFollow } from '@/core/groups';
import { counts } from '@/core/joining';
import { startsIn } from '@/core/ride-day';
import { miles, type RideRoute } from '@/core/route';
import { canShareWaypoints, plannedStops, PLANNED_STOPS_NOT_SWITCHED_ON, WAYPOINTS_NOT_SWITCHED_ON } from '@/core/waypoints';
import { useRideChat } from '@/hooks/use-ride-chat';
import { useRideWaypoints } from '@/hooks/use-ride-waypoints';
import {
  approveMember, cancelRide, checkIn, deleteRide, getMembers, getPrivateDetails, getRide, getRideRoute, joinRide, leaveRide, setRideStatus,
  myTrips, tripForRide,
} from '@/lib/api';
import { track } from '@/lib/analytics';
import { useFlag } from '@/lib/app-settings';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { declineRideInvite } from '@/lib/groups';
import { useEntitlements } from '@/lib/entitlements';
import { currentNotificationSettings } from '@/lib/notification-settings';
import { requirePro, requireTripSlot } from '@/lib/pro';
import { syncRideReminders } from '@/lib/push';
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
  const { can } = useEntitlements();
  const me = session?.user.id;
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);
  const pollsFlag = useFlag('ride_polls');
  const [details, setDetails] = useState<RidePrivateDetails | null>(null);
  const [members, setMembers] = useState<RideMember[]>([]);
  const [route, setRoute] = useState<RideRoute | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<ComponentProps<typeof ReportSheet>['target']>(null);
  const isJoined = members.some((m) => m.user_id === me && m.status === 'joined');
  const chat = useRideChat(ride?.id, isJoined);
  const waypoints = useRideWaypoints(ride?.id, isJoined);

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
  const isOrganizer = ride.organizer_id === me;
  const isManager = isOrganizer || mine?.role === 'co_organizer';
  const cancelled = ride.status === 'cancelled';
  const over = ride.status === 'ended' || cancelled;
  const toTell = ridersToTell(members, me);
  const joined = members.filter((m) => m.status === 'joined');
  const pending = members.filter((m) => m.status === 'pending');
  const waitlist = members.filter((m) => m.status === 'waitlisted');
  const c = counts(members.map((m) => ({ ...m, createdAt: 0, userId: m.user_id })));
  const nameOf = (userId: string) => members.find((m) => m.user_id === userId)?.profiles?.display_name || 'Rider';
  const leaderIds = rideLeaderIds(members, ride.organizer_id);
  const canPlanStops = canShareWaypoints(me, mine, leaderIds);
  const stops = plannedStops(waypoints.waypoints);
  const otherWaypoints = waypoints.waypoints.filter((w) => !w.planned_stop);
  const pinned = isJoined ? latestAnnouncement(chat.messages) : null;
  const countdown = ride.status === 'scheduled' ? startsIn(new Date(ride.meet_at), new Date()) : null;

  const join = () =>
    me
      ? act('join', () => joinRide({ rideId: ride.id, inviteCode: /^[0-9a-f-]{36}$/i.test(code) ? undefined : ride.invite_code }))
      : router.push('/sign-in');

  const resyncReminders = () => syncRideReminders(currentNotificationSettings().reminder_minutes);

  // The buttons sit far below the page's error line, so a failure pops up where the organizer is looking.
  const cancel = async () => {
    const p = cancelPrompt(ride.name, toTell);
    if (!(await confirmAsync(p.title, p.message, p.confirm, 'Keep Ride'))) return;
    setBusy('cancel');
    try {
      await cancelRide(ride.id);
      resyncReminders();
      await load();
    } catch (e) {
      showNotice('Couldn’t Cancel the Ride', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const p = deletePrompt(ride.name, toTell, over);
    if (!(await confirmAsync(p.title, p.message, p.confirm, 'Keep Ride'))) return;
    setBusy('delete');
    try {
      await deleteRide(ride.id);
      resyncReminders();
      router.replace('/');
    } catch (e) {
      showNotice('Couldn’t Delete the Ride', e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(null);
    }
  };

  return (
    <Screen>
      <GetTheApp inviteCode={ride.invite_code} />
      <View style={{ gap: Spacing.two }}>
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          {ride.status === 'live' ? <Tag label="Live Now" color={Colors.accent} solid /> : null}
          {countdown ? <Tag label={countdown} color={Colors.accent} /> : null}
          {ride.status === 'ended' ? <Tag label="Ended" color={Colors.textSecondary} /> : null}
          {ride.status === 'cancelled' ? <Tag label="Cancelled" color={Colors.danger} /> : null}
          {ride.difficulty ? <Tag label={cap(ride.difficulty)} color={Colors.sky} /> : null}
          <Tag label={ride.visibility === 'private' ? 'Private, Invite Only' : ride.visibility === 'public' ? 'Public' : 'Anyone with the Link'} color={Colors.textSecondary} />
        </View>
        <ThemedText type="title" style={{ fontSize: 40, lineHeight: 42 }}>{ride.name}</ThemedText>
        <ThemedText style={{ color: Colors.sky, fontWeight: 700, fontSize: 17 }}>{when(ride.meet_at)}</ThemedText>
        {ride.description ? <ThemedText themeColor="textSecondary">{ride.description}</ThemedText> : null}
      </View>
      {cancelled ? (
        <View style={styles.cancelled} accessibilityRole="alert">
          <ThemedText type="heading">This Ride Is Cancelled</ThemedText>
          <ThemedText themeColor="textSecondary">
            {isManager
              ? 'Everyone who had joined was sent a notification and an email.'
              : `${nameOf(ride.organizer_id)} called it off. You don’t need to do anything.`}
          </ThemedText>
        </View>
      ) : null}
      {me && ride.status !== 'cancelled' ? <FollowLeaders ids={leadersToFollow(ride.organizer_id, leaderIds, me)} organizerId={ride.organizer_id} /> : null}
      {justCreated && isManager ? <InviteCard ride={ride} fresh manager /> : null}
      {pinned ? <PinnedAnnouncement message={pinned} senderName={nameOf(pinned.user_id)} /> : null}
      {ride.status === 'ended' && isJoined ? <RideSummary ride={ride} members={members} /> : null}

      <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
        {(
          [
            ['Meet', details ? `${details.meet_label ?? 'Pinned location'} (${details.meet_lat.toFixed(4)}, ${details.meet_lng.toFixed(4)})` : ride.meet_area_label ? `Near ${ride.meet_area_label}` : 'Shown after you join'],
            ride.depart_at ? ['Departs', time(ride.depart_at)] : null,
            ride.expected_finish_at ? ['Back By', time(ride.expected_finish_at)] : null,
            ride.destination_label ? ['Destination', ride.destination_label] : null,
            ride.vehicle_types.length ? ['Vehicles', ride.vehicle_types.join(', ')] : null,
            ride.experience_level ? ['Experience', ride.experience_level] : null,
            ride.route_miles ? ['Route', `${ride.route_miles} miles`] : ride.freeride ? ['Route', 'Freeride, no mapped route'] : null,
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

      {ride.status === 'scheduled' || ride.status === 'live' ? <RideDay ride={ride} /> : null}

      {ride.status === 'scheduled' || ride.status === 'live' ? (
        <DirectionsCard
          rows={rideDirections({
            meet: details ? { lat: details.meet_lat, lng: details.meet_lng, label: details.meet_label } : null,
            route,
            destination: ride.destination_label,
          })}
        />
      ) : null}

      {details && (route || (isManager && ride.status !== 'ended' && ride.status !== 'cancelled')) ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <ThemedText type="heading">{route?.name || (ride.freeride ? 'Freeride' : 'The Route')}</ThemedText>
            {route ? <ThemedText style={{ color: Colors.sky, fontWeight: 700 }}>{miles(route.lengthM)} mi</ThemedText> : null}
          </View>
          {route ? (
            <>
              <RouteSketch
                points={route.points}
                dots={waypointDots(waypoints.waypoints)}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {ride.status === 'live'
                  ? 'Open Ride Mode to see where you and everyone else are on it.'
                  : 'Saved on your phone once you’ve opened it, so it’s there without signal.'}
              </ThemedText>
            </>
          ) : ride.freeride ? (
            <ThemedText themeColor="textSecondary">
              Freeride: no mapped route. Everyone follows the leader, and Ride Mode shows where each rider is.
            </ThemedText>
          ) : (
            <ThemedText themeColor="textSecondary">
              Draw the trail on the map or import a GPX file. Riders see it in Ride Mode with everyone placed along it.
            </ThemedText>
          )}
          {isManager && ride.status !== 'ended' && ride.status !== 'cancelled' ? (
            <Button
              title={route ? 'Edit Route' : ride.freeride ? 'Map a Route Anyway' : 'Build the Route'}
              kind={route || ride.freeride ? 'secondary' : 'primary'}
              onPress={() => router.push(`/ride/${ride.id}/route`)}
            />
          ) : null}
        </Card>
      ) : null}

      {isJoined && !cancelled && waypoints.switchedOn && (stops.length || (canPlanStops && ride.status !== 'ended')) ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <ThemedText type="heading">Planned Stops</ThemedText>
            {stops.length ? <ThemedText style={{ color: Colors.accent, fontWeight: 700 }}>{stops.length}</ThemedText> : null}
          </View>
          {stops.length ? (
            <View>
              {stops.map((w, i) => (
                <WaypointRow key={w.id} waypoint={w} stop={i + 1} me={me} ownerName={nameOf} first={i === 0} onPress={() => router.push(`/ride/${ride.id}/waypoints`)} />
              ))}
            </View>
          ) : (
            <ThemedText themeColor="textSecondary">
              {waypoints.stopsSwitchedOn
                ? 'Mark where the group will stop for fuel, lunch or camp. Every rider sees them numbered on the map, in order.'
                : PLANNED_STOPS_NOT_SWITCHED_ON}
            </ThemedText>
          )}
          {canPlanStops && ride.status !== 'ended' ? (
            <Button
              title="Add a Planned Stop"
              kind={stops.length ? 'secondary' : 'primary'}
              disabled={!waypoints.stopsSwitchedOn}
              onPress={() => router.push(`/ride/${ride.id}/waypoints?stop=1`)}
            />
          ) : null}
        </Card>
      ) : null}

      {isJoined && !cancelled ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <ThemedText type="heading">Waypoints</ThemedText>
            {otherWaypoints.length ? <ThemedText style={{ color: Colors.sky, fontWeight: 700 }}>{otherWaypoints.length}</ThemedText> : null}
          </View>
          {!waypoints.switchedOn ? (
            <ThemedText themeColor="textSecondary">{WAYPOINTS_NOT_SWITCHED_ON}</ThemedText>
          ) : otherWaypoints.length ? (
            <View>
              {otherWaypoints.slice(0, 3).map((w, i) => (
                <WaypointRow key={w.id} waypoint={w} me={me} ownerName={nameOf} first={i === 0} onPress={() => router.push(`/ride/${ride.id}/waypoints`)} />
              ))}
              {otherWaypoints.length > 3 ? (
                <ThemedText type="small" themeColor="textSecondary">and {otherWaypoints.length - 3} more</ThemedText>
              ) : null}
            </View>
          ) : (
            <ThemedText themeColor="textSecondary">
              {leaderIds.includes(me ?? '') || isManager
                ? 'Mark camp, fuel, a viewpoint or a hazard. Share each one with the whole ride, or keep it to yourself.'
                : 'Mark camp, fuel, a viewpoint or a hazard. Your waypoints are only for you; the leader’s shared ones show here too.'}
            </ThemedText>
          )}
          <Button
            title={otherWaypoints.length ? 'Open Waypoints Map' : 'Add a Waypoint'}
            kind={otherWaypoints.length ? 'secondary' : 'primary'}
            disabled={!waypoints.switchedOn}
            onPress={() => router.push(`/ride/${ride.id}/waypoints`)}
          />
        </Card>
      ) : null}

      {mine && ['joined', 'pending', 'waitlisted'].includes(mine.status) && (ride.status === 'scheduled' || ride.status === 'live') ? (
        <FuelCheck ride={ride} mine={mine} onChanged={load} />
      ) : null}

      <ErrorText error={error} />

      {cancelled ? null : !mine || mine.status === 'cancelled' || mine.status === 'declined' ? (
        ride.status === 'ended' ? (
          <ThemedText>This ride has ended.</ThemedText>
        ) : (
          <Button title={me ? (ride.join_policy === 'approval' ? 'Request to Join' : 'Join Ride') : 'Sign In to Join'} big loading={busy === 'join'} onPress={join} />
        )
      ) : mine.status === 'invited' ? (
        ride.status === 'ended' || ride.status === 'cancelled' ? (
          <ThemedText>This ride has {ride.status}.</ThemedText>
        ) : (
          <Card style={{ borderWidth: 2, borderColor: Colors.sky }}>
            <ThemedText type="heading">You’re Invited</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {ride.join_policy === 'approval' ? 'No waiting for approval: you’re on the list.' : 'Join to see the exact meeting spot and the group.'}
            </ThemedText>
            <Button title="Join Ride" big loading={busy === 'join'} onPress={join} />
            <Button title="No Thanks" kind="secondary" loading={busy === 'decline'} onPress={() => act('decline', () => declineRideInvite(ride.id))} />
          </Card>
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
            <Button title="I'm Here and Ready" kind="secondary" loading={busy === 'checkin'} onPress={() => act('checkin', () => checkIn(ride.id))} />
          ) : mine.checked_in_at ? (
            <ThemedText>Checked in at {time(mine.checked_in_at)}</ThemedText>
          ) : null}
        </View>
      )}

      {mine && ['joined', 'pending', 'waitlisted'].includes(mine.status) && ride.status !== 'cancelled' ? (
        <Button
          title="Plan What to Bring"
          kind="secondary"
          loading={busy === 'trip'}
          accessibilityHint="Opens your packing checklist for this ride"
          onPress={() => act('trip', async () => {
            // An existing trip for this ride always opens; a new one counts toward Free's one active trip.
            const existing = (await myTrips()).find((t) => t.ride_id === ride.id);
            if (!existing && !(await requireTripSlot())) return;
            const trip = existing ?? (await tripForRide(ride, mine.vehicle_id));
            router.push(`/trips/${trip.id}`);
          })}
        />
      ) : null}

      {!cancelled && !(justCreated && isManager) && (ride.visibility !== 'private' || mine?.status === 'joined') ? <InviteCard ride={ride} manager={isManager} /> : null}

      {isManager ? (
        <Card>
          <ThemedText type="heading">You’re Organizing</ThemedText>
          {ride.status === 'scheduled' ? (
            <Button title="Start Ride Mode" big loading={busy === 'start'} onPress={() => act('start', async () => { await setRideStatus(ride.id, 'live'); router.push(`/ride/${ride.id}/live`); })} />
          ) : null}
          {ride.status === 'live' ? (
            <Button title="End Ride for Everyone" kind="danger" loading={busy === 'end'} onPress={() => act('end', () => setRideStatus(ride.id, 'ended'))} />
          ) : null}
          {isOrganizer ? (
            <Button
              title={over ? 'Ride Again' : 'Copy This Ride'}
              kind={over ? 'primary' : 'secondary'}
              accessibilityHint="Starts a new ride with this one's details and route. You pick the day."
              onPress={() => requirePro('create_ride') && router.push(`/ride/new?copy=${ride.id}`)}
            />
          ) : null}
          {pending.map((m) => (
            <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <ThemedText style={{ flex: 1 }}>{m.profiles?.display_name || 'Rider'} wants to join</ThemedText>
              <Button title="Approve" onPress={() => act('approve', () => approveMember(ride.id, m.user_id, true))} />
              <Button title="Decline" kind="secondary" onPress={() => act('decline', () => approveMember(ride.id, m.user_id, false))} />
            </View>
          ))}
          {canCancel(ride.status, isManager) || isOrganizer ? (
            <View style={styles.callOff}>
              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                {canCancel(ride.status, isManager) ? (
                  <Button title="Cancel Ride" kind="ghost" style={{ flex: 1 }} loading={busy === 'cancel'} disabled={!!busy} onPress={cancel} />
                ) : null}
                {isOrganizer ? (
                  <Button title="Delete Ride" kind="ghost" style={{ flex: 1 }} loading={busy === 'delete'} disabled={!!busy} onPress={remove} />
                ) : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {over
                  ? 'Deleting removes the ride, its chat and its route for everyone.'
                  : 'Everyone who joined gets a notification and an email either way. Cancel keeps the ride in their list; delete removes it.'}
              </ThemedText>
            </View>
          ) : null}
        </Card>
      ) : null}

      {mine?.status === 'joined' ? (
        <RideRoster ride={ride} members={members} me={me} waitlisted={waitlist.length} onChanged={load} />
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
          // The one place that decides who can create polls: the ride's leaders, on a plan with polls,
          // unless the owner switched polls off.
          canPoll={pollsFlag && (isManager || leaderIds.includes(me ?? ''))}
          pollLocked={!can('create_poll')}
          pollsOn={chat.pollsOn}
          votes={chat.votes}
          onSendPoll={chat.sendPoll}
          onVote={(messageId, choice) => me && chat.vote(messageId, choice, me)}
          pending={chat.pending}
          onRetry={chat.retry}
          onDiscard={chat.discard}
          onResolve={chat.resolve}
          onClear={chat.clear}
          actionsOn={chat.actionsOn}
        />
      ) : null}

      {mine && mine.status !== 'cancelled' && mine.status !== 'invited' && mine.role !== 'organizer' ? (
        <Button title="Leave Ride" kind="secondary" onPress={() => act('leave', () => leaveRide(ride.id))} />
      ) : null}

      {me && !isOrganizer ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setReporting({ kind: 'ride', rideId: ride.id, name: ride.name })}
          hitSlop={6}
          style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three }}>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 13, textDecorationLine: 'underline' }}>Report Ride</ThemedText>
        </Pressable>
      ) : null}
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />

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

const styles = StyleSheet.create({
  cancelled: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    backgroundColor: Colors.backgroundElement,
  },
  callOff: { gap: Spacing.two, marginTop: Spacing.one, paddingTop: Spacing.three, borderTopWidth: 1, borderTopColor: Colors.backgroundSelected },
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
