import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { eventInvitedLine, invitedLine, namesLine, ridersLabel } from '@/core/groups';
import { inviteGroupToEvent, inviteGroupToRide, myGroups, NotSwitchedOnError, openNewGroup, type RidingGroup } from '@/lib/groups';
import { Convoy } from './convoy';
import { GroupPhoto } from './group-photo';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { Button } from './ui';
import { ProTag } from './pro-tag';

import { t } from '@/lib/i18n';
/**
 * Invite a whole riding group to a ride or an event in one tap. Shown to the ride's organizers
 * inside the invite card, and to an event's hosts on the event page. Each invited rider gets a
 * notification (rides also show on their home screen; events open the event page).
 */
export function GroupInvite({ rideId, eventId, bare }: { rideId?: string; eventId?: string; bare?: boolean }) {
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
      if (eventId) {
        const n = await inviteGroupToEvent(eventId, g.id);
        setDone((d) => ({ ...d, [g.id]: eventInvitedLine(n, g.name) }));
      } else if (rideId) {
        const n = await inviteGroupToRide(rideId, g.id);
        setDone((d) => ({ ...d, [g.id]: invitedLine(n, g.name) }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={bare ? styles.bare : styles.wrap}>
      {bare ? null : <ThemedText type="heading" style={{ fontSize: 20 }}>{t('Invite a Group')}</ThemedText>}
      {off ? (
        <ThemedText type="small" themeColor="textSecondary">{t('Riding groups are not switched on yet. They start working with the next server update.')}</ThemedText>
      ) : groups === null ? null : groups.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={openNewGroup} style={styles.empty}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ThemedText style={{ fontWeight: 700, flexShrink: 1 }}>{t('Save Your Crew as a Group')}</ThemedText>
              <ProTag feature="saved_groups" />
            </View>
            <ThemedText type="small" themeColor="textSecondary">{eventId ? t('Then invite everyone to your event in one tap.') : t('Then invite everyone to your next ride in one tap.')}</ThemedText>
          </View>
          <Icon name="chevron" color={Colors.textSecondary} />
        </Pressable>
      ) : (
        groups.map((g) => (
          <View key={g.id} style={styles.group}>
            <View style={styles.groupTop}>
              <GroupPhoto uri={g.photoUrl} name={g.name} size={44} radius={12} />
              <View style={{ flex: 1, gap: 6 }}>
                <ThemedText style={styles.name} numberOfLines={1}>{g.name}</ThemedText>
                <Convoy names={g.riders.map((r) => r.name)} ids={g.riders.map((r) => r.id)} size={22} max={5} />
              </View>
              {done[g.id] ? (
                <View style={styles.sent} accessibilityLabel={t('Invited')}>
                  <Icon name="check" color="#fff" size={22} strokeWidth={2.6} />
                </View>
              ) : (
                <Button title={t('Invite All')} loading={busy === g.id} onPress={() => invite(g)} style={{ minHeight: 44 }} />
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

const styles = themedStyles(() => ({
  bare: { gap: Spacing.two },
  wrap: { gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  group: { backgroundColor: Colors.backgroundSelected, borderRadius: Radius.control, padding: 12, gap: 8 },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  name: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 26 },
  sent: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2F9E5B', alignItems: 'center', justifyContent: 'center' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundSelected, borderRadius: Radius.control, padding: 14 },
}));
