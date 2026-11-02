import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RowGroup } from '@/components/ride-row';
import { SwipeRow } from '@/components/swipe-row';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { groupInbox, inboxLook, INBOX_NOT_SWITCHED_ON, moreText, whenText, type InboxItem, type InboxTone } from '@/core/inbox';
import { tapTarget } from '@/core/push-tap';
import { useLayout } from '@/hooks/use-layout';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { clearInbox, clearInboxItems, markInboxRead, useInbox } from '@/lib/inbox';
import { useSession } from '@/lib/session';

/** Each kind of notification keeps one color, so a glance down the list finds the rider alerts. */
const TONE: Record<InboxTone, string> = {
  alert: RideColors.red,
  status: RideColors.yellow,
  chat: Colors.sky,
  ride: '#57E3C3',
  social: RideColors.green,
  account: RideColors.sweep,
  quiet: RideColors.unknown,
};

const SWIPE = Platform.OS !== 'web';

/**
 * Notifications: everything OnMyLead sent this rider in the last 30 days (ride chat, rider
 * alerts, ride changes, invites, friend requests, badges), newest first under Today, Yesterday
 * and Earlier. Tap one to open it; swipe left to clear it (an X on the website); Clear All
 * empties the list and the phone's own notifications. A readable column on tablets and the web.
 */
export default function Inbox() {
  const { session } = useSession();
  const { items, unread, loaded, off, error } = useInbox();
  const layout = useLayout();
  const [busy, setBusy] = useState(false);

  if (!session) {
    return (
      <Screen width="readable">
        <Empty title="Sign In to See Notifications" detail="Ride messages, rider alerts, invites and friend requests show up here." />
        <Button title="Sign In" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  const open = (i: InboxItem) => {
    markInboxRead([i.id]);
    const target = tapTarget(i.data);
    if (target) router.push(target as never);
  };
  const clearOne = async (i: InboxItem): Promise<boolean> => {
    try {
      await clearInboxItems([i.id]);
      return true;
    } catch (e) {
      showNotice('Couldn’t Clear It', e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    }
  };
  const clearAll = async () => {
    if (!(await confirmAsync('Clear All Notifications?', 'They’re removed here and from this device’s notification list.', 'Clear All', 'Keep'))) return;
    setBusy(true);
    try {
      await clearInbox();
    } catch (e) {
      showNotice('Couldn’t Clear Notifications', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const sections = groupInbox(items);
  return (
    <Screen width="readable">
      {items.length ? (
        <View style={styles.bar}>
          <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
            {unread ? `${unread} New` : 'All Read'}
            {SWIPE ? '. Swipe Left to Clear' : ''}
          </ThemedText>
          {unread ? <Chip label="Mark All Read" onPress={() => markInboxRead()} /> : null}
          <Chip label="Clear All" onPress={clearAll} disabled={busy} />
        </View>
      ) : null}

      {off ? <Empty title="Almost Ready" detail={INBOX_NOT_SWITCHED_ON} /> : null}
      {!off && loaded && !items.length ? (
        <Empty
          title="You’re All Caught Up"
          detail={
            Platform.OS === 'web'
              ? 'Notifications OnMyLead sends to your phone app show up here too, for 30 days.'
              : 'Ride messages, rider alerts, ride changes, invites and friend requests show up here for 30 days.'
          }
        />
      ) : null}
      <ErrorText error={error} />

      {sections.map((s) => (
        <View key={s.title} style={{ gap: Spacing.two }}>
          <ThemedText style={styles.section}>{s.title}</ThemedText>
          <RowGroup>
            {s.items.map((i) =>
              SWIPE ? (
                <SwipeRow key={i.id} action="clear" onAction={() => clearOne(i)}>
                  <Row item={i} onPress={() => open(i)} />
                </SwipeRow>
              ) : (
                <Row key={i.id} item={i} onPress={() => open(i)} onClear={() => clearOne(i)} />
              ),
            )}
          </RowGroup>
        </View>
      ))}

      <Pressable accessibilityRole="button" onPress={() => router.push('/notifications')} style={[styles.settings, layout.wide && { alignSelf: 'flex-start' }]}>
        <Icon name="bell" size={20} color={Colors.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">Notification Settings</ThemedText>
        <Icon name="chevron" size={18} color={Colors.textSecondary} />
      </Pressable>
    </Screen>
  );
}

function Row({ item, onPress, onClear }: { item: InboxItem; onPress: () => void; onClear?: () => void }) {
  const look = inboxLook(item);
  const color = TONE[look.tone];
  const unread = !item.read_at;
  const more = moreText(item.count);
  const when = whenText(item.created_at);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'New. ' : ''}${item.title}. ${item.body}${more ? `. ${more}` : ''}. ${when}`}
      accessibilityActions={onClear ? [{ name: 'clear', label: 'Clear' }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'clear' && onClear?.()}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.row, (pressed || hovered) && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={[styles.tile, { backgroundColor: `${color}26`, borderColor: unread ? color : 'transparent' }]}>
        <Icon name={look.icon} size={22} color={color} strokeWidth={2.3} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={styles.titleLine}>
          <ThemedText numberOfLines={2} style={[styles.title, !unread && { color: Colors.textSecondary, fontFamily: font(600) }]}>
            {item.title}
          </ThemedText>
          <ThemedText type="small" style={[styles.when, unread && { color }]}>{when}</ThemedText>
        </View>
        {item.body ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{item.body}</ThemedText>
        ) : null}
        {more ? <ThemedText type="small" style={{ color, fontFamily: font(700) }}>{more}</ThemedText> : null}
      </View>
      {unread ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      {onClear ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${item.title}`} hitSlop={8} onPress={onClear} style={styles.clear}>
          <Icon name="close" size={16} color={Colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function Chip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.chip, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}>
      <ThemedText style={styles.chipText}>{label}</ThemedText>
    </Pressable>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyBell}>
        <Icon name="bell" size={34} color={Colors.sky} strokeWidth={2.2} />
      </View>
      <ThemedText type="subtitle" style={{ textAlign: 'center' }}>{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 420 }}>{detail}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.backgroundSelected, justifyContent: 'center' },
  chipText: { fontSize: 15, lineHeight: 18, fontFamily: font(700) },
  section: { fontSize: 13, lineHeight: 16, color: Colors.textSecondary, fontFamily: font(700), marginTop: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 14, minHeight: 72 },
  tile: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 16, lineHeight: 21, fontFamily: font(800) },
  when: { color: Colors.textSecondary, fontFamily: font(600) },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, paddingHorizontal: Spacing.three },
  emptyBell: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,134,247,0.14)', marginBottom: Spacing.one },
  settings: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', minHeight: 44, paddingHorizontal: Spacing.two, marginTop: Spacing.three, borderRadius: Radius.card },
});
