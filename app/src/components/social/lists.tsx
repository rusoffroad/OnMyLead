import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RiderPhoto } from '@/components/rider-photo';
import { Button } from '@/components/ui';
import { Colors, font, themedStyles } from '@/constants/theme';
import { splitFriends, type Friend } from '@/core/friends';
import { profileHref, type SocialItem } from '@/core/social';
import { requirePro } from '@/lib/pro';
import { faceColor, Initial } from '../home/parts';
import { ProTag, Social } from './parts';
import { SocialCard } from './social-card';

import { t } from '@/lib/i18n';
/** A list of items that can change (likes) or go away (a deleted post) without reloading. */
export function useItems() {
  const [items, setItems] = useState<SocialItem[] | null>(null);
  const update = useCallback((i: number, next: SocialItem) => setItems((list) => (list ? list.map((x, j) => (j === i ? next : x)) : list)), []);
  const remove = useCallback((i: number) => setItems((list) => (list ? list.filter((_, j) => j !== i) : list)), []);
  return { items, setItems, update, remove };
}

/** Cards one under the other, with Load More when there may be older ones. */
export function ItemList({
  items, update, remove, empty, more, loadingMore,
}: {
  items: SocialItem[];
  update: (i: number, next: SocialItem) => void;
  remove: (i: number) => void;
  empty: string;
  more?: () => void;
  loadingMore?: boolean;
}) {
  if (!items.length) {
    return (
      <View style={styles.empty}>
        <Icon name="people" size={26} color={Social.muted} />
        <Text style={styles.emptyText}>{empty}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {items.map((item, i) => (
        <SocialCard key={item.key ?? `${item.kind}${item.actorId}${item.at}`} item={item} onChange={(n) => update(i, n)} onDeleted={() => remove(i)} />
      ))}
      {more ? <Button title={t('Show Older')} kind="secondary" loading={loadingMore} onPress={more} /> : null}
    </View>
  );
}

/** "What's the ride report?": opens the composer (Pro), with the rider's own picture. */
export function ComposePrompt({ userId, name, pro }: { userId: string; name: string; pro: boolean }) {
  return (
    <Pressable
      onPress={() => {
        if (requirePro('social_posts')) router.push('/social/new');
      }}
      accessibilityRole="button"
      accessibilityLabel={t('Post a ride report to your profile')}
      style={({ pressed }) => [styles.compose, pressed && { backgroundColor: Social.panel2 }]}>
      <RiderPhoto userId={userId} size={40} zoom={false} fallback={<Initial name={name} size={40} color={faceColor(userId)} />} />
      <Text style={styles.composeText}>{t('Post a ride report…')}</Text>
      {pro ? <Icon name="image" size={22} color={Social.muted} /> : <ProTag />}
    </Pressable>
  );
}

/** Friends as rows: picture (tap for full size), name, and Out Riding now. Tap a row for their profile. */
export function FriendRows({ list, limit }: { list: Friend[]; limit?: number }) {
  const { friends, received } = splitFriends(list);
  const shown = limit ? friends.slice(0, limit) : friends;
  return (
    <View style={{ gap: 10 }}>
      {received.length ? (
        <Pressable onPress={() => router.push('/friends')} style={styles.requests} accessibilityRole="link">
          <Icon name="addFriend" size={20} color={Colors.sky} />
          <Text style={styles.requestsText}>{t(received.length === 1 ? '{n} Friend Request' : '{n} Friend Requests', { n: received.length })}</Text>
          <Icon name="chevron" size={16} color={Colors.sky} />
        </Pressable>
      ) : null}
      {shown.length ? (
        <View style={styles.rows}>
          {shown.map((f, i) => <FriendRow key={f.user_id} friend={f} first={i === 0} />)}
        </View>
      ) : (
        <Text style={styles.emptyText}>{t('No friends yet. Add the riders you ride with and their rides, badges and posts show up here.')}</Text>
      )}
      <Button
        title={limit && friends.length > limit ? `See All ${friends.length} Friends` : 'Add and Manage Friends'}
        kind="secondary"
        onPress={() => router.push('/friends')}
      />
    </View>
  );
}

function FriendRow({ friend, first }: { friend: Friend; first: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(profileHref(friend.user_id) as never)}
      accessibilityRole="link"
      accessibilityLabel={`${friend.display_name}’s profile`}
      style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && { backgroundColor: Social.panel2 }]}>
      <RiderPhoto userId={friend.user_id} name={friend.display_name} size={40} fallback={<Initial name={friend.display_name} size={40} color={faceColor(friend.user_id)} />} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{friend.display_name || 'Rider'}</Text>
        <Text style={styles.rowSub}>{friend.out_now ? 'Out riding now' : 'Friend'}</Text>
      </View>
      <Icon name="chevron" size={18} color={Social.muted} />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 22, backgroundColor: Social.panel, borderWidth: 1, borderColor: Social.line },
  emptyText: { flex: 1, color: Social.muted, fontFamily: font(500), fontSize: 14, lineHeight: 20 },
  compose: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 16, borderRadius: 22,
    backgroundColor: Social.panel, borderWidth: 1, borderColor: Social.line,
  },
  composeText: { flex: 1, color: Social.muted, fontFamily: font(500), fontSize: 16 },
  requests: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(59,134,247,0.12)' },
  requestsText: { flex: 1, color: Colors.sky, fontFamily: font(700), fontSize: 15 },
  rows: { borderRadius: 22, backgroundColor: Social.panel, borderWidth: 1, borderColor: Social.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 60 },
  rowLine: { borderTopWidth: 1, borderTopColor: Social.line },
  rowName: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  rowSub: { color: Social.muted, fontFamily: font(500), fontSize: 12 },
}));
