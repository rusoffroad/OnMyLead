import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BadgePatch } from '@/components/badge-patch';
import { BottomSheet } from '@/components/bottom-sheet';
import { Icon, type IconName } from '@/components/icon';
import { PhotoViewer } from '@/components/photo-viewer';
import { ReportSheet } from '@/components/report-sheet';
import { RiderPhoto } from '@/components/rider-photo';
import { Colors, font, themedStyles } from '@/constants/theme';
import { feedHref, feedStat, timeAgo } from '@/core/feed';
import { canShareOut, commentsLabel, itemHref, profileHref, socialLine, toggleLike, type SocialItem } from '@/core/social';
import { confirmAsync } from '@/lib/confirm';
import { requirePro } from '@/lib/pro';
import { deletePost, ProNeededError, setLike } from '@/lib/social';
import { faceColor, Initial } from '../home/parts';
import { ProTag, Social } from './parts';
import { ShareSheet } from './share-sheet';

import { t } from '@/lib/i18n';
const OPEN_LABEL: Partial<Record<SocialItem['kind'], string>> = { trail: 'Open Trail', group: 'Open Ride', out: 'See Who’s Out' };

/**
 * One Feed item in the Social area: who, what, a post's words and photo, the latest comments, and
 * Like, Comment and Share. Tapping the card opens it on its own page with every comment; tapping a
 * name opens that rider's profile; tapping a picture shows it full size.
 *
 * `full`: on the item's own page (no "open" tap, all text, no comment preview).
 */
