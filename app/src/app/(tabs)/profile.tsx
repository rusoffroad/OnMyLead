import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Switch, Text, View } from 'react-native';

import { BadgeStrip } from '@/components/badge-strip';
import { Icon } from '@/components/icon';
import { MenuGroup, MenuRow } from '@/components/menu';
import { RiderPhoto } from '@/components/rider-photo';
import { ThemedText } from '@/components/themed-text';
import { Button, Choice, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { initialOf } from '@/core/profile';
import { type MyBadges } from '@/core/badges';
import { MAPS_APP_LABEL, mapsAppsFor, type MapsPreference } from '@/core/directions';
import { describeAppearance } from '@/core/appearance';
import { describeLanguage, languageByCode } from '@/core/i18n';
import { BATTERY_PLANS } from '@/core/battery';
import { AUTO_VOICE } from '@/core/voice';
import { settingsSummary } from '@/core/notifications';
import { planHeadline } from '@/core/pro';
import { formatBytes } from '@/core/offline-maps';
import { shareEndText } from '@/core/sharing';
import { deleteMyAccount, myActiveShares, myRideName } from '@/lib/api';
import { useAppSettings, useFlag } from '@/lib/app-settings';
import { referralsSwitchedOn } from '@/core/referrals';
import { fetchMyBadges } from '@/lib/badges';
import { useAppearance } from '@/lib/appearance';
import { useBatteryMode } from '@/lib/battery';
import { useVoiceChoice } from '@/lib/voice';
import { useBlocks } from '@/lib/blocks';
import { confirmAsync } from '@/lib/confirm';
import { setMapsPreference, useMapsPreference } from '@/lib/directions';
import { useEntitlements } from '@/lib/entitlements';
import { useNotificationSettings } from '@/lib/notification-settings';
import { useOfflineMaps } from '@/lib/offline-maps';
import { loadTrails, useLocalTrails } from '@/lib/nav-trails';
import { RIDER_TRAILS_KEY } from '@/hooks/use-trail-map';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useFollowMePref } from '@/hooks/use-follow-me';
import { RIDER_TRAIL_INK } from '@/core/nav-trails';
import { signOut, useSession } from '@/lib/session';
import { setSocialProfileShown, syncSocialProfile } from '@/lib/social-profile';
import { socialSetting, type SocialProfile } from '@/core/social-profile';
import { useMusicControlsSetting } from '@/hooks/use-music-controls';
import { nearbyAvailable, useBluetoothSharingSetting } from '@/lib/nearby';
import { HELP_CENTER_DISPLAY, HELP_CENTER_TITLE } from '@/core/help-link';
import { openHelpCenter } from '@/lib/help-center';
import { musicAvailable } from '@/lib/music';
import { syncSettingsNow, useSyncStatus, useSyncSummary } from '@/lib/settings-sync';
import { backupTrailsNow } from '@/lib/trail-backup';
import { t, useLanguage } from '@/lib/i18n';
import { requirePro } from '@/lib/pro';
import { ProTag } from '@/components/pro-tag';

/**
 * The You tab: everything that isn't a ride, in one place and in plain groups. Your name up top,
 * then your gear, the tools you reach for on the trail, settings, and the account at the bottom.
 */
