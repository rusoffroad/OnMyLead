import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import type { GroupChatSummary } from '@/core/group-chat';
import { timeAgo } from '@/core/feed';
import type { RidingGroup } from '@/lib/groups';
import { requirePro } from '@/lib/pro';
import { Gradient, Home, homeStyles, HomeCard } from './parts';
import { t } from '@/lib/i18n';

/**
 * Your Group: the riding group you're most active in, with how many riders are in it, how many
 * are out riding now, the newest group chat message, and the two things you'd do next.
 */
export function GroupCard({
  group, chat, outNow, uid,
}: { group: RidingGroup; chat: GroupChatSummary | null; outNow: number; uid: string | undefined }) {
  const riders = group.riders.length;
  const sender = chat?.last_user_id ? (chat.last_user_id === uid ? t('You') : group.riders.find((r) => r.id === chat.last_user_id)?.name ?? t('Rider')) : null;
  return (
    <HomeCard style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${group.name}, ${riders === 1 ? t('1 rider') : t('{n} riders', { n: riders })}`} onPress={() => router.push(`/groups/${group.id}`)} style={styles.head}>
        <View style={styles.mark}>
          <Gradient colors={['#3B86F7', '#1C4F9C']} angle="diagonal" radius={14} />
          <Text style={styles.markText}>{initials(group.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={homeStyles.cardTitle} numberOfLines={1}>{group.name}</Text>
          <View style={styles.meta}>
            <Text style={homeStyles.muted}>{riders === 1 ? t('1 rider') : t('{n} riders', { n: riders })}</Text>
            {outNow > 0 ? (
              <View style={styles.out}>
                <View style={styles.outDot} />
                <Text style={[homeStyles.muted, { color: Home.mint }]}>{t('{n} out riding', { n: outNow })}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Icon name="chevron" color={Home.muted} />
      </Pressable>
      {chat?.last_body ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('Latest group chat message from {name}: {message}', { name: sender ?? '', message: chat.last_body })} onPress={() => router.push(`/groups/${group.id}/chat`)} style={styles.bubble}>
          <Text style={styles.bubbleText} numberOfLines={2}>
            <Text style={{ color: Colors.sky, fontFamily: font(700) }}>{sender} </Text>
            {chat.last_body}
          </Text>
          {chat.last_at ? <Text style={[homeStyles.muted, { fontSize: 12 }]}>{timeAgo(chat.last_at)}{chat.unread ? `, ${t('{n} new', { n: chat.unread })}` : ''}</Text> : null}
        </Pressable>
      ) : null}
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/groups/${group.id}/chat`)} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
          <Icon name="chat" size={18} color={Colors.text} />
          <Text style={styles.btnText}>{t('Group Chat')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => requirePro('create_ride') && router.push(`/ride/new?group=${group.id}`)}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
          <Icon name="calendar" size={18} color={Colors.text} />
          <Text style={styles.btnText} numberOfLines={1}>{t('Plan a Group Ride')}</Text>
        </Pressable>
      </View>
    </HomeCard>
  );
}

/** Before a rider has a group: one quiet line that leads to Riding Groups. */
export function NoGroupCard() {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/groups')} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <HomeCard style={[styles.card, styles.empty]}>
        <Icon name="people" size={26} color={Colors.sky} />
        <View style={{ flex: 1 }}>
          <Text style={homeStyles.cardTitle}>{t('Ride With the Same Crew?')}</Text>
          <Text style={homeStyles.muted}>{t('Make a riding group: one tap invites everyone, and you get a group chat.')}</Text>
        </View>
        <Icon name="chevron" color={Home.muted} />
      </HomeCard>
    </Pressable>
  );
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'G';

const styles = themedStyles(() => ({
  card: { padding: 16, gap: 14 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  markText: { color: '#fff', fontFamily: font(800, 'display'), fontSize: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: 2 },
  out: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  outDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Home.mint },
  bubble: { backgroundColor: Home.panel2, borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  bubbleText: { color: Colors.text, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: Home.line, backgroundColor: Home.panel2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: Spacing.two,
  },
  btnText: { color: Colors.text, fontFamily: font(700), fontSize: 14, flexShrink: 1 },
}));
