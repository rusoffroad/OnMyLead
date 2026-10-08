import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Logo } from '@/components/logo';
import { RideRow, RowGroup } from '@/components/ride-row';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen, Section } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { discoverPublicRides, myRides } from '@/lib/api';
import { useSession } from '@/lib/session';
import { isBackendConfigured } from '@/lib/supabase';
import type { Ride, RideMember } from '@/lib/types';

type Tool = { icon: IconName; title: string; href: '/share' | '/garage' | '/trips' | '/starlink'; color: string; open?: boolean };

// Secondary tools: one compact row under the ride actions.
const TOOLS: Tool[] = [
  { icon: 'pin', title: 'Share location', href: '/share', color: Colors.sky },
  { icon: 'checklist', title: 'Trip planner', href: '/trips', color: RideColors.green },
  { icon: 'machine', title: 'Garage', href: '/garage', color: Colors.accent },
  { icon: 'dish', title: 'Starlink', href: '/starlink', color: RideColors.yellow, open: true },
];

export default function Home() {
  const theme = useTheme();
  const { session, loading } = useSession();
  const [mine, setMine] = useState<(RideMember & { rides: Ride })[]>([]);
  const [nearby, setNearby] = useState<Ride[]>([]);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isBackendConfigured) return;
      discoverPublicRides().then(setNearby).catch((e) => setError(e.message));
      if (session) myRides().then(setMine).catch((e) => setError(e.message));
    }, [session]),
  );

  if (!isBackendConfigured) {
    return (
      <Screen top>
        <Logo />
        <ThemedText type="subtitle">Almost ready</ThemedText>
        <ThemedText>Add the backend keys to app/.env (see .env.example), then restart the app.</ThemedText>
      </Screen>
    );
  }

  const go = (href: Parameters<typeof router.push>[0]) => router.push(session ? href : '/sign-in');
  const live = mine.find((m) => m.rides?.status === 'live' && m.status === 'joined');
  const mineIds = new Set(mine.map((m) => m.ride_id));
  const others = nearby.filter((r) => !mineIds.has(r.id));
  const openCode = () => code.trim().length >= 4 && router.push(`/r/${code.trim().toUpperCase()}`);

  return (
    <Screen top>
      <View style={{ paddingTop: Spacing.one }}>
        <Logo height={96} />
      </View>

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
        onPress={() => go('/ride/new')}
        style={({ pressed }) => [styles.create, { backgroundColor: theme.accent, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <View style={styles.createIcon}>
          <Icon name="flag" size={34} color="#fff" strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.createTitle}>Create a ride</ThemedText>
          <ThemedText style={styles.createDetail}>You lead. Public or just your friends.</ThemedText>
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <BigAction
          icon="join"
          title="Join a ride"
          detail="Got a code or link"
          on={joining}
          onPress={() => setJoining(!joining)}
        />
        <BigAction
          icon="search"
          title="Find a ride"
          detail="Near you or by state"
          onPress={() => router.push('/find')}
        />
      </View>

      {joining ? (
        <View style={[styles.join, { backgroundColor: theme.backgroundElement, borderColor: theme.sky }]}>
          <TextInput
            value={code}
            onChangeText={setCode}
            onSubmitEditing={openCode}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            keyboardAppearance="dark"
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
        <Button title="Sign in or create a free account" kind="ghost" onPress={() => router.push('/sign-in?mode=create')} />
      ) : null}

      <View style={styles.tools}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.href}
            accessibilityRole="button"
            accessibilityLabel={t.title}
            onPress={() => (t.open ? router.push(t.href) : go(t.href))}
            style={styles.tool}>
            <View style={[styles.toolIcon, { backgroundColor: theme.backgroundElement }]}>
              <Icon name={t.icon} color={t.color} size={22} />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', fontSize: 13, lineHeight: 16 }}>{t.title}</ThemedText>
          </Pressable>
        ))}
      </View>

      <ErrorText error={error} />

      {mine.length ? (
        <>
          <Section title="Your rides" />
          <RowGroup>
            {mine.map((m) => (
              <RideRow key={m.ride_id} ride={m.rides} note={m.status === 'joined' ? roleLabel(m.role) : m.status.replace('_', ' ')} />
            ))}
          </RowGroup>
        </>
      ) : null}

      <Section title="Public rides" />
      {others.length === 0 ? (
        <ThemedText themeColor="textSecondary">No public rides coming up. Create one and it shows here for everyone.</ThemedText>
      ) : (
        <RowGroup>
          {others.map((r) => (
            <RideRow key={r.id} ride={r} />
          ))}
        </RowGroup>
      )}
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
  ({ organizer: 'You organize', co_organizer: 'Co-organizer', leader: 'You lead', sweep: 'You sweep', rider: 'Going' })[role];

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
  tools: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.one },
  tool: { width: '24%', alignItems: 'center', gap: 6, minHeight: 72 },
  toolIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
