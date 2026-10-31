import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import { SharePicker } from '@/components/share-picker';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/icon';
import { Button, Card, ErrorText, Screen, Section } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  EXTEND_PROMPT_LEAD_MIN, formatRemaining, isUntilTurnedOff, PERSONAL_SHARE_OPTIONS_MIN, shareEndText,
} from '@/core/sharing';
import {
  extendLocationShare, myActiveShares, ridingFriends, startLocationShare, stopLocationShare, type ActiveShare,
} from '@/lib/api';
import { BATTERY_PLANS } from '@/core/battery';
import { useBatteryMode } from '@/lib/battery';
import { confirmAsync } from '@/lib/confirm';
import { startSendingLocation, stopSendingLocation } from '@/lib/location';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

/**
 * Personal location sharing: share with chosen people, any time, for as long as you pick: a few
 * hours, until a day and time on the calendar, or until you turn it off. Stop is always one tap.
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
  const batteryMode = useBatteryMode();

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
      const endAt = s.expires_at ? Date.parse(s.expires_at) : null;
      await startSendingLocation(null, isUntilTurnedOff(endAt) ? null : endAt);
      if (s.link_token) {
        const url = WEB_URL ? `${WEB_URL}/f/${s.link_token}` : s.link_token;
        const when = isUntilTurnedOff(endAt) ? 'Follow my location' : `Follow my location ${shareEndText(endAt, Date.now())}`;
        await Share.share({ message: `${when}: ${url}` });
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
        const endAt = s.expires_at ? Date.parse(s.expires_at) : null;
        const untilOff = isUntilTurnedOff(endAt);
        const left = endAt == null ? null : endAt - now;
        const nearEnd = left != null && left <= EXTEND_PROMPT_LEAD_MIN * 60_000;
        const multiDay = left != null && !untilOff && left >= 24 * 3_600_000;
        return (
          <Card key={s.id} style={{ borderLeftWidth: 4, borderLeftColor: theme.sky }}>
            <ThemedText type="heading" style={{ color: theme.sky }}>
              Sharing Now, {untilOff || multiDay ? shareEndText(endAt, now) : formatRemaining(left)}
            </ThemedText>
            {untilOff ? (
              <ThemedText type="small" themeColor="textSecondary">This keeps going, even for days, until you tap Stop.</ThemedText>
            ) : null}
            {s.link_token ? <ThemedText type="small" themeColor="textSecondary">Includes a family link</ThemedText> : null}
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Button title="Stop Sharing" kind="danger" style={{ flex: 1 }} onPress={() => stop(s)} />
              {untilOff ? null : (
                <Button title={nearEnd ? 'Ending Soon · Add 1 Hr' : 'Add 1 Hour'} kind="secondary" style={{ flex: 1 }} onPress={() => extend(s)} />
              )}
            </View>
          </Card>
        );
      })}

      <Section title="Who Can See You" />
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
            <ThemedText style={{ fontWeight: 700 }}>Family Link</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">A read-only web link for someone without the app. It stops working when sharing ends.</ThemedText>
          </View>
        </Card>
      </Pressable>

      <Section title="For How Long" />
      <SharePicker
        options={PERSONAL_SHARE_OPTIONS_MIN}
        openLabel="Until I Turn It Off"
        openHint="No time limit. Keeps sharing until you tap Stop Sharing here."
        busy={busy}
        onPick={async (m) => {
          if (m == null) {
            const ok = await confirmAsync(
              'Share Until You Turn It Off?',
              'There is no time limit. Your location keeps sharing, even for days, until you come back here and tap Stop Sharing.',
              'Share',
            );
            if (ok) start(null);
          } else start(m);
        }}
      />
      <ErrorText error={error} />
      <Pressable accessibilityRole="link" onPress={() => router.push('/battery')} hitSlop={6}>
        <ThemedText type="small" themeColor="textSecondary">
          Battery Saver: {BATTERY_PLANS[batteryMode].label}. <ThemedText type="small" style={{ color: theme.sky, fontWeight: 600 }}>Change</ThemedText>
        </ThemedText>
      </Pressable>
    </Screen>
  );
}
