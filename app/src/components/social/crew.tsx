import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GroupPhoto } from '@/components/group-photo';
import { faceColor, Initial } from '@/components/home/parts';
import { Icon } from '@/components/icon';
import { RiderPhoto } from '@/components/rider-photo';
import { Colors, font, themedStyles, TileSurface } from '@/constants/theme';
import { splitFriends, type Friend } from '@/core/friends';
import { profileHref } from '@/core/social';
import type { RidingGroup } from '@/lib/groups';
import { t } from '@/lib/i18n';

const OUT_RING = '#57E3C3';

/**
 * Social's crew row (3.0): one card for your Riding Groups (their photos stacked, their names, a
 * chevron to the list). With no groups yet it invites you to start one.
 */
export function GroupsCard({ groups }: { groups: RidingGroup[] | null }) {
  const names = groups?.map((g) => g.name).join(', ') ?? '';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={names ? `${t('Riding Groups')}: ${names}` : t('Riding Groups')}
      onPress={() => router.push('/groups')}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}>
      {groups?.length ? (
        <View style={styles.stack}>
          {groups.slice(0, 3).map((g, i) => (
            <View key={g.id} style={[styles.stackItem, i > 0 && { marginLeft: -10 }]}>
              <GroupPhoto uri={g.photoUrl} name={g.name} size={34} radius={17} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.iconDisc}><Icon name="people" size={18} color={Colors.text} /></View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{t('Riding Groups')}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {groups == null ? ' ' : names || t('Start a group for the riders you ride with.')}
        </Text>
      </View>
      <Icon name="chevron" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

/**
 * Your friends as a strip of faces, the ones out riding first with a green ring, and Add at the
 * end (to Friends, where requests and codes live). Scrolls sideways when there are many.
 */
export function FriendStrip({ list }: { list: Friend[] }) {
  const { friends, received } = splitFriends(list);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {friends.slice(0, 20).map((f) => (
        <Pressable
          key={f.user_id}
          accessibilityRole="link"
          accessibilityLabel={f.out_now ? t('{name}, out riding now', { name: f.display_name }) : f.display_name}
          onPress={() => router.push(profileHref(f.user_id) as never)}
          style={({ pressed }) => [styles.face, pressed && { opacity: 0.8 }]}>
          <View style={[styles.ring, f.out_now && { borderColor: OUT_RING }]}>
            <RiderPhoto userId={f.user_id} size={54} zoom={false} fallback={<Initial name={f.display_name} size={54} color={faceColor(f.user_id)} />} />
          </View>
          <Text style={styles.faceName} numberOfLines={1}>{(f.display_name || 'Rider').split(' ')[0]}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="link" accessibilityLabel={t('Add and Manage Friends')} onPress={() => router.push('/friends')} style={({ pressed }) => [styles.face, pressed && { opacity: 0.8 }]}>
        <View style={[styles.ring, styles.add]}>
          <Icon name="addFriend" size={22} color={Colors.text} />
          {received.length ? <View style={styles.badge}><Text style={styles.badgeText}>{received.length}</Text></View> : null}
        </View>
        <Text style={styles.faceName}>{received.length ? t('Requests') : t('Add')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, ...TileSurface },
  stack: { flexDirection: 'row' },
  stackItem: { borderRadius: 19, borderWidth: 2, borderColor: Colors.backgroundElement, overflow: 'hidden' },
  iconDisc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  title: { color: Colors.text, fontFamily: font(700), fontSize: 16.5 },
  sub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13.5, marginTop: 2 },
  strip: { gap: 14, paddingVertical: 2 },
  face: { width: 64, alignItems: 'center', gap: 6 },
  ring: { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, borderColor: Colors.tileEdge, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  add: { backgroundColor: Colors.backgroundSelected },
  faceName: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 12.5 },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontFamily: font(700), fontSize: 11 },
}));
