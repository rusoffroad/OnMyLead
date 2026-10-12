import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { followLeader, followStates, NotSwitchedOnError, unfollowLeader } from '@/lib/groups';
import { RiderDot } from './convoy';
import { ThemedText } from './themed-text';

type Leader = { id: string; name: string; following: boolean };

/**
 * Follow This Leader, on the ride page: follow whoever organizes or leads the ride and hear when
 * they post a new public ride. `ids` is the organizer first, then anyone else leading.
 */
export function FollowLeaders({ ids, organizerId }: { ids: string[]; organizerId: string }) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [off, setOff] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = ids.join(',');

  useEffect(() => {
    if (!key) return;
    followStates(key.split(','))
      .then(setLeaders)
      .catch((e) => (e instanceof NotSwitchedOnError ? setOff(true) : setLeaders([])));
  }, [key]);

  if (!key || (!off && !leaders.length)) return null;

  const toggle = async (l: Leader) => {
    setBusy(l.id);
    setError(null);
    try {
      await (l.following ? unfollowLeader(l.id) : followLeader(l.id));
      setLeaders((all) => all.map((x) => (x.id === l.id ? { ...x, following: !x.following } : x)));
    } catch (e) {
      setError(e instanceof NotSwitchedOnError ? 'Following leaders is not switched on yet.' : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (off) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Follow This Leader is not switched on yet. It starts working with the next server update.
      </ThemedText>
    );
  }

  return (
    <View style={{ gap: Spacing.two }}>
      {leaders.map((l) => (
        <View key={l.id} style={styles.row}>
          <RiderDot name={l.name} lead size={36} />
          <View style={{ flex: 1 }}>
            <ThemedText type="small" themeColor="textSecondary">{l.id === organizerId ? 'Organizer' : 'Ride Leader'}</ThemedText>
            <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{l.name}</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: l.following, busy: busy === l.id }}
            accessibilityLabel={l.following ? `Following ${l.name}. Tap to unfollow` : `Follow ${l.name}`}
            accessibilityHint="Get a notification when they post a new public ride"
            disabled={busy === l.id}
            onPress={() => toggle(l)}
            style={({ pressed }) => [styles.button, l.following ? styles.on : styles.offBtn, pressed && { opacity: 0.8 }]}>
            <Text style={[styles.buttonText, { color: l.following ? Colors.sky : '#fff' }]}>{l.following ? 'Following' : 'Follow'}</Text>
          </Pressable>
        </View>
      ))}
      {error ? <ThemedText type="small" style={{ color: Colors.danger, fontWeight: 600 }}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, paddingVertical: 10, paddingHorizontal: 14 },
  button: { minHeight: 40, minWidth: 104, paddingHorizontal: 16, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  offBtn: { backgroundColor: Colors.sky },
  on: { borderWidth: 1.5, borderColor: Colors.sky, backgroundColor: 'transparent' },
  buttonText: { fontFamily: font(700), fontSize: 15 },
});
