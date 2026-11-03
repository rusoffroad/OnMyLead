import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { type ReactElement, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppNotices } from '@/components/app-notices';
import { BadgeStrip } from '@/components/badge-strip';
import { FeedList, FeedSheet } from '@/components/home/feed';
import { GroupCard, NoGroupCard } from '@/components/home/group-card';
import { EventsCard } from '@/components/home/events-card';
import { MapModeCard } from '@/components/home/map-mode-card';
import { HeadLink, Home, homeStyles, Initial, SectionHead } from '@/components/home/parts';
import { PublicRidesRail, RadiusChip, RadiusSheet } from '@/components/home/public-rides';
import { ActionTiles, JoinHero } from '@/components/home/ride-actions';
import { HelpRow, Toolkit } from '@/components/home/toolkit';
import { Icon } from '@/components/icon';
import { InboxBell } from '@/components/inbox-bell';
import { Logo } from '@/components/logo';
import { ProLock } from '@/components/pro-gate';
import { RideRow, RowGroup } from '@/components/ride-row';
import { RiderPhoto } from '@/components/rider-photo';
import { Showcase } from '@/components/showcase';
import { ROW_ACTION_HINT, SwipeRow } from '@/components/swipe-row';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { flagOn } from '@/core/app-settings';
import type { MyBadges } from '@/core/badges';
import { deletePrompt, leavePrompt, ridersToTell } from '@/core/cancel';
import { DEFAULT_FEED_SETTINGS, FEED_NOT_SWITCHED_ON, type FeedSettings } from '@/core/feed';
import type { SocialItem } from '@/core/social';
import type { GroupChatSummary } from '@/core/group-chat';
import { createQuota, findCount, firstName, greeting, parseRadius, RADIUS_STORAGE_KEY, toolkitFor } from '@/core/home';
import { historySplit } from '@/core/pro';
import { rowActionFor } from '@/core/row-swipe';
import { TRACK_LINE_SWITCH_KEY } from '@/core/track-line';
import { useLayout } from '@/hooks/use-layout';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useTheme } from '@/hooks/use-theme';
import { deleteRide, discoverPublicRides, getMembers, leaveRide, myRideName, myRides, publicRidesNear } from '@/lib/api';
import { useAppSettings } from '@/lib/app-settings';
import { fetchMyBadges } from '@/lib/badges';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { useEntitlements } from '@/lib/entitlements';
import { FeedOffError, homeFeed, myFeedSettings, saveFeedSettings } from '@/lib/feed';
import { myGroupChats } from '@/lib/group-chat';
import { myGroups, type RidingGroup } from '@/lib/groups';
import { positionIfAllowed } from '@/lib/location';
import { publicTrailsIn } from '@/lib/nav-trails';
import { currentNotificationSettings } from '@/lib/notification-settings';
import { requirePro } from '@/lib/pro';
import { syncRideReminders } from '@/lib/push';
import { useSession } from '@/lib/session';
import { isBackendConfigured } from '@/lib/supabase';
import { setTrackLineOn } from '@/lib/track-line';
import type { Ride, RideMember } from '@/lib/types';

/** Feed posts shown before Show More: enough to feel alive, not enough to scroll past everything else. */
const FEED_SHOWN = 4;
/** Public ride cards in the rail. Find a Ride has every one of them on the map. */
const RAIL_MAX = 10;

type Mine = RideMember & { rides: Ride };
type Near = Ride & { distanceMi?: number };

/** Rider trails around a spot, counted once per app session (it's a pill, not a live number). */
let trailCount: { key: string; n: number } | null = null;

