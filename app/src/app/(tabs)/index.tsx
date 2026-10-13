import { router, useFocusEffect } from 'expo-router';
import { type ReactElement, useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppNotices } from '@/components/app-notices';
import { Icon, type IconName } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { Logo } from '@/components/logo';
import { ProLock } from '@/components/pro-gate';
import { RideRow, RowGroup } from '@/components/ride-row';
import { Showcase } from '@/components/showcase';
import { SwipeRow } from '@/components/swipe-row';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen, Section } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { flagOn } from '@/core/app-settings';
import { deletePrompt, leavePrompt, ridersToTell } from '@/core/cancel';
import { rowActionFor } from '@/core/row-swipe';
import { historySplit } from '@/core/pro';
import { deleteRide, discoverPublicRides, getMembers, leaveRide, myRideName, myRides } from '@/lib/api';
import { useAppSettings } from '@/lib/app-settings';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { useEntitlements } from '@/lib/entitlements';
import { currentNotificationSettings } from '@/lib/notification-settings';
import { requirePro } from '@/lib/pro';
import { syncRideReminders } from '@/lib/push';
import { useSession } from '@/lib/session';
import { isBackendConfigured } from '@/lib/supabase';
import type { Ride, RideMember } from '@/lib/types';

/** Public rides listed on Rides; the Find tab has every one of them on the map. */
const PUBLIC_ON_HOME = 3;

