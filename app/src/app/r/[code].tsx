import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DirectionsCard } from '@/components/directions';
import { PartOfEvent } from '@/components/events/part-of-event';
import { FollowLeaders } from '@/components/follow-leaders';
import { FuelCheck } from '@/components/fuel-check';
import { GetTheApp } from '@/components/get-the-app';
import { InviteCard } from '@/components/invite-card';
import { LeaveRide } from '@/components/leave-ride';
import { PinnedAnnouncement, RideChat } from '@/components/ride-chat';
import { ReportSheet } from '@/components/report-sheet';
import { RideDay } from '@/components/ride-day';
import { RideRoster } from '@/components/ride-roster';
import { RideSummary } from '@/components/ride-summary';
import { RouteSketch } from '@/components/route-sketch';
import { ThemedText } from '@/components/themed-text';
import { waypointDots } from '@/components/waypoint-blaze';
import { WaypointRow } from '@/components/waypoint-row';
import { TwoPane } from '@/components/two-pane';
import { Button, Card, ErrorText, Screen, Tag } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { withoutBlocked } from '@/core/blocks';
import { canCancel, cancelPrompt, deletePrompt, ridersToTell } from '@/core/cancel';
import { latestAnnouncement, rideLeaderIds } from '@/core/chat';
import { rideDirections } from '@/core/directions';
import { leadersToFollow } from '@/core/groups';
import { counts } from '@/core/joining';
import { sideColumnWidth } from '@/core/layout';
import { startsIn } from '@/core/ride-day';
import { miles, type RideRoute } from '@/core/route';
import { canShareWaypoints, plannedStops, PLANNED_STOPS_NOT_SWITCHED_ON, WAYPOINTS_NOT_SWITCHED_ON } from '@/core/waypoints';
import { useLayout } from '@/hooks/use-layout';
import { useRideChat } from '@/hooks/use-ride-chat';
import { useRideWaypoints } from '@/hooks/use-ride-waypoints';
import {
  approveMember, cancelRide, checkIn, deleteRide, getMembers, getPrivateDetails, getRide, getRideRoute, joinRide, setRideStatus,
  myTrips, tripForRide,
} from '@/lib/api';
import { track } from '@/lib/analytics';
import { useFlag } from '@/lib/app-settings';
import { confirmAndBlock, useBlocks } from '@/lib/blocks';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { declineRideInvite } from '@/lib/groups';
import { useEntitlements } from '@/lib/entitlements';
import { currentNotificationSettings } from '@/lib/notification-settings';
import { requirePro, requireTripSlot } from '@/lib/pro';
import { syncRideReminders } from '@/lib/push';
import { openStore } from '@/lib/rus';
import { useSession } from '@/lib/session';
import type { Ride, RideMember, RidePrivateDetails } from '@/lib/types';

import { t as tr } from '@/lib/i18n';
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The ride page. Works signed out (link preview on the web), so people can see the ride
 * before creating an account. Exact meeting point and roster only show once joined.
 */
