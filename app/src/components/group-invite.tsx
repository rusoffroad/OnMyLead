import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { invitedLine, namesLine, ridersLabel } from '@/core/groups';
import { inviteGroupToRide, myGroups, NotSwitchedOnError, type RidingGroup } from '@/lib/groups';
import { Convoy } from './convoy';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { Button } from './ui';

/**
 * Invite a whole riding group to this ride in one tap. Shown to the ride's organizers inside the
 * invite card. Each invited rider gets a notification and sees the ride on their home screen.
 */
export function GroupInvite({ rideId }: { rideId: string }) {
  const [groups, setGroups] = useState<RidingGroup[] | null>(null);
  const [off, setOff] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    myGroups()
      .then(setGroups)
      .catch((e) => (e instanceof NotSwitchedOnError ? setOff(true) : setError((e as Error).message)));
  }, []);

  const invite = async (g: RidingGroup) => {
    setBusy(g.id);
    setError(null);
    try {
      const n = await inviteGroupToRide(rideId, g.id);
      setDone((d) => ({ ...d, [g.id]: invitedLine(n, g.name) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <ThemedText type="heading" style={{ fontSize: 20 }}>Invite A Group</ThemedText>
      {off ? (
        <ThemedText type="small" themeColor="textSecondary">Riding groups are not switched on yet. They start working with the next server update.</ThemedText>
      ) : groups === null ? null : groups.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/groups/new')} style={styles.empty}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText style={{ fontWeight: 700 }}>Save Your Crew As A Group</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Then invite everyone to your next ride in one tap.</ThemedText>
          </View>
          <Icon name="chevron" color={Colors.textSecondary} />
        </Pressable>
      ) : (
        groups.map((g) => (
          <View key={g.id} style={styles.group}>
            <View style={styles.groupTop}>
              <View style={{ flex: 1, gap: 6 }}>
                <ThemedText style={styles.name} numberOfLines={1}>{g.name}</ThemedText>
                <Convoy names={g.riders.map((r) => r.name)} size={22} max={5} />
              </View>
              {done[g.id] ? (
                <View style={styles.sent} accessibilityLabel="Invited">
                  <Icon name="check" color="#fff" size={22} strokeWidth={2.6} />
                </View>
              ) : (
                <Button title="Invite All" loading={busy === g.id} onPress={() => invite(g)} style={{ minHeight: 44 }} />
              )}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {done[g.id] ?? `${ridersLabel(g.riders.length)}: ${namesLine(g.riders.map((r) => r.name), 4)}`}
            </ThemedText>
          </View>
        ))
      )}
      {error ? <ThemedText type="small" style={{ color: Colors.danger, fontWeight: 600 }}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  group: { backgroundColor: Colors.backgroundSelected, borderRadius: Radius.control, padding: 12, gap: 8 },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  name: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 26 },
  sent: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2F9E5B', alignItems: 'center', justifyContent: 'center' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundSelected, borderRadius: Radius.control, padding: 14 },
});
