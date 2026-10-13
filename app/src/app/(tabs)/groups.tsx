import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Convoy, RiderDot } from '@/components/convoy';
import { Icon } from '@/components/icon';
import { RideRow, RowGroup } from '@/components/ride-row';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen, Section } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { previewLine, unreadLabel, type GroupChatSummary } from '@/core/group-chat';
import { NOT_SWITCHED_ON, ridersLabel } from '@/core/groups';
import { useBlocks } from '@/lib/blocks';
import { myGroupChats } from '@/lib/group-chat';
import {
  followedLeadersRides, leadersIFollow, openNewGroup, myFollowerCount, myGroups, NotSwitchedOnError, unfollowLeader, type Followed, type RidingGroup,
} from '@/lib/groups';
import { useSession } from '@/lib/session';
import type { Ride } from '@/lib/types';

/** Your riding groups, the groups you're in, and the leaders you follow. */
export default function Groups() {
  const { session, loading } = useSession();
  const [groups, setGroups] = useState<RidingGroup[] | null>(null);
  const [follows, setFollows] = useState<Followed[]>([]);
  const [followers, setFollowers] = useState(0);
  const [leaderRides, setLeaderRides] = useState<Ride[]>([]);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<Map<string, GroupChatSummary>>(new Map());

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      const fail = (e: unknown) => (e instanceof NotSwitchedOnError ? setOff(true) : setError((e as Error).message));
      myGroups().then(setGroups).catch(fail);
      myGroupChats().then((all) => setChats(new Map(all.map((c) => [c.group_id, c])))).catch(() => {});
      leadersIFollow()
        .then(async (f) => {
          setFollows(f);
          setLeaderRides(await followedLeadersRides(f.map((x) => x.id)));
        })
        .catch(() => {});
      myFollowerCount().then(setFollowers).catch(() => {});
    }, [session, loading]),
  );

  const mine = groups?.filter((g) => g.mine) ?? [];
  const theirs = groups?.filter((g) => !g.mine) ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Riding Groups' }} />
      <ThemedText themeColor="textSecondary">
        Save the people you ride with. When you create a ride, invite the whole group in one tap.
      </ThemedText>

      {off ? (
        <View style={styles.note}>
          <ThemedText type="smallBold">Not Switched On Yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{NOT_SWITCHED_ON}</ThemedText>
        </View>
      ) : null}
      <ErrorText error={error} />

      <Button title="New Group" big disabled={off} onPress={openNewGroup} />

      {groups && !groups.length && !off ? <EmptyCrew /> : null}

      {mine.length ? <Section title="Your Groups" /> : null}
      {mine.map((g) => <GroupCard key={g.id} group={g} chat={chats.get(g.id)} me={session?.user.id} />)}

      {theirs.length ? <Section title="Groups You’re In" /> : null}
      {theirs.map((g) => <GroupCard key={g.id} group={g} chat={chats.get(g.id)} me={session?.user.id} />)}

      {follows.length || followers ? <Section title="Leaders You Follow" /> : null}
      {follows.length ? (
        <View style={styles.list}>
          {follows.map((f, i) => (
            <View key={f.id} style={[styles.followRow, i > 0 && styles.rule]}>
              <RiderDot name={f.name} lead size={32} />
              <ThemedText style={{ flex: 1, fontWeight: 700 }} numberOfLines={1}>{f.name}</ThemedText>
              <Button
                title="Unfollow"
                kind="ghost"
                style={{ minHeight: 40 }}
                onPress={async () => {
                  setFollows((all) => all.filter((x) => x.id !== f.id));
                  setLeaderRides((all) => all.filter((r) => r.organizer_id !== f.id));
                  await unfollowLeader(f.id).catch((e) => setError((e as Error).message));
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
      {follows.length || followers ? (
        <ThemedText type="small" themeColor="textSecondary">
          {follows.length ? 'You get a notification when they post a new public ride. ' : ''}
          {followers ? `${followers} ${followers === 1 ? 'rider follows' : 'riders follow'} you.` : ''}
        </ThemedText>
      ) : null}
      {leaderRides.length ? (
        <>
          <Section title="Their Upcoming Rides" />
          <RowGroup>
            {leaderRides.map((r) => (
              <RideRow key={r.id} ride={r} note={`By ${follows.find((f) => f.id === r.organizer_id)?.name ?? 'a leader you follow'}`} />
            ))}
          </RowGroup>
        </>
      ) : null}
      {!follows.length && !off ? (
        <ThemedText type="small" themeColor="textSecondary">
          Tap Follow on a ride page to hear when that leader posts a new public ride.
        </ThemedText>
      ) : null}
    </Screen>
  );
}

function GroupCard({ group, chat, me }: { group: RidingGroup; chat?: GroupChatSummary; me?: string }) {
  const blocks = useBlocks();
  const preview = chat ? previewLine(chat, me, (uid) => group.riders.find((r) => r.id === uid)?.name ?? 'Former Rider', blocks.ids) : null;
  const unread = chat ? unreadLabel(chat.unread) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${ridersLabel(group.riders.length)}`}
      onPress={() => router.push(`/groups/${group.id}`)}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName} numberOfLines={2}>{group.name}</Text>
        <Icon name="chevron" color={Colors.textSecondary} />
      </View>
      <Convoy names={group.riders.map((r) => r.name)} max={7} />
      <ThemedText type="small" themeColor="textSecondary">
        {group.mine ? ridersLabel(group.riders.length) : `${ridersLabel(group.riders.length)}, Run By ${group.ownerName}`}
      </ThemedText>
      {preview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${group.name} group chat${unread ? `, ${unread}` : ''}`}
          onPress={() => router.push(`/groups/${group.id}/chat`)}
          style={({ pressed }) => [styles.chatLine, pressed && { opacity: 0.7 }]}>
          <ThemedText type="small" style={{ flex: 1, color: unread ? Colors.text : Colors.textSecondary }} numberOfLines={1}>{preview}</ThemedText>
          {unread ? <Text style={styles.unread}>{unread}</Text> : null}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** First visit: a sketch of what a group is, so the empty screen still says what to do. */
function EmptyCrew() {
  return (
    <View style={[styles.card, { alignItems: 'center', paddingVertical: Spacing.four }]}>
      <Convoy names={['You', 'Dusty', 'Kai', 'Mo', 'Reese', 'Tess']} size={30} />
      <ThemedText style={{ fontWeight: 700, textAlign: 'center' }}>No Groups Yet</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 300 }}>
        Make one for the friends you ride with most weekends. Add people you’ve ridden with, or send the group link to anyone else.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: Colors.sky, padding: Spacing.three, gap: 4 },
  card: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardName: { flex: 1, color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 32 },
  list: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, overflow: 'hidden' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  chatLine: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 40, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border, paddingTop: 10,
  },
  unread: {
    color: '#fff', backgroundColor: Colors.accent, fontFamily: font(700), fontSize: 12, overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill,
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
