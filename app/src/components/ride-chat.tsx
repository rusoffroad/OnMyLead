import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProLock } from '@/components/pro-gate';
import { ThemedText } from '@/components/themed-text';
import { PollCard, PollComposer } from '@/components/ride-poll';
import { Button, Card, Choice, ErrorText, Field, Tag } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import {
  checkMessage, isLeaderOnly, isResolved, MAX_MESSAGE_LENGTH, SEND_STATE_LABEL,
  type ChatMessage, type MessageAudience, type MessageKind, type PendingMessage, type SendState,
} from '@/core/chat';
import { parseProError } from '@/core/entitlements';
import { isPoll, type PollVote } from '@/core/polls';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useTheme } from '@/hooks/use-theme';
import { confirmAsync } from '@/lib/confirm';

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

type SendTo = 'everyone' | 'leader' | 'announcement' | 'poll';

/**
 * Ride chat for joined riders. Each message goes to everyone or only to the ride's leader.
 * Organizers and co-organizers can post an announcement instead, which gets pinned and read
 * aloud in Ride Mode. The leader (and organizers) can also ask a quick poll. A long press on
 * someone else's message offers Report Rider and Block Rider; pass messages with blocked riders
 * already taken out (core/blocks).
 */
export function RideChat({
  messages, nameOf, me, canAnnounce, leaderName, error, onSend, canPoll = false, pollLocked = false, pollsOn = true, votes = [], onSendPoll, onVote,
  pending = [], onRetry, onDiscard, onResolve, onClear, actionsOn = true, onReport, onBlock,
}: {
  messages: ChatMessage[];
  nameOf: (userId: string) => string;
  me: string | undefined;
  canAnnounce: boolean;
  /** The leader's name, or null when this rider is the leader (nobody to message privately). */
  leaderName: string | null;
  error: string | null;
  onSend: (body: string, kind: MessageKind, audience: MessageAudience) => Promise<boolean>;
  /** The ride's leader, organizers and co-organizers can post quick polls. */
  canPoll?: boolean;
  /** A Free plan: the poll option opens the Pro prompt instead of the composer. Voting stays free. */
  pollLocked?: boolean;
  /** False until the database has the polls update. */
  pollsOn?: boolean;
  votes?: PollVote[];
  onSendPoll?: (question: string, choices: string[]) => Promise<boolean>;
  onVote?: (messageId: string, choice: number) => void;
  /** This rider's messages still on their way out (Sending) or Not Sent. */
  pending?: PendingMessage[];
  onRetry?: (localId: string) => void;
  onDiscard?: (localId: string) => void;
  /** The sender marks their own message resolved (true) or open again (false). */
  onResolve?: (messageId: string, resolved: boolean) => void;
  /** The sender clears their own message for everyone. */
  onClear?: (messageId: string) => void;
  /** False until the database has the Clear and Mark Resolved update. */
  actionsOn?: boolean;
  /** Long press on someone else's message: report them, or block them. */
  onReport?: (userId: string) => void;
  onBlock?: (userId: string) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [sendTo, setSendTo] = useState<SendTo>('everyone');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [open, toggleOpen] = useRememberedToggle('ride.chatOpen.v1', true);

  const last = messages[messages.length - 1];
  const canManage = !!onResolve || !!onClear;
  const canFlag = !!onReport || !!onBlock;
  // Only my newest message spells out Sent; earlier ones keep just the check.
  const myLatestId = [...messages].reverse().find((m) => m.user_id === me)?.id;
  const visible = showAll ? messages : messages.slice(-30);

  async function send() {
    const check = checkMessage(draft);
    if (!check.ok) return setLocalError(check.error);
    setLocalError(null);
    // The message shows in the chat straight away as Sending, so the box clears now. If it
    // doesn't go through it stays there as Not Sent, with Retry.
    setDraft('');
    const ok = await onSend(check.body, sendTo === 'announcement' ? 'announcement' : 'chat', sendTo === 'leader' ? 'leader' : 'everyone');
    if (ok) setSendTo('everyone');
  }

  async function clear(m: ChatMessage) {
    setMenuFor(null);
    const ok = await confirmAsync(
      'Clear This Message?',
      'It disappears from the ride chat for everyone. This can’t be undone.',
      'Clear',
    );
    if (ok) onClear?.(m.id);
  }

  const options: { value: SendTo; label: string }[] = [{ value: 'everyone', label: 'Everyone' }];
  if (leaderName) options.push({ value: 'leader', label: `Leader Only (${leaderName})` });
  if (canAnnounce) options.push({ value: 'announcement', label: 'Announcement (Pinned, Read Aloud)' });
  if (canPoll && onSendPoll) options.push({ value: 'poll', label: 'Quick Poll' });
  const announcing = sendTo === 'announcement';

  async function sendPoll(question: string, choices: string[]) {
    const ok = await onSendPoll!(question, choices);
    if (ok) setSendTo('everyone');
    return ok;
  }

  return (
    <Card>
      <Pressable
        onPress={toggleOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide ride chat' : `Show ride chat, ${messages.length} messages`}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <ThemedText type="heading">Ride Chat{!open && messages.length ? ` (${messages.length})` : ''}</ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.sky }}>{open ? 'Hide ▲' : 'Show ▼'}</ThemedText>
      </Pressable>
      {!open ? (
        last ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {last.user_id === me ? 'You' : nameOf(last.user_id)}: {isPoll(last) ? `Poll: ${last.body}` : last.body}
          </ThemedText>
        ) : null
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Only riders on this ride can see this. Don’t type while driving: Ride Mode has one-tap replies.
          </ThemedText>
          {messages.length > visible.length ? (
            <Button title={`Show ${messages.length - visible.length} Earlier`} kind="secondary" onPress={() => setShowAll(true)} />
          ) : null}
          {messages.length === 0 ? <ThemedText type="small" themeColor="textSecondary">No messages yet. Say hi.</ThemedText> : null}
          {visible.map((m) => {
            const mine = m.user_id === me;
            const announcement = m.kind === 'announcement';
            const leaderOnly = isLeaderOnly(m);
            const poll = isPoll(m);
            const resolved = isResolved(m);
            const menuOpen = menuFor === m.id;
            const flaggable = !mine && canFlag;
            return (
              <Pressable
                key={m.id}
                disabled={!flaggable}
                onLongPress={flaggable ? () => setMenuFor(menuOpen ? null : m.id) : undefined}
                delayLongPress={350}
                accessibilityHint={flaggable ? 'Long press to report or block this rider' : undefined}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.backgroundSelected,
                  paddingTop: Spacing.two,
                  gap: 2,
                  ...(announcement ? { borderLeftWidth: 4, borderLeftColor: RideColors.yellow, paddingLeft: Spacing.two } : null),
                  ...(leaderOnly ? { borderLeftWidth: 4, borderLeftColor: RideColors.leader, paddingLeft: Spacing.two } : null),
                  ...(resolved ? { borderLeftWidth: 4, borderLeftColor: RideColors.green, paddingLeft: Spacing.two } : null),
                  ...(poll ? { gap: Spacing.two, paddingBottom: Spacing.one } : null),
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                    {announcement ? 'Announcement from ' : poll ? 'Poll from ' : ''}
                    {mine ? 'You' : nameOf(m.user_id)}
                    {leaderOnly ? (mine ? ', to the leader only' : ', to you only as leader') : ''}, {clock(m.sent_at)}
                  </ThemedText>
                  {resolved ? <Tag label="Resolved" color={RideColors.green} /> : null}
                  {mine ? <SendBadge state="sent" iconOnly={m.id !== myLatestId || pending.length > 0} /> : null}
                  {mine && canManage ? (
                    <Pressable
                      onPress={() => setMenuFor(menuOpen ? null : m.id)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: menuOpen }}
                      accessibilityLabel={menuOpen ? 'Close message options' : 'Message options: Mark Resolved or Clear'}
                      hitSlop={12}
                      style={({ pressed }) => [chatStyles.more, { opacity: pressed ? 0.6 : 1 }, menuOpen && { backgroundColor: theme.backgroundSelected }]}>
                      <Text style={chatStyles.moreText}>•••</Text>
                    </Pressable>
                  ) : null}
                </View>
                {poll ? (
                  <PollCard message={m} votes={votes} me={me} onVote={(choice) => onVote?.(m.id, choice)} />
                ) : (
                  <ThemedText
                    style={[
                      m.kind === 'status' && { fontStyle: 'italic' },
                      announcement && { fontWeight: 700 },
                      resolved && { color: theme.textSecondary },
                    ]}>
                    {m.body}
                  </ThemedText>
                )}
                {menuOpen && !mine ? (
                  <View style={chatStyles.actions}>
                    {onReport ? (
                      <Button
                        title="Report Rider"
                        kind="secondary"
                        onPress={() => {
                          setMenuFor(null);
                          onReport(m.user_id);
                        }}
                        style={{ flex: 1 }}
                      />
                    ) : null}
                    {onBlock ? (
                      <Button
                        title="Block Rider"
                        kind="ghost"
                        onPress={() => {
                          setMenuFor(null);
                          onBlock(m.user_id);
                        }}
                        style={{ flex: 1 }}
                      />
                    ) : null}
                  </View>
                ) : menuOpen ? (
                  actionsOn ? (
                    <View style={chatStyles.actions}>
                      {onResolve ? (
                        <Button
                          title={resolved ? 'Reopen' : 'Mark Resolved'}
                          kind="secondary"
                          onPress={() => {
                            setMenuFor(null);
                            onResolve(m.id, !resolved);
                          }}
                          style={{ flex: 1 }}
                        />
                      ) : null}
                      {onClear ? <Button title="Clear" kind="ghost" onPress={() => clear(m)} style={{ flex: 1 }} /> : null}
                    </View>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">Clear and Mark Resolved aren’t switched on yet.</ThemedText>
                  )
                ) : null}
              </Pressable>
            );
          })}
          {pending.map((p) => (
            <View
              key={p.localId}
              style={{ borderTopWidth: 1, borderTopColor: theme.backgroundSelected, paddingTop: Spacing.two, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                  {p.kind === 'announcement' ? 'Announcement from You' : 'You'}
                  {p.audience === 'leader' ? ', to the leader only' : ''}, {clock(p.at)}
                </ThemedText>
                <SendBadge state={p.state} />
              </View>
              <ThemedText style={{ color: p.state === 'sending' ? theme.textSecondary : theme.text }}>{p.body}</ThemedText>
              {p.state === 'failed' ? (
                <>
                  {p.error ? <ThemedText type="small" style={{ color: Colors.danger }}>{p.error}</ThemedText> : null}
                  <View style={chatStyles.actions}>
                    {onRetry ? <Button title="Retry" onPress={() => onRetry(p.localId)} style={{ flex: 1 }} /> : null}
                    {onDiscard ? <Button title="Remove" kind="ghost" onPress={() => onDiscard(p.localId)} style={{ flex: 1 }} /> : null}
                  </View>
                </>
              ) : null}
            </View>
          ))}
          {options.length > 1 ? <Choice label="Send To" options={options} value={sendTo} onChange={setSendTo} /> : null}
          {sendTo === 'poll' && (pollLocked || parseProError(error)?.kind === 'pro_required') ? (
            <ProLock feature="create_poll" title="Create Ride Polls" detail="Part of Pro. Everyone can still vote." />
          ) : sendTo === 'poll' ? (
            <>
              <PollComposer pollsOn={pollsOn} onSend={sendPoll} />
              <ErrorText error={error} />
            </>
          ) : (
            <>
              <Field
                label={announcing ? 'Announcement' : sendTo === 'leader' ? 'Message to the Leader' : 'Message'}
                value={draft}
                onChangeText={setDraft}
                placeholder={announcing ? 'Fuel stop in Green River at 11' : sendTo === 'leader' ? 'Only you and the leader see this' : 'Message the group'}
                maxLength={MAX_MESSAGE_LENGTH}
                multiline
              />
              <ErrorText error={localError ?? error} />
              <Button
                title={announcing ? 'Post Announcement' : sendTo === 'leader' ? 'Send to Leader' : 'Send to Everyone'}
                onPress={send}
              />
            </>
          )}
        </>
      )}
    </Card>
  );
}

const BADGE_COLOR: Record<SendState, string> = {
  sending: Colors.textSecondary,
  sent: RideColors.green,
  failed: Colors.danger,
  queued: RideColors.yellow,
};

/** Sending…, ✓ Sent, ! Not Sent or Waiting for Signal, next to a message. */
export function SendBadge({ state, iconOnly = false }: { state: SendState; iconOnly?: boolean }) {
  const color = BADGE_COLOR[state];
  return (
    <View
      accessible
      accessibilityLabel={SEND_STATE_LABEL[state]}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {state === 'sending' ? <ActivityIndicator size="small" color={color} /> : (
        <Text style={[chatStyles.badgeIcon, { color }]}>{state === 'sent' ? '✓' : state === 'failed' ? '!' : '…'}</Text>
      )}
      {iconOnly ? null : <Text style={[chatStyles.badgeText, { color }]}>{SEND_STATE_LABEL[state]}</Text>}
    </View>
  );
}

const chatStyles = StyleSheet.create({
  more: { minWidth: 36, minHeight: 28, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: Colors.textSecondary, fontFamily: font(800), fontSize: 14, letterSpacing: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  badgeIcon: { fontFamily: font(800), fontSize: 13 },
  badgeText: { fontFamily: font(700), fontSize: 13 },
});
