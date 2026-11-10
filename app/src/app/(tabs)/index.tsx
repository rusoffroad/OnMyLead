import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { type ReactElement, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppNotices } from '@/components/app-notices';
import { BadgeStrip } from '@/components/badge-strip';
import { FeedList, FeedSheet } from '@/components/home/feed';
import { GroupCard, NoGroupCard } from '@/components/home/group-card';
import { CustomizeHomeSheet } from '@/components/home/customize-home';
import { EventsCard } from '@/components/home/events-card';
import { HomeHero, ON_MAP, useHeroMap } from '@/components/home/hero';
import { MapModeBanner } from '@/components/home/map-mode-card';
import { OutRidingNow } from '@/components/home/out-riding-now';
import { HeadLink, Home, homeStyles, Initial, SectionHead } from '@/components/home/parts';
import { PublicRidesRail, RadiusChip, RadiusSheet } from '@/components/home/public-rides';
import { ActionTiles, JoinHero } from '@/components/home/ride-actions';
import { HelpRow, Toolkit } from '@/components/home/toolkit';
import { Icon } from '@/components/icon';
import { InboxBell } from '@/components/inbox-bell';
import { LanguageButton } from '@/components/language-button';
import { Logo } from '@/components/logo';
import { ProLock } from '@/components/pro-gate';
import { RideRow, RowGroup } from '@/components/ride-row';
import { RiderPhoto } from '@/components/rider-photo';
import { Showcase } from '@/components/showcase';
import { ROW_ACTION_HINT, SwipeRow } from '@/components/swipe-row';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { flagOn } from '@/core/app-settings';
import { DEFAULT_HOME_LAYOUT, HOME_LAYOUT_KEY, parseHomeLayout, serializeHomeLayout, shownSections, type HomeLayout, type HomeSection } from '@/core/home-layout';
import { READABLE_WIDTH } from '@/core/layout';
import type { MyBadges } from '@/core/badges';
import { deletePrompt, leavePrompt, ridersToTell } from '@/core/cancel';
import { DEFAULT_FEED_SETTINGS, FEED_NOT_SWITCHED_ON, type FeedSettings } from '@/core/feed';
import type { SocialItem } from '@/core/social';
import type { GroupChatSummary } from '@/core/group-chat';
import { createQuota, firstName, greeting, parseRadius, RADIUS_STORAGE_KEY, toolkitFor } from '@/core/home';
import { historySplit } from '@/core/pro';
import { rowActionFor } from '@/core/row-swipe';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { deleteRide, discoverPublicRides, getMembers, leaveRide, myRideName, myRides, publicRidesNear } from '@/lib/api';
import { useAppSettings } from '@/lib/app-settings';
import { appVersionLabel } from '@/lib/app-update';
import { fetchMyBadges } from '@/lib/badges';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { useEntitlements } from '@/lib/entitlements';
import { FeedOffError, homeFeed, myFeedSettings, saveFeedSettings } from '@/lib/feed';
import { myGroupChats } from '@/lib/group-chat';
import { myGroups, type RidingGroup } from '@/lib/groups';
import { positionIfAllowed } from '@/lib/location';
import { currentNotificationSettings } from '@/lib/notification-settings';
import { requirePro } from '@/lib/pro';
import { syncRideReminders } from '@/lib/push';
import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';
import { publicTrailsIn } from '@/lib/nav-trails';
import { useSession } from '@/lib/session';
import { isBackendConfigured } from '@/lib/supabase';
import { askForTracking } from '@/lib/ad-tracking';
import { FoundUsCard } from '@/components/found-us-card';
import { useNeedsRiderAgreement } from '@/lib/rider-agreement';
import type { Ride, RideMember } from '@/lib/types';
import { currentLocale, t } from '@/lib/i18n';

/** Feed posts shown before Show More: enough to feel alive, not enough to scroll past everything else. */
const FEED_SHOWN = 4;
/** Public ride cards in the rail. Find a Ride has every one of them on the map. */
const RAIL_MAX = 10;