export default function RidePage() {
  const { code, new: justCreated, section: startOn } = useLocalSearchParams<{ code: string; new?: string; section?: string }>();
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
  const [section, setSection] = useState<RideSection>(isRideSection(startOn) ? startOn : 'details');
  const [reporting, setReporting] = useState<ComponentProps<typeof ReportSheet>['target']>(null);
  const isJoined = members.some((m) => m.user_id === me && m.status === 'joined');
  const chat = useRideChat(ride?.id, isJoined);
  const blocks = useBlocks();
  const waypoints = useRideWaypoints(ride?.id, isJoined);
  const layout = useLayout();

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
      setError(e instanceof Error ? e.message : tr('Could not load the ride.'));
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
      setError(e instanceof Error ? e.message : tr('Something went wrong.'));
    } finally {
      setBusy(null);
    }
  }

  if (ride === undefined) return <Screen><ThemedText themeColor="textSecondary">{tr('Loading…')}</ThemedText></Screen>;
  if (ride === null) return <Screen><ThemedText>{tr('We couldn’t find that ride. Check the link or code.')}</ThemedText></Screen>;

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
    if (!(await confirmAsync(p.title, p.message, p.confirm, tr('Keep Ride')))) return;
    setBusy('cancel');
    try {
      await cancelRide(ride.id);
      resyncReminders();
      await load();
    } catch (e) {
      showNotice(tr('Couldn’t Cancel the Ride'), e instanceof Error ? e.message : tr('Something went wrong.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const p = deletePrompt(ride.name, toTell, over);
    if (!(await confirmAsync(p.title, p.message, p.confirm, tr('Keep Ride')))) return;
    setBusy('delete');
    try {
      await deleteRide(ride.id);
      resyncReminders();
      router.replace('/');
    } catch (e) {
      showNotice(tr('Couldn’t Delete the Ride'), e instanceof Error ? e.message : tr('Something went wrong.'));
      setBusy(null);
    }
  };

  // Riders on the ride get the page in four parts instead of one long scroll; anyone else sees the short version.
  const sectioned = isJoined && !cancelled;
  const chatBlock = isJoined ? (
    <RideChat
      // Chat and polls from riders this rider blocked are left out (announcements stay).
      messages={withoutBlocked(chat.messages, blocks.ids, me)}
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
      onReport={(userId) => setReporting({ kind: 'rider', userId, rideId: ride.id, name: nameOf(userId), source: 'ride_chat' })}
      onBlock={blocks.off ? undefined : (userId) => confirmAndBlock(userId, nameOf(userId))}
    />
  ) : null;

  // On a tablet or a wide window, a rider on the ride gets two panes: the ride and its details
  // stay on the left, and the map, riders or chat open beside them, so nobody loses the details
  // while checking the route or the chat.
  const split = layout.wide && sectioned;
  const mainSection: RideSection = split && section === 'details' ? 'map' : section;
  const show = (key: RideSection) => !sectioned || (split ? key === 'details' || key === mainSection : section === key);

  const top = (
    <>
      <GetTheApp inviteCode={ride.invite_code} />
      <View style={{ gap: Spacing.two }}>
        <PartOfEvent rideId={ride.id} />
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          {ride.status === 'live' ? <Tag label={tr('Live Now')} color={Colors.accent} solid /> : null}
          {countdown ? <Tag label={countdown} color={Colors.accent} /> : null}
          {ride.status === 'ended' ? <Tag label={tr('Ended')} color={Colors.textSecondary} /> : null}
          {ride.status === 'cancelled' ? <Tag label={tr('Cancelled')} color={Colors.danger} /> : null}
          {ride.difficulty ? <Tag label={cap(ride.difficulty)} color={Colors.sky} /> : null}
          <Tag label={ride.visibility === 'private' ? tr('Private, Invite Only') : ride.visibility === 'public' ? tr('Public') : tr('Anyone with the Link')} color={Colors.textSecondary} />
        </View>
        <ThemedText type="title" style={{ fontSize: 40, lineHeight: 42 }}>{ride.name}</ThemedText>
        <ThemedText style={{ color: Colors.sky, fontWeight: 700, fontSize: 17 }}>{when(ride.meet_at)}</ThemedText>
        {ride.description ? <ThemedText themeColor="textSecondary">{tr(ride.description)}</ThemedText> : null}
      </View>
      {cancelled ? (
        <View style={styles.cancelled} accessibilityRole="alert">
          <ThemedText type="heading">{tr('This Ride Is Cancelled')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {isManager
              ? tr('Everyone who had joined was sent a notification and an email.')
              : tr('{v} called it off. You don’t need to do anything.', { v: nameOf(ride.organizer_id) })}
          </ThemedText>
        </View>
      ) : null}
      {justCreated && isManager ? <InviteCard ride={ride} fresh manager onCodeChanged={(c) => router.setParams({ code: c })} /> : null}
      {pinned ? <PinnedAnnouncement message={pinned} senderName={nameOf(pinned.user_id)} /> : null}
      {ride.status === 'ended' && isJoined ? <RideSummary ride={ride} members={members} /> : null}

      {/* What to do next sits right under the name: start the ride, join, check in or enter Ride Mode. */}
      {isManager && ride.status === 'scheduled' ? (
        <Button title={tr('Start Ride Mode')} big loading={busy === 'start'} onPress={() => act('start', async () => { await setRideStatus(ride.id, 'live'); router.push(`/ride/${ride.id}/live`); })} />
      ) : null}
      {cancelled ? null : !mine || mine.status === 'cancelled' || mine.status === 'declined' ? (
        ride.status === 'ended' ? (
          <ThemedText>{tr('This ride has ended.')}</ThemedText>
        ) : (
          <Button title={me ? (ride.join_policy === 'approval' ? tr('Request to Join') : tr('Join Ride')) : tr('Sign In to Join')} big loading={busy === 'join'} onPress={join} />
        )
      ) : mine.status === 'invited' ? (
        ride.status === 'ended' || ride.status === 'cancelled' ? (
          <ThemedText>{tr('This ride has {status}.', { status: ride.status })}</ThemedText>
        ) : (
          <Card style={{ borderWidth: 2, borderColor: Colors.sky }}>
            <ThemedText type="heading">{tr('You’re Invited')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {ride.join_policy === 'approval' ? tr('No waiting for approval: you’re on the list.') : tr('Join to see the exact meeting spot and the group.')}
            </ThemedText>
            <Button title={tr('Join Ride')} big loading={busy === 'join'} onPress={join} />
            <Button title={tr('No Thanks')} kind="secondary" loading={busy === 'decline'} onPress={() => act('decline', () => declineRideInvite(ride.id))} />
          </Card>
        )
      ) : mine.status === 'pending' ? (
        <ThemedText>{tr('Your request is waiting for the organizer.')}</ThemedText>
      ) : mine.status === 'waitlisted' ? (
        <ThemedText>{tr('You’re on the waitlist. You’ll move up automatically if a spot opens.')}</ThemedText>
      ) : (
        <View style={{ gap: Spacing.two }}>
          {ride.status === 'live' ? (
            <Button title={tr('Enter Ride Mode')} big onPress={() => router.push(`/ride/${ride.id}/live`)} />
          ) : null}
          {!mine.checked_in_at && ride.status !== 'ended' ? (
            <Button title={tr('I\'m Here and Ready')} kind="secondary" loading={busy === 'checkin'} onPress={() => act('checkin', () => checkIn(ride.id))} />
          ) : mine.checked_in_at ? (
            <ThemedText>{tr('Checked in at {v}', { v: time(mine.checked_in_at) })}</ThemedText>
          ) : null}
        </View>
      )}
      <ErrorText error={error} />

    </>
  );
  const tabs = sectioned ? (
    <SectionTabs
      value={mainSection}
      onChange={setSection}
      counts={{ riders: isManager ? pending.length : null }}
      sections={split ? SECTIONS.filter((x) => x.key !== 'details') : SECTIONS}
    />
  ) : null;
  const detailsBlock = (
    <>
      {show('details') ? (
        <>
          <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
            {(
              [
                ['Meet', details ? `${details.meet_label ?? 'Pinned location'} (${details.meet_lat.toFixed(4)}, ${details.meet_lng.toFixed(4)})` : ride.meet_area_label ? tr('Near {meet_area_label}', { meet_area_label: ride.meet_area_label }) : tr('Shown after you join')],
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
          {mine && ['joined', 'pending', 'waitlisted'].includes(mine.status) && (ride.status === 'scheduled' || ride.status === 'live') ? (
            <FuelCheck ride={ride} mine={mine} onChanged={load} />
          ) : null}
          {mine && ['joined', 'pending', 'waitlisted'].includes(mine.status) && ride.status !== 'cancelled' ? (
            <Button
              title={tr('Plan What to Bring')}
              kind="secondary"
              loading={busy === 'trip'}
              accessibilityHint={tr('Opens your packing checklist for this ride')}
              onPress={() => act('trip', async () => {
                // An existing trip for this ride always opens; a new one counts toward Free's one active trip.
                const existing = (await myTrips()).find((t) => t.ride_id === ride.id);
                if (!existing && !(await requireTripSlot())) return;
                const trip = existing ?? (await tripForRide(ride, mine.vehicle_id));
                router.push(`/trips/${trip.id}`);
              })}
            />
          ) : null}
        </>
      ) : null}

      {show('details') && isManager && (ride.status === 'live' || canCancel(ride.status, isManager) || isOrganizer) ? (
        <Card>
          <ThemedText type="heading">{tr('You’re Organizing')}</ThemedText>
          {ride.status === 'live' ? (
            <Button title={tr('End Ride for Everyone')} kind="danger" loading={busy === 'end'} onPress={() => act('end', () => setRideStatus(ride.id, 'ended'))} />
          ) : null}
          {isOrganizer ? (
            <Button
              title={over ? tr('Ride Again') : tr('Copy This Ride')}
              kind={over ? 'primary' : 'secondary'}
              accessibilityHint={tr('Starts a new ride with this one\'s details and route. You pick the day.')}
              onPress={() => requirePro('create_ride') && router.push(`/ride/new?copy=${ride.id}`)}
            />
          ) : null}
          {canCancel(ride.status, isManager) || isOrganizer ? (
            <View style={[styles.callOff, ride.status !== 'live' && !isOrganizer && styles.callOffAlone]}>
              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                {canCancel(ride.status, isManager) ? (
                  <Button title={tr('Cancel Ride')} kind="ghost" style={{ flex: 1 }} loading={busy === 'cancel'} disabled={!!busy} onPress={cancel} />
                ) : null}
                {isOrganizer ? (
                  <Button title={tr('Delete Ride')} kind="ghost" style={{ flex: 1 }} loading={busy === 'delete'} disabled={!!busy} onPress={remove} />
                ) : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {over
                  ? tr('Deleting removes the ride, its chat and its route for everyone.')
                  : tr('Everyone who joined gets a notification and an email either way. Cancel keeps the ride in their list; delete removes it.')}
              </ThemedText>
            </View>
          ) : null}
        </Card>
      ) : null}

    </>
  );
  const sectionBlocks = (
    <>
      {show('map') ? (
        <>
          {details && (route || (isManager && ride.status !== 'ended' && ride.status !== 'cancelled')) ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <ThemedText type="heading">{route?.name || (ride.freeride ? tr('Freeride') : tr('The Route'))}</ThemedText>
                {route ? <ThemedText style={{ color: Colors.sky, fontWeight: 700 }}>{tr('{v} mi', { v: miles(route.lengthM) })}</ThemedText> : null}
              </View>
              {route ? (
                <>
                  <RouteSketch
                    points={route.points}
                    dots={waypointDots(waypoints.waypoints)}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    {ride.status === 'live'
                      ? tr('Open Ride Mode to see where you and everyone else are on it.')
                      : tr('Saved on your phone once you’ve opened it, so it’s there without signal.')}
                  </ThemedText>
                </>
              ) : ride.freeride ? (
                <ThemedText themeColor="textSecondary">
                  {tr('Freeride: no mapped route. Everyone follows the leader, and Ride Mode shows where each rider is.')}
                </ThemedText>
              ) : (
                <ThemedText themeColor="textSecondary">
                  {tr('Draw the trail on the map or import a GPX file. Riders see it in Ride Mode with everyone placed along it.')}
                </ThemedText>
              )}
              {isManager && ride.status !== 'ended' && ride.status !== 'cancelled' ? (
                <Button
                  title={route ? tr('Edit Route') : ride.freeride ? tr('Map a Route Anyway') : tr('Build the Route')}
                  kind={route || ride.freeride ? 'secondary' : 'primary'}
                  pro="route_builder"
                  onPress={() => requirePro('route_builder') && router.push(`/ride/${ride.id}/route`)}
                />
              ) : null}
            </Card>
          ) : null}
          {isJoined && !cancelled && waypoints.switchedOn && (stops.length || (canPlanStops && ride.status !== 'ended')) ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <ThemedText type="heading">{tr('Planned Stops')}</ThemedText>
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
                    ? tr('Mark where the group will stop for fuel, lunch or camp. Every rider sees them numbered on the map, in order.')
                    : PLANNED_STOPS_NOT_SWITCHED_ON}
                </ThemedText>
              )}
              {canPlanStops && ride.status !== 'ended' ? (
                <Button
                  title={tr('Add a Planned Stop')}
                  kind={stops.length ? 'secondary' : 'primary'}
                  disabled={!waypoints.stopsSwitchedOn}
                  pro="waypoints"
                  onPress={() => requirePro('waypoints') && router.push(`/ride/${ride.id}/waypoints?stop=1`)}
                />
              ) : null}
            </Card>
          ) : null}
          {isJoined && !cancelled ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <ThemedText type="heading">{tr('Waypoints')}</ThemedText>
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
                    <ThemedText type="small" themeColor="textSecondary">{tr('and {v} more', { v: otherWaypoints.length - 3 })}</ThemedText>
                  ) : null}
                </View>
              ) : (
                <ThemedText themeColor="textSecondary">
                  {leaderIds.includes(me ?? '') || isManager
                    ? tr('Mark camp, fuel, a viewpoint or a hazard. Share each one with the whole ride, or keep it to yourself.')
                    : tr('Mark camp, fuel, a viewpoint or a hazard. Your waypoints are only for you; the leader’s shared ones show here too.')}
                </ThemedText>
              )}
              <Button
                title={otherWaypoints.length ? tr('Open Waypoints Map') : tr('Add a Waypoint')}
                kind={otherWaypoints.length ? 'secondary' : 'primary'}
                disabled={!waypoints.switchedOn}
                pro={otherWaypoints.length ? undefined : 'waypoints'}
                onPress={() => (otherWaypoints.length || requirePro('waypoints')) && router.push(`/ride/${ride.id}/waypoints`)}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {show('riders') ? (
        <>
          {isManager && pending.length ? (
            <Card>
              <ThemedText type="heading">{tr('Waiting for You')}</ThemedText>
              {pending.map((m) => (
                <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <ThemedText style={{ flex: 1 }}>{tr('{v} wants to join', { v: m.profiles?.display_name || tr('Rider') })}</ThemedText>
                  <Button title={tr('Approve')} onPress={() => act('approve', () => approveMember(ride.id, m.user_id, true))} />
                  <Button title={tr('Decline')} kind="secondary" onPress={() => act('decline', () => approveMember(ride.id, m.user_id, false))} />
                </View>
              ))}
            </Card>
          ) : null}
          {me && ride.status !== 'cancelled' ? <FollowLeaders ids={leadersToFollow(ride.organizer_id, leaderIds, me)} organizerId={ride.organizer_id} /> : null}
          {!cancelled && !(justCreated && isManager) && (ride.visibility !== 'private' || mine?.status === 'joined') ? <InviteCard ride={ride} manager={isManager} onCodeChanged={(c) => router.setParams({ code: c })} /> : null}
          {mine?.status === 'joined' ? (
            <RideRoster ride={ride} members={members} me={me} waitlisted={waitlist.length} onChanged={load} />
          ) : null}
        </>
      ) : null}

      {show('chat') ? chatBlock : null}
    </>
  );
  const bottom = (
    <>
      {/* Leaving is always one tap away, whichever section is open: riders confirm, the organizer picks who takes over. */}
      <LeaveRide
        ride={ride}
        members={members}
        me={me}
        skip={['decline']}
        onLeft={(what) => {
          track(what === 'left' ? 'ride_left' : 'ride_cancelled_on_leave', { ride_id: ride.id });
          router.replace('/');
        }}
        style={{ marginTop: Spacing.two }}
      />
      {me && !isOrganizer ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setReporting({ kind: 'ride', rideId: ride.id, name: ride.name, source: 'ride' })}
          hitSlop={6}
          style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three }}>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 13, textDecorationLine: 'underline' }}>{tr('Report Ride')}</ThemedText>
        </Pressable>
      ) : null}
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={tr('OnMyLead is presented by RUS Offroad')}
        onPress={() => openStore('ride_page')}
        style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 13 }}>{tr('Presented by RUS Offroad')}</ThemedText>
      </Pressable>
    </>
  );

  if (split) {
    return (
      <TwoPane
        sideWidth={sideColumnWidth(layout.width)}
        side={<>{top}{detailsBlock}{bottom}</>}
        main={<>{tabs}{sectionBlocks}</>}
      />
    );
  }

  return (
    <Screen width={sectioned ? 'page' : 'readable'}>
      {top}
      {tabs}
      {detailsBlock}
      {sectionBlocks}
      {bottom}
    </Screen>
  );
}

