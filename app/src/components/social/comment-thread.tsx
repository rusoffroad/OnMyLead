import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RiderPhoto } from '@/components/rider-photo';
import { Colors, font, themedStyles } from '@/constants/theme';
import { timeAgo } from '@/core/feed';
import { profileHref, type CommentThread, type ThreadComment } from '@/core/social';
import { faceColor, Initial } from '../home/parts';
import { Social } from './parts';

import { t } from '@/lib/i18n';

type Actions = {
  /** Comment likes and replies are on the server (false: plain comments, no Like or Reply). */
  replies: boolean;
  onLike: (c: ThreadComment) => void;
  onReply: (c: ThreadComment) => void;
  onDelete: (c: ThreadComment) => void;
  onReport: (c: ThreadComment) => void;
  /** The comment being replied to, so it's marked while the rider types. */
  replyingTo?: string | null;
};

/**
 * One top comment and its replies. Replies hang off a thin line under the comment, a step in and a
 * size down, so a long back-and-forth still reads as one conversation. Every comment has Like
 * (free) and Reply (Pro, like commenting); the writer, and the rider whose item it's on, can delete.
 */
export function CommentThreadView({ thread, ...actions }: { thread: CommentThread } & Actions) {
  return (
    <View>
      <CommentRow c={thread.comment} {...actions} />
      {thread.replies.length ? (
        <View style={styles.replies}>
          {thread.replies.map((r) => <CommentRow key={r.id} c={r} reply {...actions} />)}
        </View>
      ) : null}
    </View>
  );
}

function CommentRow({ c, reply = false, replies, onLike, onReply, onDelete, onReport, replyingTo }: { c: ThreadComment; reply?: boolean } & Actions) {
  const size = reply ? 28 : 34;
  const marked = replyingTo === c.id;
  return (
    <View style={[styles.comment, reply && { marginTop: 10 }]}>
      <RiderPhoto userId={c.authorId} name={c.authorName} size={size} fallback={<Initial name={c.authorName} size={size} color={faceColor(c.authorId)} />} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[styles.bubble, marked && styles.marked]}>
          <View style={styles.head}>
            <Pressable onPress={() => router.push(profileHref(c.authorId) as never)} accessibilityRole="link" style={{ flexShrink: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{c.mine ? t('You') : c.authorName}</Text>
            </Pressable>
            <Text style={styles.when}>{timeAgo(c.at)}</Text>
          </View>
          <Text style={styles.body} selectable>
            {c.replyToName ? <Text style={styles.to}>{`@${c.replyToName} `}</Text> : null}
            {t(c.body)}
          </Text>
        </View>
        <View style={styles.actions}>
          {replies ? (
            <Pressable
              onPress={() => onLike(c)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={c.liked ? t('Unlike comment') : t('Like comment')}
              accessibilityState={{ selected: c.liked }}
              style={styles.like}>
              <Icon name="heart" size={15} color={c.liked ? Social.heart : Social.muted} fill={c.liked ? Social.heart : undefined} />
              <Text style={[styles.action, c.liked && { color: Social.heart }]}>{c.likeCount ? c.likeCount.toLocaleString() : t('Like')}</Text>
            </Pressable>
          ) : null}
          {replies ? (
            <Pressable onPress={() => onReply(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Reply to {authorName}', { authorName: c.mine ? t('yourself') : c.authorName })}>
              <Text style={[styles.action, marked && { color: Colors.sky }]}>{t('Reply')}</Text>
            </Pressable>
          ) : null}
          {c.canDelete ? (
            <Pressable onPress={() => onDelete(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Delete comment')}>
              <Text style={styles.action}>{t('Delete')}</Text>
            </Pressable>
          ) : null}
          {!c.mine ? (
            <Pressable onPress={() => onReport(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Report {authorName}’s comment', { authorName: c.authorName })}>
              <Text style={styles.action}>{t('Report')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  replies: { marginLeft: 16, paddingLeft: 26, borderLeftWidth: 2, borderLeftColor: Social.line, marginTop: 4 },
  bubble: { backgroundColor: Social.panel, borderRadius: 16, borderTopLeftRadius: 4, borderWidth: 1, borderColor: Social.line, padding: 12, gap: 4 },
  marked: { borderColor: Colors.sky },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 14 },
  when: { color: Social.muted, fontFamily: font(500), fontSize: 12 },
  body: { color: Colors.text, fontFamily: font(500), fontSize: 15, lineHeight: 21 },
  to: { color: Colors.sky, fontFamily: font(700) },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingLeft: 12, minHeight: 20 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  action: { color: Social.muted, fontFamily: font(700), fontSize: 13 },
}));
