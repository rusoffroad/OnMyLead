import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { Icon } from '@/components/icon';
import { KeyboardLift, keyboardScroll } from '@/components/keyboard';
import { ThemedText } from '@/components/themed-text';
import { Button, Choice, ErrorText, Field } from '@/components/ui';
import { Colors, font, Spacing } from '@/constants/theme';
import type { ReportSource } from '@/core/moderation';
import { REPORT_REASONS } from '@/core/pro';
import { confirmAndBlock, useBlocks } from '@/lib/blocks';
import { sendReport } from '@/lib/pro';

// source: where the report was sent from, so the Admin Dashboard can say (2.0).
type Target =
  | { kind: 'ride'; rideId: string; name: string; source?: ReportSource }
  // context: added to the report for the owner, such as the direct message being reported.
  // groupId: the riding group chat it was sent from, so that chat is saved with the report first.
  | { kind: 'rider'; userId: string; rideId?: string | null; name: string; context?: string; source?: ReportSource; groupId?: string | null }
  // An event goes to the team as a report of its owner (ownerId), with the event attached.
  | { kind: 'event'; eventId: string; ownerId: string; name: string };

/**
 * Report Ride / Report Rider: a reason, an optional note, and it goes to the OnMyLead owner,
 * who gets an email. For a rider, the messages between the two riders are saved with the report
 * on the server so the owner can read what was said (migration 20261102800000_abuse_reports.sql).
 * The person reported is never told who reported them. A rider can also be blocked from here,
 * instead of or after reporting them.
 */
export function ReportSheet({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocks = useBlocks();
  const rider = target?.kind === 'rider' ? target : null;
  const blocked = !!rider && blocks.ids.has(rider.userId);
  // Hidden until the server has blocking, and once they're blocked the sheet says so instead.
  const canBlock = !!rider && !blocks.off;

  const close = () => {
    setReason(null);
    setDetails('');
    setSent(false);
    setError(null);
    onClose();
  };

  async function send() {
    if (!target || !reason) return;
    setBusy(true);
    setError(null);
    try {
      await sendReport({
        kind: target.kind,
        rideId: target.kind === 'event' ? null : target.rideId ?? null,
        userId: target.kind === 'rider' ? target.userId : target.kind === 'event' ? target.ownerId : null,
        eventId: target.kind === 'event' ? target.eventId : null,
        groupId: target.kind === 'rider' ? target.groupId ?? null : null,
        source: target.kind === 'event' ? 'event' : target.source ?? null,
        reason,
        details: [details.trim(), target.kind === 'rider' ? target.context?.trim() : ''].filter(Boolean).join('\n\n'),
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send the report. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const reasons = target ? REPORT_REASONS[target.kind] : [];
  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <SheetRoot>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
      {target ? (
        <KeyboardLift>
        <SwipeSheet onClose={close} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
          <View style={styles.grip} />
          <SheetScroll {...keyboardScroll} style={{ flexShrink: 1 }} contentContainerStyle={{ gap: Spacing.three }}>
          {sent ? (
            <>
              <Text style={styles.title} accessibilityRole="header">Report Sent</Text>
              <ThemedText>
                Thanks. OnMyLead looks at every report. {target.kind === 'event' ? 'The host' : target.name} isn’t told who sent it. If anyone is in danger, call 911.
              </ThemedText>
              {canBlock ? (
                blocked ? (
                  <ThemedText type="small" themeColor="textSecondary">Blocked. You won’t see their messages.</ThemedText>
                ) : (
                  <Button title="Also Block This Rider" kind="secondary" onPress={() => confirmAndBlock(rider!.userId, rider!.name)} />
                )
              ) : null}
              <Button title="Done" big onPress={close} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                <Icon name="flagged" size={22} color={Colors.danger} />
                <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                  {target.kind === 'ride' ? 'Report This Ride' : target.kind === 'event' ? 'Report This Event' : `Report ${target.name}`}
                </Text>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Goes to the OnMyLead team, not to the {target.kind === 'ride' ? 'organizer' : target.kind === 'event' ? 'host' : 'rider'}. If anyone is in danger, call 911.
              </ThemedText>
              <Choice label="What’s Wrong" options={reasons.map((r) => ({ value: r as string | null, label: r }))} value={reason} onChange={setReason} />
              <Field label="Anything Else (Optional)" value={details} onChangeText={setDetails} multiline maxLength={1000} placeholder="What happened, and when" />
              {rider ? (
                <View style={styles.notice}>
                  <Icon name="chat" size={20} color={Colors.sky} />
                  <ThemedText type="small" style={{ flex: 1 }}>
                    Your messages with {rider.name} are attached, so the OnMyLead team can read what was said. Nobody else sees them.
                  </ThemedText>
                </View>
              ) : null}
              <ErrorText error={error} />
              <Button title="Send Report" big loading={busy} disabled={!reason} onPress={send} style={{ backgroundColor: Colors.danger }} />
              {canBlock ? (
                <Button
                  title={blocked ? 'Blocked' : 'Block This Rider'}
                  kind="secondary"
                  disabled={blocked}
                  accessibilityHint="Hides their messages from you. They aren’t told."
                  onPress={() => confirmAndBlock(rider!.userId, rider!.name)}
                />
              ) : null}
              <Button title="Cancel" kind="ghost" onPress={close} />
            </>
          )}
          </SheetScroll>
        </SwipeSheet>
        </KeyboardLift>
      ) : null}
      </SheetRoot>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(3,9,18,0.72)' },
  sheet: {
    flexShrink: 1, backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
  },
  notice: {
    flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start', backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: Spacing.three,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  title: { flex: 1, color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
});