type RideSection = 'details' | 'map' | 'riders' | 'chat';
const SECTIONS: { key: RideSection; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'map', label: 'Map' },
  { key: 'riders', label: 'Riders' },
  { key: 'chat', label: 'Chat' },
];
const isRideSection = (v: unknown): v is RideSection => SECTIONS.some((s) => s.key === v);

/** The ride page's four parts. The one you're on is underlined in red; a red count means riders are waiting on you. */
function SectionTabs({
  value, onChange, counts, sections = SECTIONS,
}: {
  value: RideSection;
  onChange: (v: RideSection) => void;
  counts: Partial<Record<RideSection, number | null>>;
  /** On a tablet the details stay on the left, so the tabs beside them are just Map, Riders and Chat. */
  sections?: typeof SECTIONS;
}) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {sections.map((s) => {
        const on = s.key === value;
        const count = counts[s.key];
        return (
          <Pressable
            key={s.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={count ? `${s.label}, ${count} waiting` : s.label}
            onPress={() => onChange(s.key)}
            style={styles.tab}>
            <Text style={[styles.tabLabel, { color: on ? Colors.text : Colors.textSecondary }]}>{tr(s.label)}</Text>
            {count ? (
              <View style={styles.tabCount}>
                <Text style={styles.tabCountText}>{count}</Text>
              </View>
            ) : null}
            <View style={[styles.tabLine, { backgroundColor: on ? Colors.accent : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
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

const styles = themedStyles(() => ({
  cancelled: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    backgroundColor: Colors.backgroundElement,
  },
  callOff: { gap: Spacing.two, marginTop: Spacing.one, paddingTop: Spacing.three, borderTopWidth: 1, borderTopColor: Colors.backgroundSelected },
  callOffAlone: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.backgroundSelected },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, flexDirection: 'row', gap: 6 },
  tabLine: { position: 'absolute', left: 10, right: 10, bottom: -1, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  tabLabel: { fontFamily: font(700, 'display'), fontSize: 19, lineHeight: 22 },
  tabCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  tabCountText: { color: '#fff', fontFamily: font(700), fontSize: 12, lineHeight: 14 },
}));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