type Mine = RideMember & { rides: Ride };
type Near = Ride & { distanceMi?: number };

/** How tall the map header is (points, below the status bar). The Join card overlaps its bottom. */
const HERO_HEIGHT = 300;
/** How far the Map Mode banner reaches up over the bottom of the map header. */
const OVERLAP = 78;

/** Rider trails around a spot, counted once per app session (it's a line on the banner, not a live number). */
let trailCount: number | null = null;

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
  const [homeLayout, setHomeLayout] = useState<HomeLayout>(DEFAULT_HOME_LAYOUT);
  const [customizing, setCustomizing] = useState(false);
  const [trailsNear, setTrailsNear] = useState<number | null>(trailCount);
  const insets = useSafeAreaInsets();
  // One satellite picture for the map header and the Map Mode tile (cached on the phone).
  const heroUrl = useHeroMap(Math.min(layout.width, 1200), HERO_HEIGHT + insets.top);

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

  // Apple's App Tracking Transparency prompt, once, on Home after sign-in and the rider agreement,
  // never on a map or mid-ride (iPhone and iPad only; lib/ad-tracking.ts).
  const needsAgreement = useNeedsRiderAgreement();
  useEffect(() => {
    if (!session || needsAgreement) return;
    const timer = setTimeout(() => askForTracking(), 2000);
    return () => clearTimeout(timer);
  }, [session, needsAgreement]);

  // Customize Home: the rider's sections and their order, from the account (and live from other devices).
  useEffect(() => {
    AsyncStorage.getItem(HOME_LAYOUT_KEY).then((v) => setHomeLayout(parseHomeLayout(v))).catch(() => {});
    return onSyncedChange(HOME_LAYOUT_KEY, (v) => setHomeLayout(parseHomeLayout(v)));
  }, []);
  const saveLayout = (l: HomeLayout) => {
    setHomeLayout(l);
    setSyncedItem(HOME_LAYOUT_KEY, serializeHomeLayout(l)).catch(() => {});
  };

  // The rider-trail count on the Map Mode banner, near wherever the phone is (only if location is allowed).
  useEffect(() => {
    if (!navOn || trailCount != null) return;
    let gone = false;
    positionIfAllowed()
      .then(async (at) => {
        if (!at) return;
        const d = 0.75;
        const found = await publicTrailsIn({ minLat: at.lat - d, maxLat: at.lat + d, minLng: at.lng - d, maxLng: at.lng + d });
        trailCount = found.length;
        if (!gone) setTrailsNear(found.length);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [navOn]);

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

  // On onmylead.com, signed-out visitors get the showcase; signed-in riders get the app.
  if (Platform.OS === 'web' && !session) {
    return loading ? <View style={{ flex: 1, backgroundColor: theme.background }} /> : <Showcase />;
  }

  if (!isBackendConfigured) {
    return (
      <Screen top>
        <Logo />
        <ThemedText type="subtitle">{t('Almost Ready')}</ThemedText>
        <ThemedText>{t('Add the backend keys to app/.env (see .env.example), then restart the app.')}</ThemedText>
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
    if (!(await confirmAsync(p.title, p.message, p.confirm, t('Keep Ride')))) return false;
    try {
      await (action === 'delete' ? deleteRide(ride.id) : leaveRide(ride.id));
    } catch (e) {
      const what = action === 'delete' ? t('Couldn’t Delete the Ride') : action === 'decline' ? t('Couldn’t Decline the Ride') : t('Couldn’t Leave the Ride');
      showNotice(what, e instanceof Error ? e.message : t('Something went wrong.'));
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

  const name = firstName(rideName);
  const versionLine = appVersionLabel();
  const narrowColumn = layout.expanded;
  const railWidth = narrowColumn ? 250 : Math.min(300, Math.round(Math.min(layout.width, 800) * 0.72));

  const pickRadius = (mi: number) => {
    setRadius(mi);
    setSyncedItem(RADIUS_STORAGE_KEY, String(mi)).catch(() => {});
  };

  // The header and greeting sit over the map picture (light text in every theme).
  const header = (
    <View style={styles.top}>
      <View style={styles.logo}>
        <Logo height={44} onDark />
      </View>
      <View style={styles.topRight}>
        {/* Signed-out riders can switch language before they have an account; signed in, it's in You. */}
        {session ? null : <LanguageButton />}
        {session ? (
          <>
            <InboxBell compact onMap />
            <Pressable accessibilityRole="button" accessibilityLabel={t('You: profile and settings')} hitSlop={4} onPress={() => router.push('/profile')}>
              <View style={styles.avatar}>
                <RiderPhoto userId={uid} size={40} zoom={false} fallback={<Initial name={name || 'R'} size={40} />} ring={0} />
              </View>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );

  const hello = (
    <Text style={styles.hello} accessibilityRole="header" numberOfLines={2}>
      {t(greeting())}{name ? `, ${name}` : ''}
    </Text>
  );

  const hero = (
    <HomeHero url={heroUrl} height={HERO_HEIGHT}>
      <View style={[styles.heroInner, { maxWidth: layout.expanded ? 1200 : READABLE_WIDTH }]}>
        {header}
        <View style={{ flex: 1 }} />
        {hello}
      </View>
    </HomeHero>
  );

  const nudgeAndLive = (
    <>
      <AppNotices />
      {session ? <FoundUsCard /> : null}
      {session && rideName === '' ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/ride-name')} style={styles.nudge}>
          <View style={{ flex: 1 }}>
            <ThemedText type="heading">{t('Pick Your Ride Name')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{t('Other riders see you as Rider until you do. A nickname works.')}</ThemedText>
          </View>
          <Icon name="chevron" color={theme.textSecondary} />
        </Pressable>
      ) : null}
      {live ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/ride/${live.ride_id}/live`)} style={styles.live}>
          <View style={styles.liveDot} />
          <View style={{ flex: 1 }}>
            <ThemedText type="heading" numberOfLines={1}>{live.rides.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{t('Your ride is live. Tap to open Ride Mode')}</ThemedText>
          </View>
          <Icon name="chevron" color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </>
  );

  // 3.0 (approved mock v4, Chris 2026-11-10): Map Mode first, over the bottom of the map header,
  // then the red Join a Ride, then Start a Ride and Events side by side. These four always lead;
  // the sections under them are the rider's to show, hide and order (Customize Home).
  const actions = (
    <View style={{ gap: 12, marginTop: -OVERLAP }}>
      {navOn ? <MapModeBanner image={heroUrl} trailsNear={trailsNear} /> : null}
      <JoinHero code={code} onCode={setCode} onOpen={openCode} />
      <ActionTiles
        quota={session ? createQuota(ent) : null}
        onStart={() => (session ? requirePro('create_ride') && router.push('/ride/new') : router.push('/sign-in'))}
      />
      {nudgeAndLive}
      {!loading && !session ? (
        <Button title={t('Sign In or Create a Free Account')} kind="ghost" onPress={() => router.push('/sign-in?mode=create')} />
      ) : null}
    </View>
  );

  // Up Next: ride invites, your next ride (or all of them), and your next event.
  const nextBlock = (
    <Block
      title={t('Up Next')}
      right={going.length > 1 ? (
        <HeadLink title={moreRides ? t('Show Less') : t('All {n}', { n: going.length })} onPress={() => setMoreRides(!moreRides)} label={moreRides ? t('Show only your next ride') : t('Show all {n} of your rides', { n: going.length })} />
      ) : undefined}>
      {invites.length ? (
        <RowGroup>{invites.map((m) => swipeRow(m, <RideRow ride={m.rides} note={t('You’re invited. Tap to join')} />))}</RowGroup>
      ) : null}
      {going.length ? (
        <RowGroup>
          {(moreRides ? going : going.slice(0, 1)).map((m) =>
            swipeRow(m, <RideRow ride={m.rides} note={m.status === 'joined' ? t(roleLabel(m.role)) : m.status.replace('_', ' ')} />))}
        </RowGroup>
      ) : null}
      <EventsCard signedIn={!!session} radius={radius} />
      {going.length && ROW_ACTION_HINT ? <Text style={[homeStyles.muted, { fontSize: 12 }]}>{ROW_ACTION_HINT}</Text> : null}
    </Block>
  );

  const outItems = (feed ?? []).filter((f) => f.kind === 'out');
  const outBlock = session && feedOn && feed != null && !feedOff ? (
    <Block title={t('Out Riding Now')} right={<HeadLink title={t('See All')} onPress={() => router.push('/out-riding')} label={t('Open Out Riding')} />}>
      <OutRidingNow out={outItems} />
    </Block>
  ) : null;

  const groupBlock = session && groups ? (
    <Block title={t('Your Group')} right={groups.length > 1 ? <HeadLink title={t('All {n}', { n: groups.length })} onPress={() => router.push('/groups')} /> : undefined}>
      {group ? <GroupCard group={group} chat={chatFor(group.id)} outNow={groupOut} uid={uid} /> : <NoGroupCard />}
    </Block>
  ) : null;

  const publicBlock = findOn ? (
    <Block title={t('Public Rides Near You')} right={radius != null ? <RadiusChip radius={located ? radius : 0} onPress={() => setRadiusOpen(true)} /> : undefined}>
      {others.length ? (
        <PublicRidesRail rides={others.slice(0, RAIL_MAX)} width={railWidth} />
      ) : (
        <Text style={homeStyles.muted}>
          {radius != null && located && radius > 0
            ? t('No public rides coming up within {n} miles. Widen the distance, or create one and it shows here for everyone.', { n: radius.toLocaleString(currentLocale()) })
            : t('No public rides coming up. Create one and it shows here for everyone.')}
        </Text>
      )}
      {others.length > RAIL_MAX ? (
        <Button title={t('See All {n} on the Map', { n: others.length })} kind="secondary" onPress={() => router.push('/find')} />
      ) : null}
    </Block>
  ) : null;

  // Out Riding Now has the friends who are out, so the feed under it doesn't repeat them.
  const outShown = !!outBlock && shownSections(homeLayout).includes('out');
  const feedShown = (feed ?? []).filter((f) => !(outShown && f.kind === 'out'));
  const feedBlock = session && feedOn ? (
    <Block
      title={t('Feed')}
      right={feedOff ? undefined : (
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <HeadLink title={t('Customize')} onPress={() => setFeedOpen(true)} label={t('Customize your feed')} />
          <HeadLink title={t('Open Social')} onPress={() => router.push('/social')} label={t('Open Social: all your friends, activity and comments')} />
        </View>
      )}>
      {feed == null ? null : feedOff ? (
        <Text style={homeStyles.muted}>{t(FEED_NOT_SWITCHED_ON)}</Text>
      ) : (
        <>
          <FeedList
            items={feedAll ? feedShown : feedShown.slice(0, FEED_SHOWN)}
            onChange={(i, next) => {
              const was = feedShown[i];
              setFeed((list) => (list ? list.map((x) => (x === was ? next : x)) : list));
            }}
            emptyText={feedSettings.kinds.length
              ? t('Nothing new yet. When friends post photos, ride, earn badges or share trails, it shows here.')
              : t('Everything is switched off in Customize.')}
          />
          {feedShown.length > FEED_SHOWN ? (
            <HeadLink title={feedAll ? t('Show Less') : t('Show {n} More', { n: feedShown.length - FEED_SHOWN })} onPress={() => setFeedAll(!feedAll)} />
          ) : null}
        </>
      )}
    </Block>
  ) : null;

  const badgeBlock = session && badges ? (
    <Block
      title={t('Your Badges')}
      right={
        <View style={{ flexDirection: 'row', gap: Spacing.three }}>
          <HeadLink title={t('Leaderboard')} onPress={() => router.push('/leaderboard')} label={t('Badge leaderboard')} />
          <HeadLink title={t('See All')} onPress={() => router.push('/badges')} label={t('See all badges')} />
        </View>
      }>
      <BadgeStrip mine={badges} />
    </Block>
  ) : null;

  const pastBlock = past.shown.length ? (
    <Block title={t('Past Rides')}>
      <RowGroup>
        {past.shown.map((m) => swipeRow(m, <RideRow ride={m.rides} note={t(m.rides.status === 'cancelled' ? 'Cancelled' : 'Ended')} />))}
      </RowGroup>
      {past.hidden ? (
        <ProLock
          feature="ride_history"
          title={past.hidden === 1 ? t('See 1 Older Ride') : t('See {n} Older Rides', { n: past.hidden })}
          detail={t('Free shows your last {n}. They’re all saved.', { n: past.shown.length })}
        />
      ) : null}
    </Block>
  ) : null;

  const toolkitBlock = session ? (
    <Block title={t('Your Toolkit')}>
      <Toolkit tools={tools} columns={4} />
    </Block>
  ) : null;

  const sheets = (
    <>
      <CustomizeHomeSheet visible={customizing} layout={homeLayout} onClose={() => setCustomizing(false)} onSave={saveLayout} />
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

  const blocks: Record<HomeSection, ReactNode> = {
    out: outBlock,
    next: session ? nextBlock : null,
    group: groupBlock,
    feed: feedBlock,
    public: publicBlock,
    badges: badgeBlock,
    toolkit: toolkitBlock,
    past: pastBlock,
  };
  // Signed out, Public Rides Near You is what there is to see, whatever the layout says.
  const sections = session ? shownSections(homeLayout) : (['public'] as HomeSection[]);
  const sectionList = sections.map((id) => (blocks[id] ? <View key={id}>{blocks[id]}</View> : null));
  const customize = session ? (
    <Pressable accessibilityRole="button" onPress={() => setCustomizing(true)} style={({ pressed }) => [styles.customize, pressed && { opacity: 0.8 }]}>
      <Icon name="sliders" size={18} color={Colors.text} />
      <Text style={styles.customizeText}>{t('Customize Home')}</Text>
    </Pressable>
  ) : null;

  // On a tablet in landscape (or a wide window) Map Mode, Join, Start and Events stay on the left
  // and the rider's sections sit beside them, instead of one long column.
  return (
    <>
      <Screen top hero={hero} width={layout.expanded ? 'wide' : 'readable'}>
        <View style={{ gap: 28 }}>
          {layout.expanded ? (
            <View style={styles.columns}>
              <View style={styles.column}>
                {actions}
                {customize}
                <HelpRow />
              </View>
              <View style={[styles.column, { paddingTop: Spacing.two }]}>{sectionList}</View>
            </View>
          ) : (
            <>
              {actions}
              {sectionList}
              {customize}
              <HelpRow />
            </>
          )}
          <ErrorText error={error} />
          {/* The app's version and build number, small at the very bottom (phone apps only). */}
          {versionLine ? <Text style={styles.version} accessibilityLabel={t('Version {v}', { v: versionLine })}>{t('Version {v}', { v: versionLine })}</Text> : null}
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

const styles = themedStyles(() => ({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.one },
  logo: { width: 150, height: 52 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(230,194,122,0.5)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroInner: { flex: 1, width: '100%', alignSelf: 'center', paddingHorizontal: Spacing.three, paddingBottom: OVERLAP + 18 },
  hello: { color: ON_MAP, fontFamily: font(700), fontSize: 26, lineHeight: 31, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
  customize: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.tileEdge, backgroundColor: Colors.backgroundElement,
  },
  customizeText: { color: Colors.text, fontFamily: font(700), fontSize: 15.5 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.five },
  column: { flex: 1, minWidth: 0, gap: 28 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.card, borderWidth: 2, borderColor: Colors.accent, padding: 14, backgroundColor: Home.panel },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent },
  version: { color: Home.muted, fontFamily: font(500), fontSize: 12, lineHeight: 16, textAlign: 'center', opacity: 0.7, marginTop: -12 },
  nudge: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.card, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.sky,
    backgroundColor: Home.panel,
  },
}));
