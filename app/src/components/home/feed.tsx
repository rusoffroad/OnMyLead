import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { BadgePatch } from '@/components/badge-patch';
import { BottomSheet } from '@/components/bottom-sheet';
import { Icon } from '@/components/icon';
import { RiderPhoto } from '@/components/rider-photo';
import { Button, ErrorText } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import {
  feedHref, feedLine, feedStat, KIND_CHOICES, SHARE_WITH_CHOICES, SHOW_FROM_CHOICES, timeAgo, toggleKind,
  type FeedItem, type FeedSettings,
} from '@/core/feed';
import { faceColor, Home, homeStyles, HomeCard, Initial } from './parts';

/** The Feed: a few recent posts from friends, follows and groups. Out riding first. */
export function FeedList({ items, emptyText }: { items: FeedItem[]; emptyText: string }) {
  if (!items.length) {
    return (
      <HomeCard style={styles.empty}>
        <Icon name="people" size={24} color={Home.muted} />
        <Text style={[homeStyles.muted, { flex: 1 }]}>{emptyText}</Text>
      </HomeCard>
    );
  }
  return (
    <HomeCard>
      {items.map((item, i) => {
        const href = feedHref(item);
        const stat = feedStat(item);
        const body = (
          <View style={styles.item}>
            <View>
              <RiderPhoto userId={item.actorId} size={42} fallback={<Initial name={item.actorName} size={42} color={faceColor(item.actorId)} />} />
              {item.kind === 'out' ? <View style={styles.live} /> : null}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.line}>
                <Text style={{ fontFamily: font(700) }}>{item.actorName} </Text>
                {feedLine(item)}
              </Text>
              <Text style={[homeStyles.muted, { fontSize: 12 }]}>
                {item.kind === 'out' ? 'Riding now' : timeAgo(item.at)}
                {stat ? `  ·  ${stat}` : ''}
              </Text>
            </View>
            {item.badge ? <BadgePatch badge={item.badge.badge} level={item.badge.level} size={34} /> : null}
            {href ? <Icon name="chevron" size={18} color={Home.muted} /> : null}
          </View>
        );
        return (
          <Fragment key={`${item.kind}${item.actorId}${item.at}${i}`}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {href ? (
              <Pressable accessibilityRole="link" onPress={() => router.push(href as never)} style={({ pressed }) => pressed && { backgroundColor: Home.panel2 }}>
                {body}
              </Pressable>
            ) : body}
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
      setError(e instanceof Error ? e.message : 'Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Customize Feed" footer={<Button title="Save" loading={saving} onPress={save} />}>
      <Group title="Show Posts From">
        {SHOW_FROM_CHOICES.map((c) => (
          <Radio key={c.value} label={c.label} detail={c.detail} on={draft.showFrom === c.value} onPress={() => setDraft({ ...draft, showFrom: c.value })} />
        ))}
      </Group>
      <Group title="What Shows">
        {KIND_CHOICES.map((c) => (
          <View key={c.value} style={styles.toggle}>
            <Text style={[styles.optLabel, { flex: 1 }]}>{c.label}</Text>
            <Switch
              value={draft.kinds.includes(c.value)}
              onValueChange={() => setDraft({ ...draft, kinds: toggleKind(draft.kinds, c.value) })}
              accessibilityLabel={c.label}
              trackColor={{ true: Colors.accent, false: Home.panel2 }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </Group>
      <Group title="Who Sees Your Activity">
        {SHARE_WITH_CHOICES.map((c) => (
          <Radio key={c.value} label={c.label} detail={c.detail} on={draft.shareWith === c.value} onPress={() => setDraft({ ...draft, shareWith: c.value })} />
        ))}
        <Text style={[homeStyles.muted, { fontSize: 12 }]}>Your location is never in anyone’s feed. Out Riding posts follow your Out Riding setting.</Text>
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

const styles = StyleSheet.create({
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { height: 1, backgroundColor: Home.line },
  live: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: Home.mint, borderWidth: 2, borderColor: Home.panel },
  line: { color: Colors.text, fontFamily: font(500), fontSize: 15, lineHeight: 20 },
  groupTitle: { color: Home.muted, fontFamily: font(700), fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.control, borderWidth: 1, borderColor: Home.line, padding: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Home.muted, alignItems: 'center', justifyContent: 'center' },
  dotIn: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  optLabel: { color: Colors.text, fontFamily: font(600), fontSize: 15 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
});