export default function You() {
  const { session, loading } = useSession();
  const [rideName, setRideName] = useState<string | null>(null);
  /** When the rider's personal share ends (epoch ms; far off for "until I turn it off"), or null when not sharing. */
  const [sharingUntil, setSharingUntil] = useState<number | null>(null);
  const [sharingCheckedAt, setSharingCheckedAt] = useState(0);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const notifications = useNotificationSettings();
  const mapsPref = useMapsPreference();
  const batteryMode = useBatteryMode();
  const syncLine = useSyncSummary();
  const syncAvailable = useSyncStatus().available;
  const { appearance } = useAppearance();
  const language = useLanguage();
  const voiceChoice = useVoiceChoice();
  const { ent, can } = useEntitlements();
  const tripsOn = useFlag('trip_planner');
  const referralsOn = referralsSwitchedOn(useAppSettings().settings.flags);
  const starlinkOn = useFlag('starlink');
  const offlineMaps = useOfflineMaps();
  const navOn = useFlag('nav_mode');
  const musicFlag = useFlag('music_controls');
  const [musicMine, setMusicMine] = useMusicControlsSetting();
  const bluetoothFlag = useFlag('bluetooth_sharing');
  const [bluetoothMine, setBluetoothMine] = useBluetoothSharingSetting();
  const { trails: myTrails } = useLocalTrails();
  const [riderTrails, , setRiderTrails] = useRememberedToggle(RIDER_TRAILS_KEY, true);
  const [followMe, setFollowMe] = useFollowMePref();
  useEffect(() => {
    loadTrails();
  }, []);
  const blocks = useBlocks();
  const [social, setSocial] = useState<SocialProfile | null>(null);
  const [socialBusy, setSocialBusy] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [badges, setBadges] = useState<MyBadges | null>(null);
  // A different account (or none) must not see the last rider's name.
  const uid = session?.user.id;
  const [shownFor, setShownFor] = useState(uid);
  if (shownFor !== uid) {
    setShownFor(uid);
    setRideName(null);
    setSocial(null);
    setSharingUntil(null);
    setBadges(null);
  }

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      myRideName().then(setRideName).catch(() => setRideName(null));
      // A personal share can run for days, so the row below says so every time the tab shows.
      myActiveShares()
        .then((all) => {
          const ends = all.filter((x) => x.scope === 'personal').map((x) => Date.parse(x.expires_at!));
          setSharingUntil(ends.length ? Math.max(...ends) : null);
          setSharingCheckedAt(Date.now());
        })
        .catch(() => setSharingUntil(null));
      // Keeps the name and photo from their Apple, Google or Facebook sign-in up to date.
      syncSocialProfile().then(setSocial).catch(() => {});
      // Your rank and badges, brought up to date by the server each time the tab shows.
      fetchMyBadges().then(setBadges).catch(() => {});
    }, [session]),
  );

  async function toggleSocial(on: boolean) {
    setSocialBusy(true);
    setSocialError(null);
    try {
      setSocial(await setSocialProfileShown(on));
    } catch {
      setSocialError(t('That didn’t save. Check your connection and try again.'));
    } finally {
      setSocialBusy(false);
    }
  }

  if (loading) return <Screen><View /></Screen>;

  const offlineSummary = offlineMaps.length
    ? `${offlineMaps.length === 1 ? t('1 map') : t('{n} maps', { n: offlineMaps.length })}, ${formatBytes(offlineMaps.reduce((n, m) => n + m.bytes, 0))}`
    : t('For riding with no signal');
  const subscriptionSummary = ent.switchedOn ? planHeadline(ent) : 'Pro, Restore Purchases and Promo Codes';
  const blockedSummary = blocks.list.length
    ? `${blocks.list.length === 1 ? t('1 rider') : t('{n} riders', { n: blocks.list.length })}. ${t('They aren’t told.')}`
    : t('Riders whose messages you don’t see');
  const directionsSummary = mapsPref === 'ask' ? t('Ask each time') : MAPS_APP_LABEL[mapsPref];
  const needsAccount = (href: Parameters<typeof router.push>[0]) => () => router.push(session ? href : '/sign-in');

  return (
    <Screen>
      {session ? (
        <>
          <Identity userId={uid} name={rideName} plan={ent.switchedOn ? planHeadline(ent) : null} />
          {badges ? <BadgeStrip mine={badges} /> : null}
        </>
      ) : (
        <View style={styles.signedOut}>
          <ThemedText type="subtitle">Ride with Your Crew</ThemedText>
          <ThemedText themeColor="textSecondary">Sign in to create rides, save your Garage and keep your riding groups.</ThemedText>
          <Button title="Sign In or Create a Free Account" onPress={() => router.push('/sign-in?mode=create')} />
        </View>
      )}

      <MenuGroup title="Your Gear">
        <MenuRow icon="machine" color={Colors.accent} title="Garage" detail="Your machines, mods and fuel range" onPress={needsAccount('/garage')} />
        {tripsOn ? (
          <MenuRow icon="checklist" color={RideColors.green} title="Trip Planner" detail="Packing lists you tick off and reuse" onPress={needsAccount('/trips')} />
        ) : null}
        <MenuRow icon="map" color={Colors.sky} title="Offline Maps" detail={offlineSummary} onPress={() => router.push('/maps')} />
      </MenuGroup>

      <MenuGroup title="On the Trail">
        {navOn ? (
          <MenuRow icon="map" color={RIDER_TRAIL_INK} title="Map Mode" detail={myTrails.length ? `${t('Your offroad map')}. ${myTrails.length === 1 ? t('1 trail') : t('{n} trails', { n: myTrails.length })}` : t('Your offroad map: trails, record, draw')} onPress={() => router.push('/nav')} />
        ) : null}
        <MenuRow
          icon="map"
          color={RIDER_TRAIL_INK}
          title="Rider Trails on Maps"
          detail={riderTrails ? 'Showing trails riders mapped and shared, as mint dotted lines' : 'Hidden. Only agency and OpenStreetMap trails show'}
          right={
            <Switch
              value={riderTrails}
              onValueChange={setRiderTrails}
              trackColor={{ true: Colors.sky, false: Colors.backgroundSelected }}
              thumbColor="#FFFFFF"
              {...({ activeThumbColor: '#FFFFFF' } as object)}
              accessibilityLabel="Rider Trails on Maps"
            />
          }
        />
        <MenuRow
          icon="follow"
          color={Colors.sky}
          title="Follow Me on Maps"
          detail={followMe ? 'The map keeps your dot in view in Ride Mode and Map Mode' : 'Off. The map stays where you put it'}
          right={
            <Switch
              value={followMe}
              onValueChange={setFollowMe}
              trackColor={{ true: Colors.sky, false: Colors.backgroundSelected }}
              thumbColor="#FFFFFF"
              {...({ activeThumbColor: '#FFFFFF' } as object)}
              accessibilityLabel="Follow Me on Maps"
            />
          }
        />
        <MenuRow icon="pin" color={Colors.sky} title="Share My Location" detail={sharingUntil != null ? t('Sharing now, {until}. Tap to stop', { until: shareEndText(sharingUntil, sharingCheckedAt) }) : t('With chosen riders or family, for as long as you pick')} onPress={needsAccount('/share')} />
        <MenuRow
          icon="battery"
          color={batteryMode === 'best' ? RideColors.green : RideColors.yellow}
          title="Battery Saver"
          detail={`${t(BATTERY_PLANS[batteryMode].label)}. ${t(BATTERY_PLANS[batteryMode].short)}`}
          onPress={() => router.push('/battery')}
        />
        <MenuRow icon="theme" color={Colors.sky} title="Appearance" detail={describeAppearance(appearance, t)} onPress={() => router.push('/appearance')} />
        <MenuRow
          icon="globe"
          color={Colors.sky}
          title="Language"
          detail={`${languageByCode(language.language).flag} ${describeLanguage(language.choice, language.language, t('Match Phone'))}`}
          onPress={() => router.push('/language' as Href)}
        />
        {Platform.OS !== 'web' ? (
          <MenuRow
            icon="tilt"
            color={RideColors.green}
            title="Tilt and Crash Alert"
            detail="Roll and pitch meter, tilt warnings, and an alert to your group after a crash"
            onPress={() => router.push('/tilt')}
          />
        ) : null}
        <MenuRow
          icon="voice"
          color={Colors.sky}
          title="Voice"
          detail={voiceChoice === AUTO_VOICE ? 'Automatic. The most natural voice on this device reads Ride Mode alerts' : 'Your pick reads Ride Mode alerts'}
          onPress={() => router.push('/voice')}
        />
        {musicAvailable && musicFlag ? (
          <MenuRow
            icon="music"
            color={Colors.sky}
            title="Music Controls"
            detail={musicMine ? 'A Music button in Ride Mode and Map Mode: play, pause, skip and volume' : 'Hidden. Turn it on for a Music button in Ride Mode and Map Mode'}
            right={
              <Switch
                value={musicMine}
                onValueChange={setMusicMine}
                trackColor={{ true: Colors.sky, false: Colors.backgroundSelected }}
                thumbColor="#FFFFFF"
                {...({ activeThumbColor: '#FFFFFF' } as object)}
                accessibilityLabel="Music Controls"
              />
            }
          />
        ) : null}
        {nearbyAvailable && bluetoothFlag ? (
          <MenuRow
            icon="bluetooth"
            color={Colors.sky}
            title="Bluetooth Sharing"
            detail={bluetoothMine
              ? 'With no service, Ride Mode passes spots and alerts to nearby riders on your ride'
              : 'Off. Turn it on to keep sharing with nearby riders when there is no service'}
            right={
              <Switch
                value={bluetoothMine}
                onValueChange={setBluetoothMine}
                trackColor={{ true: Colors.sky, false: Colors.backgroundSelected }}
                thumbColor="#FFFFFF"
                {...({ activeThumbColor: '#FFFFFF' } as object)}
                accessibilityLabel="Bluetooth Sharing"
              />
            }
          />
        ) : null}
        {starlinkOn ? (
          <MenuRow icon="dish" color={RideColors.yellow} title="Starlink" detail="Your dish, your plan and battery run time" onPress={() => router.push('/starlink')} />
        ) : null}
      </MenuGroup>

      {session ? (
        <MenuGroup title="Settings">
          <MenuRow icon="bell" color={RideColors.sweep} title="Notifications" detail={settingsSummary(notifications)} onPress={() => router.push('/notifications')} />
          <MenuRow
            icon="turn"
            color={RideColors.green}
            title="Directions"
            detail={t('Navigate opens: {app}', { app: directionsSummary })}
            onPress={() => setDirectionsOpen(!directionsOpen)}
            right={<ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>{directionsOpen ? 'Done' : 'Change'}</ThemedText>}>
            {directionsOpen ? (
              <Choice
                value={mapsPref}
                onChange={setMapsPreference}
                options={[
                  { value: 'ask' as MapsPreference, label: 'Ask Each Time' },
                  ...mapsAppsFor(Platform.OS).map((a) => ({ value: a as MapsPreference, label: MAPS_APP_LABEL[a] })),
                ]}
              />
            ) : null}
          </MenuRow>
          {syncAvailable ? (
            <MenuRow
              icon="sync"
              color={Colors.sky}
              title="Sync Across Devices"
              detail={syncLine}
              onPress={() => {
                if (!requirePro('sync')) return;
                syncSettingsNow();
                backupTrailsNow();
              }}
              right={can('sync') ? <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>Sync Now</ThemedText> : <ProTag feature="sync" />}
            />
          ) : null}
          <MenuRow icon="star" color={RideColors.yellow} title="Subscription" detail={subscriptionSummary} onPress={() => router.push('/subscription')} />
          {referralsOn ? (
            <MenuRow icon="addFriend" color={Colors.accent} title="Invite Friends" detail="You both get 50% off Pro Annual when they finish a ride" onPress={() => router.push('/invite-friends')} />
          ) : null}
          <MenuRow icon="block" color={Colors.danger} title="Blocked Riders" detail={blockedSummary} onPress={() => router.push('/blocked')} />
          {ent.accountType === 'admin' ? (
            <MenuRow
              icon="lock"
              color={Colors.accent}
              title="Admin Dashboard"
              detail={Platform.OS === 'web' ? 'Users, rides, reports and settings' : 'Opens onmylead.com/admin'}
              onPress={() => (Platform.OS === 'web' ? router.push('/admin') : Linking.openURL('https://onmylead.com/admin'))}
            />
          ) : null}
        </MenuGroup>
      ) : null}

      {session ? (
        <>
          <MenuGroup title="Account">
            <MenuRow icon="person" title="Email" detail={`${session.user.email ?? t('No email on this account')}. ${t('Only you see this.')}`} />
            {social ? (
              <MenuRow
                icon="people"
                color={Colors.sky}
                title={socialSetting(social).title}
                detail={socialSetting(social).detail}
                right={
                  <Switch
                    value={social.shown}
                    disabled={socialBusy}
                    onValueChange={toggleSocial}
                    trackColor={{ true: Colors.sky, false: Colors.backgroundSelected }}
                    thumbColor="#FFFFFF"
                    {...({ activeThumbColor: '#FFFFFF' } as object)}
                    accessibilityLabel={socialSetting(social).title}
                  />
                }
              />
            ) : null}
          </MenuGroup>
          <ErrorText error={socialError} />
        </>
      ) : null}

      <MenuGroup title="Help">
        <MenuRow
          icon="book"
          color={Colors.sky}
          title={HELP_CENTER_TITLE}
          detail={t('Step-by-step instructions for every feature, at {site}', { site: HELP_CENTER_DISPLAY })}
          onPress={() => openHelpCenter()}
          right={<Icon name="external" size={18} color={Colors.sky} />}
        />
        {session ? (
          <MenuRow icon="flagged" color={Colors.danger} title="Report a Rider" detail="Harassment, threats or abuse. Goes to the OnMyLead team" onPress={() => router.push('/report-rider')} />
        ) : null}
        <MenuRow icon="wrench" color={Colors.accent} title="Report a Bug" detail="Something not working? Send it with a screenshot" onPress={() => router.push('/contact?topic=problem')} />
        <MenuRow icon="mail" color={Colors.sky} title="Contact Us" detail="An idea, a billing question or anything else" onPress={() => router.push('/contact')} />
        <MenuRow icon="checklist" color={Colors.textSecondary} title="Help and Support" detail="Quick answers to common questions" onPress={() => router.push('/support')} />
      </MenuGroup>

      {session ? (
        <>
          <Button
            title="Sign Out"
            kind="ghost"
            onPress={async () => {
              await signOut();
              router.replace('/');
            }}
          />
          <DeleteAccount />
        </>
      ) : null}

      <View style={styles.legal}>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/terms')}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.legalLink}>Terms</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/rider-agreement')}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.legalLink}>Safety Agreement</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/privacy')}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.legalLink}>Privacy</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/support')}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.legalLink}>Help</ThemedText>
        </Pressable>
      </View>
    </Screen>
  );
}

