import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, font, Glass, Radius, Spacing, themedStyles } from '@/constants/theme';
import { QUICK_REPLIES, type QuickReply } from '@/core/chat';
import type { RiderStatusKind } from '@/lib/types';
import { Icon, type IconName } from './icon';
import { SheetRoot, SwipeSheet } from './swipe-sheet';

/** A light tap you can feel, so a rider wearing gloves knows a button took. */
export function tapFeel() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

/** The three quick replies kept on the panel; the rest are one tap away under More. */
export const PANEL_REPLIES: QuickReply[] = ['On My Way', 'Need a Minute', 'All Good'];

const REPLY_ICON: Record<QuickReply, IconName> = {
  'On My Way': 'go',
  'Running Late': 'clock',
  'Need a Minute': 'clock',
  'All Good': 'check',
};

/** Statuses in the More sheet, grouped so the trouble ones are easy to find. */
export const MOVE_STATUSES: RiderStatusKind[] = ['ok', 'stopped'];
export const TROUBLE_STATUSES: RiderStatusKind[] = ['need_fuel', 'mechanical', 'flat_tire', 'stuck', 'lost', 'need_help'];

/** A square button in a glass panel: an icon over a short label. `on` outlines the last one sent. */
export function QuickTile({
  icon, label, onPress, on, tone, a11y, style,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  on?: boolean;
  /** amber: Mechanical Issue; red: Need Help. */
  tone?: 'amber' | 'red';
  a11y: string;
  style?: StyleProp<ViewStyle>;
}) {
  const ink = tone === 'amber' ? Glass.amber : tone === 'red' ? Glass.softRed : Colors.text;
  return (
    <Pressable
      onPress={() => {
        tapFeel();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={on ? { selected: true } : undefined}
      style={({ pressed }) => [
        styles.tile,
        tone === 'amber' && { borderColor: 'rgba(242,178,51,0.5)' },
        tone === 'red' && { borderColor: Glass.redEdge },
        on && styles.tileOn,
        pressed && styles.pressed,
        style,
      ]}>
      {icon ? <Icon name={icon} size={20} color={ink} strokeWidth={icon === 'more' ? 3.4 : 2.3} /> : null}
      <Text style={[styles.tileText, { color: ink }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

/** Regroup Here (white, for leaders) and Emergency (red outline) side by side. */
export function PanelActions({ onRegroup, onEmergency }: { onRegroup?: () => void; onEmergency: () => void }) {
  return (
    <View style={styles.actions}>
      {onRegroup ? (
        <Pressable
          onPress={() => {
            tapFeel();
            onRegroup();
          }}
          accessibilityRole="button"
          accessibilityLabel="Regroup at my location"
          style={({ pressed }) => [styles.big, styles.regroup, pressed && styles.pressed]}>
          <Icon name="regroup" size={18} color={Colors.background} strokeWidth={2.4} />
          <Text style={[styles.bigText, { color: Colors.background }]}>Regroup Here</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          tapFeel();
          onEmergency();
        }}
        accessibilityRole="button"
        accessibilityLabel="Send status EMERGENCY"
        accessibilityHint="Opens the emergency alert. You hold a button there to send it"
        style={({ pressed }) => [styles.big, styles.sos, pressed && styles.pressed]}>
        <Text style={[styles.bigText, { color: Glass.softRed }]}>EMERGENCY</Text>
      </Pressable>
    </View>
  );
}

/**
 * Every status and quick reply, from More on the Ride Mode panel: On the Move and Trouble, then
 * Regroup and Emergency. Sending one closes the sheet so the Sending card shows at once.
 */
export function StatusSheet({
  visible, tablet, labels, myStatus, lastReply, onReply, onStatus, onRegroup, onEmergency, onClose,
}: {
  visible: boolean;
  tablet: boolean;
  labels: Record<RiderStatusKind, string>;
  myStatus?: RiderStatusKind;
  lastReply: string | null;
  onReply: (q: QuickReply) => void;
  onStatus: (k: RiderStatusKind) => void;
  onRegroup?: () => void;
  onEmergency: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pick = (f: () => void) => () => {
    onClose();
    f();
  };
  const tone = (k: RiderStatusKind) => (k === 'mechanical' ? 'amber' : k === 'need_help' ? 'red' : undefined);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SheetRoot style={[styles.wrap, tablet && styles.wrapTablet]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <SwipeSheet
          onClose={onClose}
          style={[styles.sheet, tablet ? styles.sheetTablet : { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}
          accessibilityViewIsModal>
          <View style={styles.grab} />
          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">Tell the Group</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            <Section label="On the Move">
              {QUICK_REPLIES.map((q) => (
                <QuickTile
                  key={q}
                  label={q}
                  on={lastReply === q}
                  onPress={pick(() => onReply(q))}
                  a11y={`Send to the group: ${q}`}
                  style={styles.third}
                />
              ))}
              {MOVE_STATUSES.map((k) => (
                <QuickTile key={k} label={labels[k]} on={myStatus === k} onPress={pick(() => onStatus(k))} a11y={`Send status ${labels[k]}`} style={styles.third} />
              ))}
            </Section>
            <Section label="Trouble">
              {TROUBLE_STATUSES.map((k) => (
                <QuickTile
                  key={k}
                  label={labels[k]}
                  tone={tone(k)}
                  on={myStatus === k}
                  onPress={pick(() => onStatus(k))}
                  a11y={`Send status ${labels[k]}`}
                  style={styles.third}
                />
              ))}
            </Section>
            <PanelActions onRegroup={onRegroup ? pick(onRegroup) : undefined} onEmergency={pick(onEmergency)} />
          </ScrollView>
        </SwipeSheet>
      </SheetRoot>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.section}>{label}</Text>
      <View style={styles.grid}>{children}</View>
    </View>
  );
}

/** The panel's quick row: three replies and More. */
export function QuickRow({ lastReply, onReply, onMore }: { lastReply: string | null; onReply: (q: QuickReply) => void; onMore: () => void }) {
  return (
    <View style={styles.row}>
      {PANEL_REPLIES.map((q) => (
        <QuickTile key={q} icon={REPLY_ICON[q]} label={q} on={lastReply === q} onPress={() => onReply(q)} a11y={`Send to the group: ${q}`} style={styles.quarter} />
      ))}
      <QuickTile
        icon="more"
        label="More"
        onPress={onMore}
        a11y="More statuses"
        style={styles.quarter}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quarter: { flex: 1 },
  third: { flexBasis: '30%', flexGrow: 1, minHeight: 52 },
  tile: {
    minHeight: 60, borderRadius: Radius.control, paddingHorizontal: 4, paddingVertical: 8, gap: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge,
  },
  tileOn: { borderColor: Colors.text, borderWidth: 2 },
  tileText: { fontFamily: font(700), fontSize: 13, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  actions: { flexDirection: 'row', gap: 8 },
  big: { flex: 1, minHeight: 52, borderRadius: Radius.control + 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  regroup: { backgroundColor: Colors.text },
  sos: { backgroundColor: Glass.redTint, borderWidth: 1.5, borderColor: 'rgba(229,38,46,0.75)' },
  bigText: { fontFamily: font(700, 'display'), fontSize: 20 },
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  wrapTablet: { justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  sheet: {
    flexShrink: 1, maxHeight: '88%', backgroundColor: Colors.backgroundElement, paddingHorizontal: Spacing.three, paddingTop: 10, gap: 12,
    borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: Glass.edge,
  },
  sheetTablet: { width: '100%', maxWidth: 520, borderRadius: 28, paddingBottom: Spacing.three },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 24 },
  done: { color: Colors.sky, fontFamily: font(700), fontSize: 16 },
  section: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
}));
