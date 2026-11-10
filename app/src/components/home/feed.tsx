import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { BadgePatch } from '@/components/badge-patch';
import { BottomSheet } from '@/components/bottom-sheet';
import { Icon } from '@/components/icon';
import { RiderPhoto } from '@/components/rider-photo';
import { Button, ErrorText } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import {
  feedHref, feedLine, feedStat, KIND_CHOICES, SHARE_WITH_CHOICES, SHOW_FROM_CHOICES, timeAgo, toggleKind, type FeedSettings,
} from '@/core/feed';
import { commentsLabel, itemHref, toggleLike, type SocialItem } from '@/core/social';
import { setLike } from '@/lib/social';
import { faceColor, Home, homeStyles, HomeCard, Initial } from './parts';

import { t } from '@/lib/i18n';
/** Opens an item inside Social: Social first, then the item on top, so Back lands in Social. */
export function openInSocial(key: string | null) {
  router.push('/social');
  if (key) router.push(itemHref(key) as never);
}

/**
 * The Feed: a few recent posts from friends, follows and groups, out riding first. Each one can be
 * liked right here (the heart), and tapping it opens it in Social with every comment.
 */
export function FeedList({ items, emptyText, onChange }: { items: SocialItem[]; emptyText: string; onChange?: (i: number, next: SocialItem) => void }) {
  if (!items.length) {
    return (
      <HomeCard style={styles.empty}>
        <Icon name="people" size={24} color={Home.muted} />
        {/* flex on the Text itself clipped it to one line on iPhone; the wrapper takes the width. */}
        <View style={{ flex: 1 }}>
          <Text style={homeStyles.muted}>{emptyText}</Text>
        </View>
      </HomeCard>
    );
  }
  return (
    <HomeCard>
      {items.map((item, i) => {
        const href = feedHref(item);
        const stat = feedStat(item);
        const like = async () => {
          if (!item.key || !onChange) return;
          const next = toggleLike(item);
          onChange(i, next);
          try {
            onChange(i, { ...next, likeCount: await setLike(item.key, next.liked) });
          } catch {
            onChange(i, item);
          }
        };
        const open = () => (item.key ? openInSocial(item.key) : href ? router.push(href as never) : router.push('/social'));
        return (
          <Fragment key={`${item.kind}${item.actorId}${item.at}${i}`}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.item}>
              <View>
                <RiderPhoto userId={item.actorId} name={item.actorName} size={42} fallback={<Initial name={item.actorName} size={42} color={faceColor(item.actorId)} />} />
                {item.kind === 'out' ? <View style={styles.live} /> : null}
              </View>
              <Pressable
                accessibilityRole="link"
                accessibilityHint={item.key ? t('Opens it in Social with the comments') : undefined}
                onPress={open}
                style={({ pressed }) => [{ flex: 1, gap: 3 }, pressed && { opacity: 0.7 }]}>
                <Text style={styles.line} numberOfLines={item.kind === 'post' ? 3 : undefined}>
                  <Text style={{ fontFamily: font(700) }}>{item.actorName} </Text>
                  {item.kind === 'post' ? item.body ?? t('posted a photo') : feedLine(item)}
                </Text>
                <Text style={[homeStyles.muted, { fontSize: 12 }]}>
                  {item.kind === 'out' ? t('Riding now') : timeAgo(item.at)}
                  {stat ? `  ·  ${stat}` : ''}
                  {item.commentCount ? `  ·  ${commentsLabel(item.commentCount)}` : ''}
                </Text>
              </Pressable>
              {item.photoUrl ? (
                <Pressable onPress={open} accessibilityRole="imagebutton" accessibilityLabel={t('{name}’s photo. Opens it in Social', { name: item.actorName })}>
                  <Image source={{ uri: item.photoUrl }} contentFit="cover" transition={120} style={styles.thumb} accessibilityIgnoresInvertColors />
                </Pressable>
              ) : null}
              {item.badge ? <BadgePatch badge={item.badge.badge} level={item.badge.level} size={34} /> : null}
              {item.key && onChange ? (
                <Pressable
                  onPress={like}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={item.liked ? t('Unlike') : t('Like')}
                  accessibilityState={{ selected: item.liked }}
                  style={styles.heart}>
                  <Icon name="heart" size={22} color={item.liked ? '#FF4D57' : Home.muted} fill={item.liked ? '#FF4D57' : undefined} />
                  {item.likeCount ? <Text style={[styles.heartCount, item.liked && { color: '#FF4D57' }]}>{item.likeCount}</Text> : null}
                </Pressable>
              ) : href ? <Icon name="chevron" size={18} color={Home.muted} /> : null}
            </View>
          </Fragment>
        );
      })}
    </HomeCard>
  );
}

