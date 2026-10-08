import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field } from '@/components/ui';
import { RideColors, Spacing } from '@/constants/theme';
import { checkMessage, MAX_MESSAGE_LENGTH, type ChatMessage, type MessageKind } from '@/core/chat';
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
      style={{ backgroundColor: RideColors.yellow, borderRadius: 14, padding: Spacing.three, gap: Spacing.one }}>
      <ThemedText type="smallBold" style={{ color: '#000', letterSpacing: 0.5 }}>
        PINNED ANNOUNCEMENT · {senderName} · {dayAndClock(message.sent_at)}
      </ThemedText>
      <ThemedText style={{ color: '#000', fontSize: 18, fontWeight: '700' }}>{message.body}</ThemedText>
    </View>
  );
}

/**
 * Ride chat for joined riders. Organizers and co-organizers can post an announcement instead,
 * which gets pinned and read aloud in Ride Mode.
 */
export function RideChat({
  messages, nameOf, me, canAnnounce, error, onSend,
}: {
  messages: ChatMessage[];
  nameOf: (userId: string) => string;
  me: string | undefined;
  canAnnounce: boolean;
  error: string | null;
  onSend: (body: string, kind: MessageKind) => Promise<boolean>;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<'chat' | 'announcement'>('chat');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? messages : messages.slice(-30);

  async function send() {
    const check = checkMessage(draft);
    if (!check.ok) return setLocalError(check.error);
    setLocalError(null);
    setBusy(true);
    const ok = await onSend(check.body, kind);
    setBusy(false);
    if (ok) {
      setDraft('');
      setKind('chat');
    }
  }

  return (
    <Card>
      <ThemedText type="smallBold">Ride chat</ThemedText>
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
        return (
          <View
            key={m.id}
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingTop: Spacing.two,
              gap: 2,
              ...(announcement ? { borderLeftWidth: 5, borderLeftColor: RideColors.yellow, paddingLeft: Spacing.two } : null),
            }}>
            <ThemedText type="small" themeColor="textSecondary">
              {announcement ? 'Announcement · ' : ''}
              {mine ? 'You' : nameOf(m.user_id)} · {clock(m.sent_at)}
            </ThemedText>
            <ThemedText style={[m.kind === 'status' && { fontStyle: 'italic' }, announcement && { fontWeight: '700' }]}>{m.body}</ThemedText>
          </View>
        );
      })}
      {canAnnounce ? (
        <Choice
          options={[{ value: 'chat', label: 'Chat' }, { value: 'announcement', label: 'Announcement (pinned, read aloud)' }]}
          value={kind}
          onChange={setKind}
        />
      ) : null}
      <Field
        label={kind === 'announcement' ? 'Announcement' : 'Message'}
        value={draft}
        onChangeText={setDraft}
        placeholder={kind === 'announcement' ? 'Fuel stop in Green River at 11' : 'Message the group'}
        maxLength={MAX_MESSAGE_LENGTH}
        multiline
      />
      <ErrorText error={localError ?? error} />
      <Button title={kind === 'announcement' ? 'Post announcement' : 'Send'} loading={busy} onPress={send} />
    </Card>
  );
}