export default function Home() {
  const theme = useTheme();
  const { session, loading } = useSession();
  const { ent } = useEntitlements();
  const { settings } = useAppSettings();
  const findOn = flagOn(settings, 'find_a_ride');
  const [mine, setMine] = useState<(RideMember & { rides: Ride })[]>([]);
  const [nearby, setNearby] = useState<Ride[]>([]);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The rider's ride name; null until loaded (or if it couldn't load), '' when they haven't picked one. */
  const [rideName, setRideName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isBackendConfigured) return;
      if (findOn) discoverPublicRides().then(setNearby).catch((e) => setError(e.message));
      if (session) myRides().then(setMine).catch((e) => setError(e.message));
      if (session) myRideName().then(setRideName).catch(() => setRideName(null));
    }, [session, findOn]),
  );

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

  const uid = session?.user.id;

  /** Swipe left on one of your rides: the organizer deletes it, anyone else leaves (or declines the invite). */
  const swipeAway = async (m: (typeof mine)[number]): Promise<boolean> => {
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
  const swipeRow = (m: (typeof mine)[number], row: ReactElement) => (
    <SwipeRow key={m.ride_id} action={rowActionFor(m, m.rides.organizer_id, uid)} onAction={() => swipeAway(m)}>
      {row}
    </SwipeRow>
  );

  const live = mine.find((m) => m.rides?.status === 'live' && m.status === 'joined');
  // Invitations (from a riding group) get their own list; the rest are rides you're on.
  const invites = mine.filter((m) => m.status === 'invited' && (m.rides?.status === 'scheduled' || m.rides?.status === 'live'));
  const yours = mine.filter((m) => m.status !== 'invited');
  const isPast = (m: (typeof mine)[number]) => m.rides?.status === 'ended' || m.rides?.status === 'cancelled';
  const going = yours.filter((m) => !isPast(m));
  // Past rides, newest first. Free shows the last few; nothing is deleted, and live or upcoming rides are never hidden.
  const past = historySplit(
    yours.filter(isPast).sort((a, b) => Date.parse(b.rides.meet_at) - Date.parse(a.rides.meet_at)),
    ent.historyLimit,
  );
  const mineIds = new Set(mine.map((m) => m.ride_id));
  const others = nearby.filter((r) => !mineIds.has(r.id));
  const openCode = () => code.trim().length >= 4 && router.push(`/r/${code.trim().toUpperCase()}`);

  return (
    <Screen top>
      <View style={{ paddingTop: Spacing.one }}>
        <Logo height={96} />
      </View>

      <AppNotices />

      {session && rideName === '' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/ride-name')}
          style={[styles.nudge, { backgroundColor: theme.backgroundElement }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="heading">Pick Your Ride Name</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Other riders see you as Rider until you do. A nickname works.</ThemedText>
          </View>
          <Icon name="chevron" color={theme.textSecondary} />
        </Pressable>
      ) : null}

      {live ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/ride/${live.ride_id}/live`)}
          style={[styles.live, { borderColor: theme.accent }]}>
          <View style={styles.liveDot} />
          <View style={{ flex: 1 }}>
            <ThemedText type="heading" numberOfLines={1}>{live.rides.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Your ride is live. Tap to open Ride Mode</ThemedText>
          </View>
          <Icon name="chevron" color={theme.textSecondary} />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a ride"
        onPress={() => (session ? requirePro('create_ride') && router.push('/ride/new') : router.push('/sign-in'))}
        style={({ pressed }) => [styles.create, { backgroundColor: theme.accent, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <View style={styles.createIcon}>
          <Icon name="flag" size={34} color="#fff" strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.createTitle}>Create a Ride</ThemedText>
          <ThemedText style={styles.createDetail}>You lead. Public or just your friends.</ThemedText>
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <BigAction
          icon="join"
          title="Join a Ride"
          detail="Got a code or link"
          on={joining}
          onPress={() => setJoining(!joining)}
        />
        {findOn ? (
          <BigAction
            icon="search"
            title="Find a Ride"
            detail="Near you or by state"
            onPress={() => router.push('/find')}
          />
        ) : null}
      </View>

      {joining ? (
        <View style={[styles.join, { backgroundColor: theme.backgroundElement, borderColor: theme.sky }]}>
          <TextBox
            value={code}
            onChangeText={setCode}
            onSubmitEditing={openCode}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            placeholder="Invite code, e.g. 7F3A9C21"
            placeholderTextColor={theme.textSecondary}
            selectionColor={theme.sky}
            accessibilityLabel="Invite code"
            style={[styles.joinInput, { color: theme.text }]}
          />
          <Button title="Open" disabled={code.trim().length < 4} onPress={openCode} style={{ minHeight: 44, backgroundColor: theme.sky }} />
        </View>
      ) : null}

      {!loading && !session ? (
        <Button title="Sign In or Create a Free Account" kind="ghost" onPress={() => router.push('/sign-in?mode=create')} />
      ) : null}

      <ErrorText error={error} />

      {invites.length ? (
        <>
          <Section title="Ride Invites" />
          <RowGroup>
            {invites.map((m) => (
              swipeRow(m, <RideRow ride={m.rides} note="You’re invited. Tap to join" />)
            ))}
          </RowGroup>
        </>
      ) : null}

      {going.length ? (
        <>
          <Section title="Your Rides" right={<ThemedText type="small" themeColor="textSecondary">Swipe Left to Delete or Leave</ThemedText>} />
          <RowGroup>
            {going.map((m) => (
              swipeRow(m, <RideRow ride={m.rides} note={m.status === 'joined' ? roleLabel(m.role) : m.status.replace('_', ' ')} />)
            ))}
          </RowGroup>
        </>
      ) : null}

      {past.shown.length ? (
        <>
          <Section title="Past Rides" />
          <RowGroup>
            {past.shown.map((m) => (
              swipeRow(m, <RideRow ride={m.rides} note={m.rides.status === 'cancelled' ? 'Cancelled' : 'Ended'} />)
            ))}
          </RowGroup>
          {past.hidden ? (
            <ProLock
              feature="ride_history"
              title={`See ${past.hidden} Older ${past.hidden === 1 ? 'Ride' : 'Rides'}`}
              detail={`Free shows your last ${past.shown.length}. They’re all saved.`}
            />
          ) : null}
        </>
      ) : null}

      {findOn ? (
        <>
          <Section title="Public Rides" />
          {others.length === 0 ? (
            <ThemedText themeColor="textSecondary">No public rides coming up. Create one and it shows here for everyone.</ThemedText>
          ) : (
            <RowGroup>
              {others.slice(0, PUBLIC_ON_HOME).map((r) => (
                <RideRow key={r.id} ride={r} />
              ))}
            </RowGroup>
          )}
          <Button title={others.length > PUBLIC_ON_HOME ? `See All ${others.length} on the Map` : 'Find Rides on the Map'} kind="secondary" onPress={() => router.push('/find')} />
        </>
      ) : null}
    </Screen>
  );
}

/** The two ride actions under Create: big, blue, glove-sized. */
function BigAction({ icon, title, detail, on, onPress }: { icon: IconName; title: string; detail: string; on?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={on != null ? { expanded: on } : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { backgroundColor: on ? theme.sky : '#163A6E', transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Icon name={icon} size={28} color="#fff" strokeWidth={2.3} />
      <View>
        <ThemedText style={styles.actionTitle}>{title}</ThemedText>
        <ThemedText type="small" style={{ color: '#C9DBF7' }}>{detail}</ThemedText>
      </View>
    </Pressable>
  );
}

const roleLabel = (role: RideMember['role']) =>
  ({ organizer: 'You Organize', co_organizer: 'Co-Organizer', leader: 'You Lead', sweep: 'Tail Gunner', rider: 'Going' })[role];

const styles = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.card, borderWidth: 2, padding: 14 },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent },
  create: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: 24, paddingHorizontal: 20, minHeight: 116 },
  createIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  createTitle: { color: '#fff', fontSize: 38, lineHeight: 40, fontFamily: font(800, 'display') },
  createDetail: { color: '#FFD9DA', fontSize: 15, lineHeight: 20, fontFamily: font(600) },
  action: { flex: 1, borderRadius: 22, padding: Spacing.three, minHeight: 116, justifyContent: 'space-between', gap: Spacing.two },
  actionTitle: { color: '#fff', fontSize: 26, lineHeight: 28, fontFamily: font(800, 'display') },
  join: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Radius.card, borderWidth: 1.5, paddingLeft: Spacing.three, padding: 8 },
  joinInput: { flex: 1, minHeight: 44, fontSize: 17, fontFamily: font(600), letterSpacing: 1 },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.card, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.sky },
});
