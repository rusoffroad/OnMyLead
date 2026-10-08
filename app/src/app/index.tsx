import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Logo } from '@/components/logo';
import { RideRow, RowGroup } from '@/components/ride-row';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen, Section } from '@/components/ui';
import { font, Radius, RideColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { discoverPublicRides, myRides } from '@/lib/api';
import { useSession } from '@/lib/session';
import { isBackendConfigured } from '@/lib/supabase';
import type { Ride, RideMember } from '@/lib/types';

type Tool = { icon: IconName; title: string; detail: string; href: '/share' | '/garage' | '/trips' | '/starlink'; color: string; open?: boolean };

const TOOLS: Tool[] = [
  { icon: 'pin', title: 'Share location', detail: 'On a timer you set', href: '/share', color: '#3B86F7' },
  { icon: 'machine', title: 'Garage', detail: 'Your build and range', href: '/garage', color: '#E5262E' },
  { icon: 'checklist', title: 'Trip planner', detail: 'Packing lists', href: '/trips', color: RideColors.green },
  { icon: 'dish', title: 'Starlink', detail: 'Dish and power', href: '/starlink', color: RideColors.yellow, open: true },
];

export default function Home() {
  const theme = useTheme();
  const { session, loading } = useSession();
  const [mine, setMine] = useState<(RideMember & { rides: Ride })[]>([]);
  const [nearby, setNearby] = useState<Ride[]>([]);
  const [code, setCode] = useState('');
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
      <View style={{ paddingTop: Spacing.two }}>
        <Logo height={112} />
      </View>

      {live ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/ride/${live.ride_id}/live`)}
          style={({ pressed }) => [styles.live, { backgroundColor: theme.accent, opacity: pressed ? 0.9 : 1 }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type="small" style={{ color: '#FFD9DA', fontWeight: 700 }}>Your ride is live</ThemedText>
            <ThemedText type="heading" style={{ color: '#fff' }} numberOfLines={1}>{live.rides.name}</ThemedText>
            <ThemedText type="small" style={{ color: '#fff' }}>Tap to open Ride Mode</ThemedText>
          </View>
          <Icon name="chevron" color="#fff" />
        </Pressable>
      ) : null}

      {!loading && !session ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>Ride together. Get home together.</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', marginBottom: Spacing.two }}>
            Plan the ride, share where you are while you ride, and know when someone falls behind.
          </ThemedText>
          <Button title="Create a free account" big onPress={() => router.push('/sign-in?mode=create')} />
          <Button title="I already have an account" kind="ghost" onPress={() => router.push('/sign-in')} />
        </View>
      ) : (
        <Button title="Create a ride" big kind={live ? 'secondary' : 'primary'} onPress={() => go('/ride/new')} />
      )}

      <View style={[styles.join, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="hash" color={theme.textSecondary} size={22} />
        <TextInput
          value={code}
          onChangeText={setCode}
          onSubmitEditing={openCode}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          keyboardAppearance="dark"
          placeholder="Got an invite code?"
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.sky}
          accessibilityLabel="Invite code"
          style={[styles.joinInput, { color: theme.text }]}
        />
        <Button title="Open" kind="secondary" disabled={code.trim().length < 4} onPress={openCode} style={{ minHeight: 44 }} />
      </View>

      <View style={styles.tools}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.href}
            accessibilityRole="button"
            accessibilityLabel={`${t.title}. ${t.detail}`}
            onPress={() => (t.open ? router.push(t.href) : go(t.href))}
            style={({ pressed }) => [styles.tool, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
            <View style={[styles.toolIcon, { backgroundColor: `${t.color}22` }]}>
              <Icon name={t.icon} color={t.color} />
            </View>
            <View style={{ gap: 0 }}>
              <ThemedText style={styles.toolTitle}>{t.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{t.detail}</ThemedText>
            </View>
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

const roleLabel = (role: RideMember['role']) =>
  ({ organizer: 'You organize', co_organizer: 'Co-organizer', leader: 'You lead', sweep: 'You sweep', rider: 'Going' })[role];

const styles = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Radius.card, padding: Spacing.three },
  join: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Radius.card, paddingLeft: Spacing.three, padding: 8 },
  joinInput: { flex: 1, minHeight: 44, fontSize: 17, fontFamily: font(600), letterSpacing: 1 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tool: { width: '48.5%', flexGrow: 1, borderRadius: Radius.card, padding: 14, gap: 14, minHeight: 124, justifyContent: 'space-between' },
  toolIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolTitle: { fontSize: 20, lineHeight: 22, fontFamily: font(700, 'display') },
});
