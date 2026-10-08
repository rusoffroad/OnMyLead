import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, View } from 'react-native';

import { SharePicker } from '@/components/share-picker';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/icon';
import { Button, Card, ErrorText, Screen, Section } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EXTEND_PROMPT_LEAD_MIN, formatRemaining, PERSONAL_SHARE_OPTIONS_MIN } from '@/core/sharing';
import {
  extendLocationShare, myActiveShares, ridingFriends, startLocationShare, stopLocationShare, type ActiveShare,
} from '@/lib/api';
import { startSendingLocation, stopSendingLocation } from '@/lib/location';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

/**
 * Personal location sharing: share with chosen people, any time, for as long as you pick.
 * Always ends on its own; "until I turn it off" is capped at 24 hours.
 */
export default function ShareMyLocation() {
  const theme = useTheme();
  const [friends, setFriends] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [familyLink, setFamilyLink] = useState(false);
  const [shares, setShares] = useState<ActiveShare[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, s] = await Promise.all([ridingFriends(), myActiveShares()]);
    setFriends(f);
    setShares(s.filter((x) => x.scope === 'personal'));
  }, []);

  useFocusEffect(useCallback(() => { load().catch((e) => setError(e.message)); }, [load]));
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Stop the phone sending when the last share times out.
  useEffect(() => {
    const live = shares.filter((s) => !s.expires_at || Date.parse(s.expires_at) > now);
    if (shares.length && !live.length) stopSendingLocation();
  }, [shares, now]);

  async function start(minutes: number | null) {
    if (!picked.length && !familyLink) return setError('Pick at least one person or turn on the family link.');
    setBusy(true);
    setError(null);
    try {
      const s = await startLocationShare({ scope: 'personal', durationMin: minutes, recipientIds: picked, withFamilyLink: familyLink });
      await startSendingLocation(null);
      if (s.link_token) {
        const url = WEB_URL ? `${WEB_URL}/f/${s.link_token}` : s.link_token;
        await Share.share({ message: `Follow my location until ${new Date(s.expires_at!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}: ${url}` });
      }
      setPicked([]);
      setFamilyLink(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start sharing.');
    } finally {
      setBusy(false);
    }
  }

  async function stop(s: ActiveShare) {
    await stopLocationShare(s.id);
    await load();
  }

  async function extend(s: ActiveShare) {
    await extendLocationShare(s, 60);
    await load();
  }

  return (
    <Screen>
      {shares.map((s) => {
        const left = s.expires_at ? Date.parse(s.expires_at) - now : null;
        const nearEnd = left != null && left <= EXTEND_PROMPT_LEAD_MIN * 60_000;
        return (
          <Card key={s.id} style={{ borderLeftWidth: 4, borderLeftColor: theme.sky }}>
            <ThemedText type="heading" style={{ color: theme.sky }}>Sharing now, {formatRemaining(left)}</ThemedText>
            {s.link_token ? <ThemedText type="small" themeColor="textSecondary">Includes a family link</ThemedText> : null}
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Button title="Stop" kind="danger" style={{ flex: 1 }} onPress={() => stop(s)} />
              <Button title={nearEnd ? 'Ending soon · add 1 hr' : 'Add 1 hour'} kind="secondary" style={{ flex: 1 }} onPress={() => extend(s)} />
            </View>
          </Card>
        );
      })}

      <Section title="Who can see you" />
      {friends.length === 0 ? (
        <ThemedText themeColor="textSecondary">People you’ve ridden with show up here. You can still share a family link.</ThemedText>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {friends.map((f) => {
          const on = picked.includes(f.id);
          return (
            <Pressable
              key={f.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => setPicked(on ? picked.filter((x) => x !== f.id) : [...picked, f.id])}
              style={{ borderRadius: 999, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', backgroundColor: on ? theme.accent : theme.backgroundSelected }}>
              <ThemedText style={{ color: on ? theme.onAccent : theme.text, fontWeight: 600 }}>{f.name}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: familyLink }}
        onPress={() => setFamilyLink(!familyLink)}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <View style={{ width: 30, height: 30, borderRadius: 9, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', borderColor: familyLink ? theme.sky : theme.border, backgroundColor: familyLink ? theme.sky : 'transparent' }}>
            {familyLink ? <Icon name="check" size={20} color="#fff" strokeWidth={3} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 700 }}>Family link</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">A read-only web link for someone without the app. It stops working when sharing ends.</ThemedText>
          </View>
        </Card>
      </Pressable>

      <Section title="For how long" />
      <SharePicker options={PERSONAL_SHARE_OPTIONS_MIN} openLabel="Until I turn it off (max 24 hours)" busy={busy} onPick={(m) => {
        if (m == null) {
          Alert.alert('Share until you turn it off?', 'It still stops automatically after 24 hours.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Share', onPress: () => start(null) },
          ]);
        } else start(m);
      }} />
      <ErrorText error={error} />
    </Screen>
  );
}