/** Customize: whose posts you see, which kinds, and who sees your own. */
export function FeedSheet({
  visible, settings, onSave, onClose,
}: { visible: boolean; settings: FeedSettings; onSave: (s: FeedSettings) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [opened, setOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Start from the saved settings each time the sheet opens.
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setDraft(settings);
      setError(null);
    }
  }
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Couldn’t save. Try again.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('Customize Feed')} footer={<Button title={t('Save')} loading={saving} onPress={save} />}>
      <Group title={t('Show Posts From')}>
        {SHOW_FROM_CHOICES.map((c) => (
          <Radio key={c.value} label={t(c.label)} detail={t(c.detail)} on={draft.showFrom === c.value} onPress={() => setDraft({ ...draft, showFrom: c.value })} />
        ))}
      </Group>
      <Group title={t('What Shows')}>
        {KIND_CHOICES.map((c) => (
          <View key={c.value} style={styles.toggle}>
            <Text style={[styles.optLabel, { flex: 1 }]}>{t(c.label)}</Text>
            <Switch
              value={draft.kinds.includes(c.value)}
              onValueChange={() => setDraft({ ...draft, kinds: toggleKind(draft.kinds, c.value) })}
              accessibilityLabel={t(c.label)}
              trackColor={{ true: Colors.accent, false: Home.panel2 }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </Group>
      <Group title={t('Who Sees Your Activity')}>
        {SHARE_WITH_CHOICES.map((c) => (
          <Radio key={c.value} label={t(c.label)} detail={t(c.detail)} on={draft.shareWith === c.value} onPress={() => setDraft({ ...draft, shareWith: c.value })} />
        ))}
        <Text style={[homeStyles.muted, { fontSize: 12 }]}>{t('Your location is never in anyone’s feed. Out Riding posts follow your Out Riding setting.')}</Text>
      </Group>
      <ErrorText error={error} />
    </BottomSheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Radio({ label, detail, on, onPress }: { label: string; detail: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.radio, on && { borderColor: Colors.accent, backgroundColor: 'rgba(229,38,46,0.10)' }]}>
      <View style={[styles.dot, on && { borderColor: Colors.accent }]}>{on ? <View style={styles.dotIn} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optLabel}>{label}</Text>
        <Text style={[homeStyles.muted, { fontSize: 12 }]}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { height: 1, backgroundColor: Home.line },
  heart: { alignItems: 'center', minWidth: 32, gap: 1 },
  thumb: { width: 54, height: 54, borderRadius: 12, backgroundColor: Home.muted },
  heartCount: { color: Home.muted, fontFamily: font(700), fontSize: 11 },
  live: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: Home.mint, borderWidth: 2, borderColor: Home.panel },
  line: { color: Colors.text, fontFamily: font(500), fontSize: 15, lineHeight: 20 },
  groupTitle: { color: Home.muted, fontFamily: font(700), fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.control, borderWidth: 1, borderColor: Home.line, padding: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Home.muted, alignItems: 'center', justifyContent: 'center' },
  dotIn: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  optLabel: { color: Colors.text, fontFamily: font(600), fontSize: 15 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
}));
