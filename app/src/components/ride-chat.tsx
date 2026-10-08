import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field } from '@/components/ui';
import { Radius, RideColors, Spacing } from '@/constants/theme';
import { checkMessage, isLeaderOnly, MAX_MESSAGE_LENGTH, type ChatMessage, type MessageAudience, type MessageKind } from '@/core/chat';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useTheme } from '@/hooks/use-theme';

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayAndClock = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** The pinned announcement, shown near the top of the ride page. */
export function PinnedAnnouncement({ message, senderName }: { message: ChatMessage; senderName: string }) {
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Announcement from ${senderName}: ${message.body}`}
      style={{ backgroundColor: RideColors.yellow, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.one }}>
      <ThemedText type="small" style={{ color: '#3A2600', fontWeight: 700 }}>
        Announcement from {senderName}, {dayAndClock(message.sent_at)}
      </ThemedText>
      <ThemedText style={{ color: '#1A1100', fontSize: 19, lineHeight: 25, fontWeight: 700 }}>{message.body}</ThemedText>
    </View>
  );
}

type SendTo = 'everyone' | 'leader' | 'announcement';

/**
 * Ride chat for joined riders. Each message goes to everyone or only to the ride's leader.
 * Organizers and co-organizers can post an announcement instead, which gets pinned and read
 * aloud in Ride Mode.
 */
export function RideChat({
  messages, nameOf, me, canAnnounce, leaderName, error, onSend,
}: {
  messages: ChatMessage[];
  nameOf: (userId: string) => string;
  me: string | undefined;
  canAnnounce: boolean;
  /** The leader's name, or null when this rider is the leader (nobody to message privately). */
  leaderName: string | null;
  error: string | null;
  onSend: (body: string, kind: MessageKind, audience: MessageAudience) => Promise<boolean>;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [sendTo, setSendTo] = useState<SendTo>('everyone');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [open, toggleOpen] = useRememberedToggle('ride.chatOpen.v1', true);

  const last = messages[messages.length - 1];
  const visible = showAll ? messages : messages.slice(-30);

  async function send() {
    const check = checkMessage(draft);
    if (!check.ok) return setLocalError(check.error);
    setLocalError(null);
    setBusy(true);
    const ok = await onSend(check.body, sendTo === 'announcement' ? 'announcement' : 'chat', sendTo === 'leader' ? 'leader' : 'everyone');
    setBusy(false);
    if (ok) {
      setDraft('');
      setSendTo('everyone');
    }
  }

  const options: { value: SendTo; label: string }[] = [{ value: 'everyone', label: 'Everyone' }];
  if (leaderName) options.push({ value: 'leader', label: `Leader only (${leaderName})` });
  if (canAnnounce) options.push({ value: 'announcement', label: 'Announcement (pinned, read aloud)' });
  const announcing = sendTo === 'announcement';

  return (
    <Card>
      <Pressable
        onPress={toggleOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide ride chat' : `Show ride chat, ${messages.length} messages`}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <ThemedText type="heading">Ride chat{!open && messages.length ? ` (${messages.length})` : ''}</ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.sky }}>{open ? 'Hide ▲' : 'Show ▼'}</ThemedText>
      </Pressable>
      {!open ? (
        last ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {last.user_id === me ? 'You' : nameOf(last.user_id)}: {last.body}
          </ThemedText>
        ) : null
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Only riders on this ride can see this. Don’t type while driving: Ride Mode has one-tap replies.
          </ThemedText>
          {messages.length > visible.length ? (
            <Button title={`Show ${messages.length - visible.length} earlier`} kind="secondary" onPress={() => setShowAll(true)} />
          ) : null}
          {messages.length === 0 ? <ThemedText type="small" themeColor="textSecondary">No messages yet. Say hi.</ThemedText> : null}
          {visible.map((m) => {
            const mine = m.user_id === me;
            const announcement = m.kind === 'announcement';
            const leaderOnly = isLeaderOnly(m);
            return (
              <View
                key={m.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.backgroundSelected,
                  paddingTop: Spacing.two,
                  gap: 2,
                  ...(announcement ? { borderLeftWidth: 4, borderLeftColor: RideColors.yellow, paddingLeft: Spacing.two } : null),
                  ...(leaderOnly ? { borderLeftWidth: 4, borderLeftColor: RideColors.leader, paddingLeft: Spacing.two } : null),
                }}>
                <ThemedText type="small" themeColor="textSecondary">
                  {announcement ? 'Announcement from ' : ''}
                  {mine ? 'You' : nameOf(m.user_id)}
                  {leaderOnly ? (mine ? ', to the leader only' : ', to you only as leader') : ''}, {clock(m.sent_at)}
                </ThemedText>
                <ThemedText style={[m.kind === 'status' && { fontStyle: 'italic' }, announcement && { fontWeight: 700 }]}>{m.body}</ThemedText>
              </View>
            );
          })}
          {options.length > 1 ? <Choice label="Send to" options={options} value={sendTo} onChange={setSendTo} /> : null}
          <Field
            label={announcing ? 'Announcement' : sendTo === 'leader' ? 'Message to the leader' : 'Message'}
            value={draft}
            onChangeText={setDraft}
            placeholder={announcing ? 'Fuel stop in Green River at 11' : sendTo === 'leader' ? 'Only you and the leader see this' : 'Message the group'}
            maxLength={MAX_MESSAGE_LENGTH}
            multiline
          />
          <ErrorText error={localError ?? error} />
          <Button
            title={announcing ? 'Post announcement' : sendTo === 'leader' ? 'Send to leader' : 'Send to everyone'}
            loading={busy}
            onPress={send}
          />
        </>
      )}
    </Card>
  );
}