export default function HomeScreen() {
  const theme = useTheme();
  const layout = useLayout();
  const { session, loading } = useSession();
  const { ent } = useEntitlements();
  const { settings } = useAppSettings();
  const findOn = flagOn(settings, 'find_a_ride');
  const navOn = flagOn(settings, 'nav_mode');
  const feedOn = flagOn(settings, 'home_feed');
  const tools = toolkitFor({ trip_planner: flagOn(settings, 'trip_planner'), starlink: flagOn(settings, 'starlink') });

  const [mine, setMine] = useState<Mine[]>([]);
  const [nearby, setNearby] = useState<Near[]>([]);
  const [located, setLocated] = useState(false);
  const [radius, setRadius] = useState<number | null>(null);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The rider's ride name; null until loaded (or if it couldn't load), '' when they haven't picked one. */
  const [rideName, setRideName] = useState<string | null>(null);
  const [groups, setGroups] = useState<RidingGroup[] | null>(null);
  const [chats, setChats] = useState<GroupChatSummary[]>([]);
  const [badges, setBadges] = useState<MyBadges | null>(null);
  const [feed, setFeed] = useState<SocialItem[] | null>(null);
  const [feedOff, setFeedOff] = useState(false);
  const [feedSettings, setFeedSettings] = useState<FeedSettings>(DEFAULT_FEED_SETTINGS);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedAll, setFeedAll] = useState(false);
  const [moreRides, setMoreRides] = useState(false);
  const [trailsNear, setTrailsNear] = useState<number | null>(trailCount?.n ?? null);
  const [trackOn, , setTrackSwitch] = useRememberedToggle(TRACK_LINE_SWITCH_KEY, false);

  // Signing out (or into another account) must not leave the last rider's things on screen.
  const uid = session?.user.id;
  const [shownFor, setShownFor] = useState(uid);
  if (shownFor !== uid) {
    setShownFor(uid);
    setMine([]);
    setRideName(null);
    setGroups(null);
    setChats([]);
    setBadges(null);
    setFeed(null);
    setFeedSettings(DEFAULT_FEED_SETTINGS);
    setError(null);
  }

  // How far Public Rides Near You looks, remembered on this phone.
  useEffect(() => {
    AsyncStorage.getItem(RADIUS_STORAGE_KEY)
      .then((v) => setRadius(parseRadius(v)))
      .catch(() => setRadius(parseRadius(null)));
  }, []);

  const loadNearby = useCallback(async (mi: number) => {
    // Never asks for location here: with it, rides sort by distance; without it, every public ride.
    const at = await positionIfAllowed();
    setLocated(!!at);
    if (at && mi > 0) return publicRidesNear(at, mi);
    return discoverPublicRides();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isBackendConfigured) return;
      if (findOn && radius != null) loadNearby(radius).then(setNearby).catch((e) => setError(e.message));
      if (!session) return;
      myRides().then(setMine).catch((e) => setError(e.message));
      myRideName().then(setRideName).catch(() => setRideName(null));
      myGroups().then(setGroups).catch(() => setGroups([]));
      myGroupChats().then(setChats).catch(() => setChats([]));
      fetchMyBadges().then(setBadges).catch(() => setBadges(null));
      if (feedOn) {
        homeFeed(20)
          .then((f) => {
            setFeed(f);
            setFeedOff(false);
          })
          .catch((e) => {
            setFeed([]);
            setFeedOff(e instanceof FeedOffError);
          });
        myFeedSettings().then(setFeedSettings).catch(() => {});
      }
    }, [session, findOn, feedOn, radius, loadNearby]),
  );

  // The rider-trail count on the Map Mode card, near wherever the phone is (only if location is allowed).
  useEffect(() => {
    if (!navOn || !session || trailCount) return;
    let gone = false;
    positionIfAllowed()
      .then(async (at) => {
        if (!at) return;
        const d = 0.75;
        const found = await publicTrailsIn({ minLat: at.lat - d, maxLat: at.lat + d, minLng: at.lng - d, maxLng: at.lng + d });
        trailCount = { key: `${at.lat.toFixed(1)},${at.lng.toFixed(1)}`, n: found.length };
        if (!gone) setTrailsNear(found.length);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [navOn, session]);

  // On onmylead.com, signed-out visitors get the showcase; signed-in riders get the app.
  if (Platform.OS === 'web' && !session) {
    return loading ? <View style={{ flex: 1, backgroundColor: theme.background }} /> : <Showcase />;
  }

  if (!isBackendConfigured) {
    return (
      <Screen top>
        <Logo />
        <ThemedText type="subtitle">Almost Ready</ThemedText>
        <ThemedText>Add the backend keys to app/.env (see .env.example), then restart the app.</ThemedText>
      </Screen>
    );
  }

  /** Swipe left on one of your rides: the organizer deletes it, anyone else leaves (or declines the invite). */
  const swipeAway = async (m: Mine): Promise<boolean> => {
    const ride = m.rides;
    const action = rowActionFor(m, ride.organizer_id, uid);
    let p;
    if (action === 'delete') {
      const members = await getMembers(ride.id).catch(() => []);
      p = deletePrompt(ride.name, ridersToTell(members, uid), ride.status === 'ended' || ride.status === 'cancelled');
    } else {
      p = leavePrompt(ride.name, ride.status, action === 'decline');
    }
    if (!(await confirmAsync(p.title, p.message, p.confirm, 'Keep Ride'))) return false;
    try {
      await (action === 'delete' ? deleteRide(ride.id) : leaveRide(ride.id));
    } catch (e) {
      const what = action === 'delete' ? 'Delete' : action === 'decline' ? 'Decline' : 'Leave';
      showNotice(`Couldn’t ${what} the Ride`, e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    }
    setMine((all) => all.filter((x) => x.ride_id !== m.ride_id));
    syncRideReminders(currentNotificationSettings().reminder_minutes);
    myRides().then(setMine).catch(() => {});
    return true;
  };
  const swipeRow = (m: Mine, row: ReactElement) => (
    <SwipeRow key={m.ride_id} action={rowActionFor(m, m.rides.organizer_id, uid)} onAction={() => swipeAway(m)}>
      {row}
    </SwipeRow>
  );

  const live = mine.find((m) => m.rides?.status === 'live' && m.status === 'joined');
  // Invitations (from a riding group) get their own list; the rest are rides you're on.
  const invites = mine.filter((m) => m.status === 'invited' && (m.rides?.status === 'scheduled' || m.rides?.status === 'live'));
  const yours = mine.filter((m) => m.status !== 'invited');
  const isPast = (m: Mine) => m.rides?.status === 'ended' || m.rides?.status === 'cancelled';
  const going = yours.filter((m) => !isPast(m)).sort((a, b) => Date.parse(a.rides.meet_at) - Date.parse(b.rides.meet_at));
  // Past rides, newest first. Free shows the last few; nothing is deleted, and live or upcoming rides are never hidden.
  const past = historySplit(
    yours.filter(isPast).sort((a, b) => Date.parse(b.rides.meet_at) - Date.parse(a.rides.meet_at)),
    ent.historyLimit,
  );
  const mineIds = new Set(mine.map((m) => m.ride_id));
  const others = nearby.filter((r) => !mineIds.has(r.id));
  const openCode = () => {
    if (code.trim().length < 4) return;
    router.push(`/r/${code.trim().toUpperCase()}`);
  };

  // The group card shows the group with the newest chat, else the first one (yours first).
  const chatFor = (id: string) => chats.find((c) => c.group_id === id) ?? null;
  const group = groups?.length
    ? [...groups].sort((a, b) => Date.parse(chatFor(b.id)?.last_at ?? '0') - Date.parse(chatFor(a.id)?.last_at ?? '0'))[0]
    : null;
  const outIds = new Set((feed ?? []).filter((f) => f.kind === 'out').map((f) => f.actorId));
  const groupOut = group ? group.riders.filter((r) => r.id !== uid && outIds.has(r.id)).length : 0;
  const friendsOut = outIds.size;

  const name = firstName(rideName);
  const narrowColumn = layout.expanded;
  const railWidth = narrowColumn ? 250 : Math.min(300, Math.round(Math.min(layout.width, 800) * 0.72));

  const pickRadius = (mi: number) => {
    setRadius(mi);
    AsyncStorage.setItem(RADIUS_STORAGE_KEY, String(mi)).catch(() => {});
  };
  const switchTrack = (on: boolean) => {
    setTrackSwitch(on);
    setTrackLineOn(on);
  };

  const header = (
    <View style={styles.top}>
      <View style={styles.logo}>
        <Logo height={52} />
      </View>
      {session ? (
        <View style={styles.topRight}>
          <InboxBell compact />
          <Pressable accessibilityRole="button" accessibilityLabel="You: profile and settings" hitSlop={4} onPress={() => router.push('/profile')}>
            <View style={styles.avatar}>
              <RiderPhoto userId={uid} size={40} zoom={false} fallback={<Initial name={name || 'R'} size={40} />} ring={0} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const hello = (
    <View style={{ gap: 6 }}>
      <Text style={styles.hello} accessibilityRole="header">
        {greeting()}{name ? `, ${name}` : ''}
      </Text>
      {friendsOut > 0 ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/out-riding')} style={styles.pulseRow}>
          <View style={styles.pulse} />
          <Text style={homeStyles.muted}>
            {friendsOut} {friendsOut === 1 ? 'friend is' : 'friends are'} out riding now
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const nudgeAndLive = (
    <>
      <AppNotices />
      {session && rideName === '' ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/ride-name')} style={styles.nudge}>
          <View style={{ flex: 1 }}>
            <ThemedText type="heading">Pick Your Ride Name</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Other riders see you as Rider until you do. A nickname works.</ThemedText>
          </View>
          <Icon name="chevron" color={theme.textSecondary} />
        </Pressable>
      ) : null}
      {live ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/ride/${live.ride_id}/live`)} style={styles.live}>
          <View style={styles.liveDot} />
          <View style={{ flex: 1 }}>
            <ThemedText type="heading" numberOfLines={1}>{live.rides.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Your ride is live. Tap to open Ride Mode</ThemedText>
          </View>
          <Icon name="chevron" color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </>
  );

  const actions = (
    <>
      <JoinHero code={code} onCode={setCode} onOpen={openCode} />
      <ActionTiles
        quota={session ? createQuota(ent) : null}
        findOn={findOn}
        findText={radius != null ? findCount(others.length, located ? radius : 0) : null}
        onCreate={() => (session ? requirePro('create_ride') && router.push('/ride/new') : router.push('/sign-in'))}
        onFind={() => router.push('/find')}
      />
      {navOn ? <MapModeCard trailsNear={trailsNear} trackOn={trackOn} onTrack={switchTrack} /> : null}
      <EventsCard signedIn={!!session} radius={radius} />
      {!loading && !session ? (
        <Button title="Sign In or Create a Free Account" kind="ghost" onPress={() => router.push('/sign-in?mode=create')} />
      ) : null}
    </>
  );

  const ridesBlock = (
    <>
      {invites.length ? (
        <Block title="Ride Invites">
          <RowGroup>{invites.map((m) => swipeRow(m, <RideRow ride={m.rides} note="You’re invited. Tap to join" />))}</RowGroup>
        </Block>
      ) : null}
      {going.length ? (
        <Block
          title={going.length === 1 || !moreRides ? 'Your Next Ride' : 'Your Rides'}
          right={going.length > 1 ? (
            <HeadLink title={moreRides ? 'Show Less' : `All ${going.length}`} onPress={() => setMoreRides(!moreRides)} label={moreRides ? 'Show only your next ride' : `Show all ${going.length} of your rides`} />
          ) : undefined}>
          <RowGroup>
            {(moreRides ? going : going.slice(0, 1)).map((m) =>
              swipeRow(m, <RideRow ride={m.rides} note={m.status === 'joined' ? roleLabel(m.role) : m.status.replace('_', ' ')} />))}
          </RowGroup>
          {ROW_ACTION_HINT ? <Text style={[homeStyles.muted, { fontSize: 12 }]}>{ROW_ACTION_HINT}</Text> : null}
        </Block>
      ) : null}
    </>
  );

  const groupBlock = session && groups ? (
    <Block title="Your Group" right={groups.length > 1 ? <HeadLink title={`All ${groups.length}`} onPress={() => router.push('/groups')} /> : undefined}>
      {group ? <GroupCard group={group} chat={chatFor(group.id)} outNow={groupOut} uid={uid} /> : <NoGroupCard />}
    </Block>
  ) : null;

  const publicBlock = findOn ? (
    <Block title="Public Rides Near You" right={radius != null ? <RadiusChip radius={located ? radius : 0} onPress={() => setRadiusOpen(true)} /> : undefined}>
      {others.length ? (
        <PublicRidesRail rides={others.slice(0, RAIL_MAX)} width={railWidth} />
      ) : (
        <Text style={homeStyles.muted}>
          {radius != null && located && radius > 0
            ? `No public rides coming up within ${radius.toLocaleString('en-US')} miles. Widen the distance, or create one and it shows here for everyone.`
            : 'No public rides coming up. Create one and it shows here for everyone.'}
        </Text>
      )}
      {others.length > RAIL_MAX ? (
        <Button title={`See All ${others.length} on the Map`} kind="secondary" onPress={() => router.push('/find')} />
      ) : null}
    </Block>
  ) : null;

  const feedBlock = session && feedOn ? (
    <Block
      title="Feed"
      right={feedOff ? undefined : (
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <HeadLink title="Customize" onPress={() => setFeedOpen(true)} label="Customize your feed" />
          <HeadLink title="Open Social" onPress={() => router.push('/social')} label="Open Social: all your friends, activity and comments" />
        </View>
      )}>
      {feed == null ? null : feedOff ? (
        <Text style={homeStyles.muted}>{FEED_NOT_SWITCHED_ON}</Text>
      ) : (
        <>
          <FeedList
            items={feedAll ? feed : feed.slice(0, FEED_SHOWN)}
            onChange={(i, next) => setFeed((list) => (list ? list.map((x, j) => (j === i ? next : x)) : list))}
            emptyText={feedSettings.kinds.length
              ? 'Nothing new yet. When friends ride, earn badges or share trails, it shows here.'
              : 'Everything is switched off in Customize.'}
          />
          {feed.length > FEED_SHOWN ? (
            <HeadLink title={feedAll ? 'Show Less' : `Show ${feed.length - FEED_SHOWN} More`} onPress={() => setFeedAll(!feedAll)} />
          ) : null}
        </>
      )}
    </Block>
  ) : null;

  const badgeBlock = session && badges ? (
    <Block title="Your Badges" right={<HeadLink title="See All" onPress={() => router.push('/badges')} label="See all badges" />}>
      <BadgeStrip mine={badges} />
    </Block>
  ) : null;

  const pastBlock = past.shown.length ? (
    <Block title="Past Rides">
      <RowGroup>
        {past.shown.map((m) => swipeRow(m, <RideRow ride={m.rides} note={m.rides.status === 'cancelled' ? 'Cancelled' : 'Ended'} />))}
      </RowGroup>
      {past.hidden ? (
        <ProLock
          feature="ride_history"
          title={`See ${past.hidden} Older ${past.hidden === 1 ? 'Ride' : 'Rides'}`}
          detail={`Free shows your last ${past.shown.length}. They’re all saved.`}
        />
      ) : null}
    </Block>
  ) : null;

  const toolkitBlock = session ? (
    <Block title="Your Toolkit">
      <Toolkit tools={tools} columns={4} />
    </Block>
  ) : null;

  const sheets = (
    <>
      <RadiusSheet visible={radiusOpen} radius={radius ?? 0} located={located} onPick={pickRadius} onClose={() => setRadiusOpen(false)} />
      {session && feedOn ? (
        <FeedSheet
          visible={feedOpen}
          settings={feedSettings}
          onClose={() => setFeedOpen(false)}
          onSave={async (s) => {
            await saveFeedSettings(s);
            setFeedSettings(s);
            homeFeed(20).then(setFeed).catch(() => {});
          }}
        />
      ) : null}
    </>
  );

  // On a tablet in landscape (or a wide window) the ride actions, Map Mode and the toolkit stay on
  // the left and the rides, group, feed and badges sit beside them, instead of one long column.
  return (
    <>
      <Screen top width={layout.expanded ? 'wide' : 'readable'}>
        <View style={{ gap: 28 }}>
          {header}
          {layout.expanded ? (
            <View style={styles.columns}>
              <View style={styles.column}>
                {hello}
                {nudgeAndLive}
                {actions}
                {toolkitBlock}
                <HelpRow />
              </View>
              <View style={styles.column}>
                {ridesBlock}
                {groupBlock}
                {publicBlock}
                {feedBlock}
                {badgeBlock}
                {pastBlock}
              </View>
            </View>
          ) : (
            <>
              {hello}
              {nudgeAndLive}
              {actions}
              {ridesBlock}
              {groupBlock}
              {publicBlock}
              {feedBlock}
              {badgeBlock}
              {toolkitBlock}
              {pastBlock}
              <HelpRow />
            </>
          )}
          <ErrorText error={error} />
        </View>
      </Screen>
      {sheets}
    </>
  );
}

/** A home screen section: title (and a link or chip), then its content. */
function Block({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <SectionHead title={title} right={right} />
      {children}
    </View>
  );
}

const roleLabel = (role: RideMember['role']) =>
  ({ organizer: 'You Organize', co_organizer: 'Co-Organizer', leader: 'You Lead', sweep: 'Tail Gunner', rider: 'Going' })[role];

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.one },
  logo: { width: 66, height: 52 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(230,194,122,0.5)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hello: { color: Colors.text, fontFamily: font(600), fontSize: 28, lineHeight: 33 },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: Home.mint },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.five },
  column: { flex: 1, minWidth: 0, gap: 28 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.card, borderWidth: 2, borderColor: Colors.accent, padding: 14, backgroundColor: Home.panel },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent },
  nudge: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.card, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.sky,
    backgroundColor: Home.panel,
  },
});
