import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Choice, ErrorText, Field } from '@/components/ui';
import { Colors, font, Spacing } from '@/constants/theme';
import { REPORT_REASONS } from '@/core/pro';
import { confirmAndBlock, useBlocks } from '@/lib/blocks';
import { sendReport } from '@/lib/pro';

type Target = { kind: 'ride'; rideId: string; name: string } | { kind: 'rider'; userId: string; rideId?: string | null; name: string };

/**
 * Report Ride / Report Rider: a reason, an optional note, and it goes to the OnMyLead owner.
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
        rideId: target.rideId ?? null,
        userId: target.kind === 'rider' ? target.userId : null,
        reason,
        details,
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
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
      {target ? (
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
          <View style={styles.grip} />
          {sent ? (
            <>
              <Text style={styles.title} accessibilityRole="header">Report Sent</Text>
              <ThemedText>
                Thanks. OnMyLead looks at every report. {target.name} isn’t told who sent it. If anyone is in danger, call 911.
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
                  {target.kind === 'ride' ? 'Report This Ride' : `Report ${target.name}`}
                </Text>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Goes to the OnMyLead team, not to the {target.kind === 'ride' ? 'organizer' : 'rider'}. If anyone is in danger, call 911.
              </ThemedText>
              <Choice label="What’s Wrong" options={reasons.map((r) => ({ value: r as string | null, label: r }))} value={reason} onChange={setReason} />
              <Field label="Anything Else (Optional)" value={details} onChangeText={setDetails} multiline maxLength={1000} placeholder="What happened, and when" />
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
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(3,9,18,0.72)' },
  sheet: {
    backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  title: { flex: 1, color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
});