export function SocialCard({
  item, onChange, onDeleted, full = false,
}: { item: SocialItem; onChange: (next: SocialItem) => void; onDeleted?: () => void; full?: boolean }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  // The photo's own shape, kept between 4:5 portrait and 16:9 wide, so a tall photo isn't cropped to 4:3.
  const [photoAspect, setPhotoAspect] = useState(4 / 3);
  const [sharing, setSharing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = feedHref(item);
  const stat = feedStat(item);
  const open = item.key && !full ? () => router.push(itemHref(item.key!) as never) : undefined;

  const like = async () => {
    if (!item.key) return;
    const next = toggleLike(item);
    onChange(next);
    setError(null);
    try {
      const n = await setLike(item.key, next.liked);
      onChange({ ...next, likeCount: n });
    } catch (e) {
      onChange(item);
      if (!(e instanceof ProNeededError)) setError(e instanceof Error ? e.message : t('Couldn’t like that. Try again.'));
    }
  };

  const share = () => {
    if (!requirePro('social_posts')) return;
    setSharing(true);
  };

  const remove = async () => {
    setMenu(false);
    if (item.kind !== 'post' || !item.key) return;
    const ok = await confirmAsync(t('Delete This Post?'), t('It comes off your profile and your friends’ feeds, with its likes and comments.'), t('Delete'));
    if (!ok) return;
    try {
      await deletePost(item.key.slice('post:'.length));
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Couldn’t delete it. Try again.'));
    }
  };

  const body = (
    <View style={{ gap: 10 }}>
      {item.kind !== 'post' ? (
        <Text style={styles.line}>
          {socialLine(item)}
          {stat ? <Text style={styles.stat}>{`  ${stat}`}</Text> : null}
        </Text>
      ) : null}
      {item.body ? <Text style={styles.post} numberOfLines={full ? undefined : 8}>{item.body}</Text> : null}
      {item.badge ? (
        <View style={styles.badgeRow}>
          <BadgePatch badge={item.badge.badge} level={item.badge.level} size={full ? 72 : 52} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <RiderPhoto userId={item.actorId} name={item.actorName} size={44} fallback={<Initial name={item.actorName} size={44} color={faceColor(item.actorId)} />} />
        <Pressable
          style={{ flex: 1, gap: 2 }}
          onPress={() => router.push(profileHref(item.actorId) as never)}
          accessibilityRole="link"
          accessibilityLabel={`${item.actorName}’s profile`}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.mine ? t('You') : item.actorName}</Text>
            {item.actorPro ? <ProTag /> : null}
          </View>
          <Text style={styles.when}>
            {item.kind === 'out' ? t('Riding now') : timeAgo(item.at)}
            {item.kind === 'post' ? t('  ·  Post') : ''}
          </Text>
        </Pressable>
        <Pressable onPress={() => setMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('More')} style={styles.more}>
          <Icon name="more" size={22} color={Social.muted} strokeWidth={3} />
        </Pressable>
      </View>

      {open ? (
        <Pressable onPress={open} accessibilityRole="link" accessibilityHint={t('Opens it with all the comments')} style={({ pressed }) => pressed && { opacity: 0.85 }}>
          {body}
        </Pressable>
      ) : body}

      {item.photoUrl ? (
        <Pressable onPress={() => setPhotoOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={t('See the photo full size')}>
          <Image
            source={{ uri: item.photoUrl }}
            contentFit="cover"
            transition={120}
            onLoad={(e) => {
              const { width: w, height: h } = e.source;
              if (w > 0 && h > 0) setPhotoAspect(Math.min(Math.max(w / h, 4 / 5), 16 / 9));
            }}
            style={[styles.photo, { aspectRatio: photoAspect }]}
            accessibilityIgnoresInvertColors
          />
        </Pressable>
      ) : null}

      {href ? (
        <Pressable onPress={() => router.push(href as never)} style={styles.openLink} accessibilityRole="link">
          <Text style={styles.openText}>{OPEN_LABEL[item.kind] ?? 'Open'}</Text>
          <Icon name="chevron" size={16} color={Colors.sky} />
        </Pressable>
      ) : null}

      {!full && item.comments.length ? (
        <Pressable onPress={open} style={styles.previews} accessibilityRole="link" accessibilityLabel={t('{v}. Open to read them all.', { v: commentsLabel(item.commentCount) })}>
          {item.commentCount > item.comments.length ? (
            <Text style={styles.viewAll}>{t('View All {commentCount} Comments', { commentCount: item.commentCount })}</Text>
          ) : null}
          {item.comments.map((c) => (
            <Text key={c.id} style={styles.preview} numberOfLines={2}>
              <Text style={{ fontFamily: font(700), color: Colors.text }}>{c.authorName}  </Text>
              {c.body}
            </Text>
          ))}
        </Pressable>
      ) : null}

      {item.key ? (
        <View style={styles.actions}>
          <Action
            icon="heart"
            label={item.likeCount ? String(item.likeCount) : t('Like')}
            on={item.liked}
            onPress={like}
            a11y={item.liked ? `Unlike. ${item.likeCount} likes` : `Like. ${item.likeCount} likes`}
          />
          <Action
            icon="chat"
            label={item.commentCount ? String(item.commentCount) : t('Comment')}
            onPress={() => router.push(`${itemHref(item.key!)}&comment=1` as never)}
            a11y={commentsLabel(item.commentCount)}
          />
          {canShareOut(item) ? <Action icon="share" label={t('Share')} onPress={share} a11y="Share to Facebook, Instagram, X and more" /> : <View style={{ flex: 1 }} />}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PhotoViewer uri={photoOpen ? item.photoUrl : null} square={false} caption={item.body} onClose={() => setPhotoOpen(false)} />
      <ShareSheet item={sharing ? item : null} onClose={() => setSharing(false)} />
      <BottomSheet visible={menu} onClose={() => setMenu(false)} title={item.mine ? t('Your Post') : item.actorName}>
        <View style={{ gap: 4 }}>
          <MenuItem icon="person" label={item.mine ? t('View Your Profile') : t('View {actorName}’s Profile', { actorName: item.actorName })} onPress={() => { setMenu(false); router.push(profileHref(item.actorId) as never); }} />
          {canShareOut(item) ? <MenuItem icon="share" label={t('Share to Other Apps')} onPress={() => { setMenu(false); share(); }} /> : null}
          {item.mine && item.kind === 'post' ? <MenuItem icon="trash" label={t('Delete Post')} danger onPress={remove} /> : null}
          {!item.mine ? (
            <MenuItem icon="flagged" label={item.kind === 'post' ? t('Report This Post') : t('Report {actorName}', { actorName: item.actorName })} danger onPress={() => { setMenu(false); setReport(true); }} />
          ) : null}
        </View>
      </BottomSheet>
      <ReportSheet
        target={report ? {
          kind: 'rider', userId: item.actorId, name: item.actorName,
          source: item.kind === 'post' ? 'post' : 'profile',
          postId: item.kind === 'post' && item.key ? item.key.slice('post:'.length) : undefined,
        } : null}
        onClose={() => setReport(false)}
      />
    </View>
  );
}

function Action({ icon, label, on, onPress, a11y }: { icon: IconName; label: string; on?: boolean; onPress: () => void; a11y: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={on != null ? { selected: on } : undefined}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: Social.panel2 }]}>
      <Icon name={icon} size={21} color={on ? Social.heart : Social.muted} fill={on ? Social.heart : undefined} />
      <Text style={[styles.actionText, on && { color: Social.heart }]}>{label}</Text>
    </Pressable>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: Social.panel2 }]}>
      <Icon name={icon} size={20} color={danger ? Colors.danger : Colors.text} />
      <Text style={[styles.menuText, danger && { color: Colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: Social.panel, borderRadius: 22, borderWidth: 1, borderColor: Social.line, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 16, flexShrink: 1 },
  when: { color: Social.muted, fontFamily: font(500), fontSize: 12 },
  more: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  line: { color: Colors.text, fontFamily: font(500), fontSize: 16, lineHeight: 22 },
  stat: { color: Social.gold, fontFamily: font(700), fontSize: 14 },
  post: { color: Colors.text, fontFamily: font(500), fontSize: 17, lineHeight: 24 },
  badgeRow: { alignItems: 'flex-start' },
  photo: { width: '100%', aspectRatio: 4 / 3, maxHeight: 520, borderRadius: 14, backgroundColor: Social.panel2 },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  openText: { color: Colors.sky, fontFamily: font(600), fontSize: 14 },
  previews: { gap: 4, paddingTop: 2 },
  viewAll: { color: Social.muted, fontFamily: font(600), fontSize: 13 },
  preview: { color: Colors.textSoft, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Social.line, marginHorizontal: -8, paddingTop: 6, marginBottom: -6 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, borderRadius: 12 },
  actionText: { color: Social.muted, fontFamily: font(600), fontSize: 14 },
  error: { color: Colors.danger, fontFamily: font(600), fontSize: 13 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 8, borderRadius: 12 },
  menuText: { color: Colors.text, fontFamily: font(600), fontSize: 16 },
}));
