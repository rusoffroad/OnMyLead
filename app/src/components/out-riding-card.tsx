import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Convoy } from '@/components/convoy';
import { Icon } from '@/components/icon';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { unreadLabel } from '@/core/group-chat';
import { countLine, DEFAULT_RADIUS, endsLabel, isOut, totalUnread, type NearbyRider } from '@/core/out-riding';
import { friendsLine, splitFriends } from '@/core/friends';
import { useBlocks } from '@/lib/blocks';
import { refreshFriends, useFriends } from '@/lib/friends';
import { myDmThreads, nearbyRiders, useMyOutRiding } from '@/lib/out-riding';

import { t as tr } from '@/lib/i18n';
/**
 * The way into Out Riding, Messages and Friends, at the top of the Groups tab. Off: one line on
 * what it does. On: who's out within 10 miles at a glance. Each part hides until the server has it.
 */
export function OutRidingCard() {
  const me = useMyOutRiding();
  const friends = useFriends();
  const blocks = useBlocks();
  const on = isOut(me.status);
  const [nearby, setNearby] = useState<NearbyRider[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasThreads, setHasThreads] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (on && me.status) nearbyRiders(DEFAULT_RADIUS, me.status.audience).then(setNearby).catch(() => {});
      myDmThreads()
        .then((t) => {
          setUnread(totalUnread(t));
          setHasThreads(t.length > 0);
        })
        .catch(() => {});
      refreshFriends();
    }, [on, me.status]),
  );

  if (!me.loaded || me.off) return null;
  const shown = on ? nearby.filter((r) => !blocks.ids.has(r.user_id)) : [];
  const badge = unreadLabel(unread);
  const split = splitFriends(friends.list);
  const requests = split.received.length;
  // The red count already says how many requests; the line says the friends when there are some.
  const line = friendsLine(split.friends.length ? split.friends : friends.list);

  return (
    <View style={{ gap: Spacing.two }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={on ? tr('You’re Out Riding. {v}', { v: countLine(shown, DEFAULT_RADIUS) }) : tr('Out Riding. See which riders are out near you.')}
        onPress={() => router.push('/out-riding')}
        style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && { backgroundColor: Colors.backgroundSelected }]}>
        <View style={styles.top}>
          <View style={[styles.dot, on ? styles.dotOn : null]} />
          <Text style={styles.title}>{on ? tr('You’re Out Riding') : tr('Out Riding')}</Text>
          <Icon name="chevron" color={Colors.textSecondary} />
        </View>
        {on && me.status ? (
          <>
            {shown.length ? <Convoy names={shown.map((r) => r.display_name)} ids={shown.map((r) => r.user_id)} max={7} size={30} /> : null}
            <Text style={styles.line}>{countLine(shown, DEFAULT_RADIUS)}</Text>
            <Text style={styles.sub}>{endsLabel(me.status.expires_at)}</Text>
          </>
        ) : (
          <Text style={styles.sub}>{tr('Heading out? Switch it on to see which riders are out near you, and message them.')}</Text>
        )}
      </Pressable>
      {hasThreads ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('Messages{v}', { v: badge ? `, ${badge}` : '' })}
          onPress={() => router.push('/messages')}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.backgroundSelected }]}>
          <Icon name="mail" color={Colors.sky} />
          <Text style={styles.rowText}>{tr('Messages')}</Text>
          {badge ? <Text style={styles.unread}>{badge}</Text> : null}
          <Icon name="chevron" color={Colors.textSecondary} />
        </Pressable>
      ) : null}
      {friends.loaded && !friends.off ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Friends. ${friendsLine(friends.list)}`}
          onPress={() => router.push('/friends')}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.backgroundSelected }]}>
          <Icon name="addFriend" color={RideColors.green} />
          <View style={{ flex: 1, paddingVertical: 8 }}>
            <Text style={styles.rowText}>{tr('Friends')}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>{line}</Text>
          </View>
          {requests ? <Text style={styles.unread}>{requests}</Text> : null}
          <Icon name="chevron" color={Colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: 10, borderWidth: 2, borderColor: 'transparent' },
  cardOn: { borderColor: RideColors.green },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.backgroundSelected, borderWidth: 2, borderColor: Colors.border },
  dotOn: { backgroundColor: RideColors.green, borderColor: `${RideColors.green}55`, borderWidth: 3 },
  title: { flex: 1, color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
  line: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19 },
  sub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 15, lineHeight: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: Spacing.three,
    backgroundColor: Colors.backgroundElement, borderRadius: Radius.control,
  },
  rowText: { flex: 1, color: Colors.text, fontFamily: font(700), fontSize: 17 },
  rowSub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  unread: {
    color: '#fff', backgroundColor: Colors.accent, fontFamily: font(700), fontSize: 12, overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill,
  },
}));
