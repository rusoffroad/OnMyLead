import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Convoy, RiderDot } from '@/components/convoy';
import { Icon } from '@/components/icon';
import { RiderPicker } from '@/components/rider-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen, Section } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { mailUrl, smsUrl } from '@/core/discovery';
import {
  groupInviteMessage, groupLink, groupNameProblem, invitedLine, MAX_GROUP_NAME, ridersLabel, type RideMate,
} from '@/core/groups';
import { confirmAsync } from '@/lib/confirm';
import {
  addGroupRiders, deleteGroup, getGroup, inviteGroupToRide, leaveGroup, removeGroupRider, renameGroup, resetGroupLink,
  rideMates, ridesIOrganize, type RidingGroup,
} from '@/lib/groups';
import { handleProError, requirePro } from '@/lib/pro';
import { useSession } from '@/lib/session';
import type { Ride } from '@/lib/types';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';
const day = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** One group: invite it to a ride, see who's in it, add riders, share its link. */
export default function GroupPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const [group, setGroup] = useState<RidingGroup | null | undefined>(undefined);
  const [rides, setRides] = useState<Ride[]>([]);
  const [picking, setPicking] = useState<'ride' | 'riders' | null>(null);
  const [mates, setMates] = useState<RideMate[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroup(await getGroup(id));
    } catch (e) {
      setError((e as Error).message);
      setGroup(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      ridesIOrganize().then(setRides).catch(() => setRides([]));
    }, [load]),
  );

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (!handleProError(e)) setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (group === undefined) return <Screen><ThemedText themeColor="textSecondary">Loading…</ThemedText></Screen>;
  if (group === null) {
    return (
      <Screen>
        <ThemedText>{error ?? 'This group is gone, or you’re no longer in it.'}</ThemedText>
      </Screen>
    );
  }

  const owner = group.ownerId === me;
  const link = groupLink(WEB_URL, group.inviteCode);
  const message = groupInviteMessage(group.name, group.inviteCode, link);
  const inGroup = new Set(group.riders.map((r) => r.id));
  const addable = mates.filter((m) => !inGroup.has(m.id));

  const send = async (how: 'sheet' | 'text' | 'email') => {
    if (how === 'sheet') return Share.share({ message });
    const url = how === 'text' ? smsUrl(message, Platform.OS) : mailUrl(`Join "${group.name}" on OnMyLead`, message);
    await Linking.openURL(url).catch(() => Share.share({ message }));
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />

      <View style={styles.hero}>
        {renaming !== null ? (
          <View style={{ gap: Spacing.two, alignSelf: 'stretch' }}>
            <Field label="Group Name" value={renaming} onChangeText={setRenaming} autoFocus maxLength={MAX_GROUP_NAME + 8} returnKeyType="done" />
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Button title="Cancel" kind="secondary" style={{ flex: 1 }} onPress={() => setRenaming(null)} />
              <Button
                title="Save Name"
                style={{ flex: 1 }}
                loading={busy === 'rename'}
                onPress={() => {
                  const why = groupNameProblem(renaming);
                  if (why) return setError(why);
                  act('rename', async () => {
                    await renameGroup(group.id, renaming);
                    setRenaming(null);
                    await load();
                  });
                }}
              />
            </View>
          </View>
        ) : (
          <Pressable
            disabled={!owner}
            accessibilityRole={owner ? 'button' : 'header'}
            accessibilityHint={owner ? 'Rename the group' : undefined}
            onPress={() => setRenaming(group.name)}
            style={{ alignSelf: 'stretch' }}>
            <Text style={styles.title}>{group.name}</Text>
            <ThemedText type="small" themeColor="textSecondary">
              {owner ? `${ridersLabel(group.riders.length)}. Tap the name to rename it.` : `${ridersLabel(group.riders.length)}, Run By ${group.ownerName}`}
            </ThemedText>
          </Pressable>
        )}
        <Convoy names={group.riders.map((r) => r.name)} size={40} max={7} />
      </View>

      <Button title="Invite to a Ride" big onPress={() => setPicking(picking === 'ride' ? null : 'ride')} />
      {notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <Icon name="check" color="#3CC36B" size={20} strokeWidth={2.6} />
          <ThemedText style={{ flex: 1 }}>{notice}</ThemedText>
        </View>
      ) : null}
      {picking === 'ride' ? (
        <View style={styles.list}>
          {rides.length ? (
            rides.map((r, i) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`Invite ${group.name} to ${r.name}`}
                disabled={!!busy}
                onPress={() =>
                  act(`ride:${r.id}`, async () => {
                    const n = await inviteGroupToRide(r.id, group.id);
                    setNotice(`${invitedLine(n, group.name)}`);
                    setPicking(null);
                  })
                }
                style={({ pressed }) => [styles.rideRow, i > 0 && styles.rule, pressed && { backgroundColor: Colors.backgroundSelected }]}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{r.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{r.status === 'live' ? 'Riding Now' : day(r.meet_at)}</ThemedText>
                </View>
                <ThemedText style={{ color: Colors.accent, fontWeight: 700 }}>{busy === `ride:${r.id}` ? 'Inviting…' : 'Invite'}</ThemedText>
              </Pressable>
            ))
          ) : (
            <View style={{ padding: Spacing.three, gap: Spacing.two }}>
              <ThemedText themeColor="textSecondary">You’re not organizing an upcoming ride. Create one and invite the group from there.</ThemedText>
              <Button title="Create a Ride" kind="secondary" onPress={() => router.push('/ride/new')} />
            </View>
          )}
        </View>
      ) : null}

      <ErrorText error={error} />

      <Section title="Riders" right={<ThemedText themeColor="textSecondary">{group.riders.length}</ThemedText>} />
      <View style={styles.list}>
        {group.riders.map((r, i) => (
          <View key={r.id} style={[styles.riderRow, i > 0 && styles.rule]}>
            <RiderDot name={r.name} lead={r.isOwner} size={36} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{r.id === me ? `${r.name} (You)` : r.name}</ThemedText>
              {r.isOwner ? <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>Runs This Group</ThemedText> : null}
            </View>
            {owner && !r.isOwner ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${r.name} from the group`}
                hitSlop={8}
                onPress={async () => {
                  if (!requirePro('saved_groups')) return;
                  if (!(await confirmAsync(`Remove ${r.name}?`, 'They stop getting this group’s ride invites. You can add them back later.', 'Remove'))) return;
                  act(`remove:${r.id}`, async () => {
                    await removeGroupRider(group.id, r.id);
                    await load();
                  });
                }}
                style={styles.remove}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      {owner ? (
        picking === 'riders' ? (
          <View style={{ gap: Spacing.two }}>
            <Section title="Add Riders You’ve Ridden With" />
            {addable.length ? (
              <>
                <RiderPicker mates={addable} picked={picked} onChange={setPicked} />
                <Button
                  title={picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'Rider' : 'Riders'}` : 'Add Riders'}
                  disabled={!picked.length}
                  loading={busy === 'add'}
                  onPress={() =>
                    act('add', async () => {
                      await addGroupRiders(group.id, picked);
                      setPicked([]);
                      setPicking(null);
                      await load();
                    })
                  }
                />
              </>
            ) : (
              <ThemedText themeColor="textSecondary">Everyone you’ve ridden with is already in the group. Send the link below to anyone else.</ThemedText>
            )}
          </View>
        ) : (
          <Button
            title="Add Riders You’ve Ridden With"
            kind="secondary"
            onPress={() => {
              if (!requirePro('saved_groups')) return;
              setPicking('riders');
              rideMates().then(setMates).catch((e) => setError((e as Error).message));
            }}
          />
        )
      ) : null}

      <View style={styles.linkCard}>
        <ThemedText type="heading">Invite by Link</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          For friends who aren’t on OnMyLead yet. They open the link, make a free account and join the group.
        </ThemedText>
        <Button title="Share Group Link" onPress={() => send('sheet')} style={{ backgroundColor: Colors.sky }} />
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <Button title="Text" kind="secondary" style={{ flex: 1 }} onPress={() => send('text')} />
          <Button title="Email" kind="secondary" style={{ flex: 1 }} onPress={() => send('email')} />
          <Button
            title={copied ? 'Copied' : 'Copy'}
            kind="secondary"
            style={{ flex: 1 }}
            onPress={async () => {
              await Clipboard.setStringAsync(link ?? group.inviteCode);
              setCopied(true);
            }}
          />
        </View>
        {owner ? (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              if (!(await confirmAsync('Make a new link?', 'The old link stops working. Everyone already in the group stays in.', 'New Link'))) return;
              act('reset', async () => {
                await resetGroupLink(group.id);
                setCopied(false);
                await load();
              });
            }}
            style={{ minHeight: 40, justifyContent: 'center' }}>
            <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>Make a New Link</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {owner ? (
        <Button
          title="Delete Group"
          kind="ghost"
          onPress={async () => {
            if (!(await confirmAsync(`Delete ${group.name}?`, 'The group goes away for everyone in it. Rides you already invited it to stay as they are.'))) return;
            act('delete', async () => {
              await deleteGroup(group.id);
              router.back();
            });
          }}
        />
      ) : (
        <Button
          title="Leave Group"
          kind="ghost"
          onPress={async () => {
            if (!(await confirmAsync(`Leave ${group.name}?`, 'You stop getting this group’s ride invites. The group link brings you back.', 'Leave'))) return;
            act('leave', async () => {
              await leaveGroup(group.id);
              router.back();
            });
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.three, alignItems: 'flex-start' },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 44, lineHeight: 46, letterSpacing: -0.5 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(60,195,107,0.10)', borderRadius: Radius.control, padding: 12 },
  list: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, overflow: 'hidden' },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rideRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  remove: { minHeight: 36, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Colors.backgroundSelected, justifyContent: 'center' },
  removeText: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14 },
  linkCard: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.two, marginTop: Spacing.two },
});