/** Who you are to the group: your pin as it shows on the map, your ride name and your plan. Tap to change the name. */
function Identity({ userId, name, plan }: { userId: string | undefined; name: string | null; plan: string | null }) {
  const picked = !!name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={picked ? t('Your ride name is {name}. Change it or your profile picture', { name: name! }) : t('Pick your ride name and profile picture')}
      onPress={() => router.push('/ride-name')}
      style={({ pressed }) => [styles.identity, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={styles.ring}>
        <RiderPhoto
          userId={userId}
          size={44}
          fallback={
            <View style={styles.dot}>
              <Text style={styles.initial}>{name ? initialOf(name) : '?'}</Text>
            </View>
          }
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>{picked ? name : name === '' ? t('Pick Your Ride Name') : ' '}</Text>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {picked ? 'Your name and picture. Tap to change' : 'Other riders see you as Rider until you do'}
        </ThemedText>
        {plan ? <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 700 }}>{plan}</ThemedText> : null}
      </View>
    </Pressable>
  );
}

/**
 * Apple requires an in-app way to delete an account. It is deleted on the spot and the rider is
 * signed out; a Pro subscription is billed by Apple and is cancelled there.
 */
function DeleteAccount() {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'off'>('idle');
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const ok = await confirmAsync(
      'Delete Your Account?',
      'Your account, rides you organize, Garage, trips and groups will be permanently deleted. Rides you organize are removed for everyone on them. This can’t be undone. If you pay for Pro, cancel it in your Apple subscriptions too.',
      'Delete Account',
    );
    if (!ok) return;
    setState('busy');
    setError(null);
    try {
      if ((await deleteMyAccount()) === 'deleted') {
        await signOut().catch(() => {});
        router.replace('/');
        return;
      }
      setState('sent');
    } catch (e) {
      const message = (e as Error).message;
      if (/request_account_deletion|schema cache|does not exist/i.test(message)) setState('off');
      else {
        setState('idle');
        setError(`${t('Couldn’t send that.')} ${message}`);
      }
    }
  };

  if (state === 'sent' || state === 'off') {
    return (
      <View style={styles.deleteNote} accessibilityLiveRegion="polite">
        <ThemedText style={{ fontWeight: 600 }}>{state === 'sent' ? 'Deletion Requested' : 'Not Switched On Yet'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {state === 'sent'
            ? 'Your account and its data will be deleted within 7 days. If you pay for OnMyLead Pro, cancel it in your Apple subscriptions so you aren’t billed again.'
            : 'Account deletion starts working with the next server update.'}
        </ThemedText>
      </View>
    );
  }
  return (
    <View style={{ gap: Spacing.two }}>
      <ErrorText error={error} />
      <Button title="Delete Account" kind="ghost" loading={state === 'busy'} onPress={ask} style={styles.deleteButton} />
    </View>
  );
}

const styles = themedStyles(() => ({
  identity: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Radius.card, padding: Spacing.three,
    backgroundColor: Colors.backgroundElement,
  },
  ring: { width: 64, height: 64, borderRadius: 32, borderWidth: 5, borderColor: RideColors.green, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  dot: { width: 44, height: 44, borderRadius: 22, backgroundColor: RideColors.rider, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontFamily: font(800), fontSize: 20 },
  name: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 32, lineHeight: 36 },
  signedOut: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  legal: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.four, rowGap: Spacing.two },
  legalLink: { fontSize: 13, textDecorationLine: 'underline' },
  deleteButton: { borderColor: Colors.danger },
  deleteNote: { gap: 4, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
}));
