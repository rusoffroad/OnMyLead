import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddFriendButton } from '@/components/add-friend-button';
import { RiderDot } from '@/components/convoy';
import { Icon } from '@/components/icon';
import { keyboardScroll, TextBox } from '@/components/keyboard';
import { ReportSheet } from '@/components/report-sheet';
import { SendBadge } from '@/components/ride-chat';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { checkMessage, MAX_MESSAGE_LENGTH } from '@/core/chat';
import { dayLabel } from '@/core/group-chat';
import { dmReportDetails, leftBeforeReply, NOT_SWITCHED_ON } from '@/core/out-riding';
import { useDirectChat } from '@/hooks/use-direct-chat';
import { confirmAndBlock, useBlocks } from '@/lib/blocks';
import { confirmAsync } from '@/lib/confirm';
import { clearDmThread, riderName, setDmMuted, setOpenDm } from '@/lib/out-riding';
import { useSession } from '@/lib/session';

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const STARTERS = ['Where are you parked?', 'Which trail are you on?', 'Want to ride together?'];

/**
 * A direct message conversation with one rider. Opened from Out Riding, the Messages list, or a
 * push. Add Friend, Report Rider, Block Rider and Delete Conversation sit behind the ••• button; a long press
 * on one of their messages reports that message. Until they reply, you can send 3.
 */
export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const chat = useDirectChat(id);
  const blocks = useBlocks();
  const [name, setName] = useState<string | null>(null);
  const [mutedLocal, setMutedLocal] = useState<boolean | null>(null);
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<ComponentProps<typeof ReportSheet>['target']>(null);
  const scroller = useRef<ScrollView>(null);
  const muted = mutedLocal ?? chat.summary?.muted ?? false;
  const blocked = !!id && blocks.ids.has(id);
  const who = name ?? chat.summary?.other_name ?? 'Rider';

  useFocusEffect(
    useCallback(() => {
      setOpenDm(id ?? null);
      if (id) riderName(id).then(setName).catch(() => {});
      return () => setOpenDm(null);
    }, [id]),
  );

  const left = leftBeforeReply([...chat.messages, ...chat.pending.map(() => ({ sender_id: me ?? '' }))], me);
  const rows = useMemo(
    () =>
      chat.messages.map((m, i) => {
        const prev = chat.messages[i - 1];
        const day = dayLabel(m.created_at);
        return { m, day: !prev || dayLabel(prev.created_at) !== day ? day : null };
      }),
    [chat.messages],
  );
  const myLatestId = [...chat.messages].reverse().find((m) => m.sender_id === me)?.id;

  async function send(text = draft) {
    const check = checkMessage(text);
    if (!check.ok) return setLocalError(check.error);
    setLocalError(null);
    setDraft('');
    await chat.send(check.body);
  }

  const toggleMute = async () => {
    if (!chat.threadId) return;
    const next = !muted;
    setMutedLocal(next);
    await setDmMuted(chat.threadId, next).catch(() => setMutedLocal(!next));
  };

  async function deleteConversation() {
    setMenu(false);
    if (!chat.threadId) return;
    const ok = await confirmAsync(
      'Delete This Conversation?',
      `It’s removed from your Messages. ${who} keeps their copy. If they message you again, it comes back.`,
      'Delete',
    );
    if (!ok) return;
    await clearDmThread(chat.threadId).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/messages');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.page}>
      <Stack.Screen options={{ headerShown: false, title: who }} />
      <View style={styles.column}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}
            style={styles.back}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="chevron" color={Colors.text} size={26} />
            </View>
          </Pressable>
          <RiderDot userId={id} name={who} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{who}</Text>
            <Text style={styles.sub} numberOfLines={1}>{blocked ? 'Blocked' : muted ? 'Muted' : 'Direct Message'}</Text>
          </View>
          {chat.threadId ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: muted }}
              accessibilityLabel={muted ? 'Unmute this conversation' : 'Mute this conversation'}
              onPress={toggleMute}
              style={[styles.pill, muted && { backgroundColor: Colors.backgroundSelected }]}>
              <Text style={[styles.pillText, muted && { color: Colors.textSecondary }]}>{muted ? 'Unmute' : 'Mute'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            accessibilityState={{ expanded: menu }}
            onPress={() => setMenu(!menu)}
            style={styles.pill}>
            <Text style={styles.pillText}>•••</Text>
          </Pressable>
        </View>

        {menu ? (
          <View style={styles.menu}>
            {id && !blocked ? (
              <AddFriendButton userId={id} name={who} style={styles.friendBtn} onDone={() => setMenu(false)} />
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={styles.smallBtn}
              onPress={() => {
                setMenu(false);
                const theirs = [...chat.messages].reverse().find((m) => m.sender_id !== me);
                if (id) setReporting({ kind: 'rider', userId: id, name: who, context: dmReportDetails(theirs?.body), source: 'dm' });
              }}>
              <Text style={styles.smallBtnText}>Report Rider</Text>
            </Pressable>
            {!blocks.off && !blocked ? (
              <Pressable
                accessibilityRole="button"
                style={styles.smallBtn}
                onPress={() => {
                  setMenu(false);
                  if (id) confirmAndBlock(id, who);
                }}>
                <Text style={styles.smallBtnText}>Block Rider</Text>
              </Pressable>
            ) : null}
            {chat.threadId ? (
              <Pressable accessibilityRole="button" style={styles.smallBtn} onPress={deleteConversation}>
                <Text style={[styles.smallBtnText, { color: Colors.textSecondary }]}>Delete Conversation</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scroller}
            style={{ flex: 1 }}
            contentContainerStyle={styles.thread}
            {...keyboardScroll}
            indicatorStyle="white"
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
            {chat.off ? (
              <View style={styles.note}>
                <ThemedText type="smallBold">Not Switched On Yet</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{NOT_SWITCHED_ON}</ThemedText>
              </View>
            ) : null}

            {chat.loaded && !chat.off && !chat.messages.length && !chat.pending.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Say Hi to {who}</Text>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 320 }}>
                  Only {who} sees what you send. Until they reply you can send {left ?? 3}. If you meet up with someone new, meet at a trailhead or staging area.
                </ThemedText>
                <View style={{ gap: Spacing.two, alignSelf: 'stretch', marginTop: Spacing.two }}>
                  {STARTERS.map((s) => (
                    <Pressable key={s} accessibilityRole="button" onPress={() => setDraft(s)} style={styles.starter}>
                      <Text style={styles.starterText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {rows.map(({ m, day }) => {
              const self = m.sender_id === me;
              return (
                <View key={m.id}>
                  {day ? <Text style={styles.day}>{day}</Text> : null}
                  <View style={[styles.row, self && styles.rowMine]}>
                    <View style={[styles.col, self && { alignItems: 'flex-end' }]}>
                      <Pressable
                        onLongPress={self || !id ? undefined : () => setReporting({ kind: 'rider', userId: id, name: who, context: dmReportDetails(m.body), source: 'dm' })}
                        delayLongPress={350}
                        accessibilityHint={self ? undefined : 'Long press to report this message'}
                        style={[styles.bubble, self ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <Text style={[styles.body, self && { color: '#fff' }]}>{m.body}</Text>
                      </Pressable>
                      <View style={styles.meta}>
                        <Text style={styles.time}>{clock(m.sent_at)}</Text>
                        {self ? <SendBadge state="sent" iconOnly={m.id !== myLatestId || chat.pending.length > 0} /> : null}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}

            {chat.pending.map((p) => (
              <View key={p.localId} style={[styles.row, styles.rowMine]}>
                <View style={[styles.col, { alignItems: 'flex-end' }]}>
                  <View style={[styles.bubble, styles.bubbleMine, { opacity: p.state === 'sending' ? 0.6 : 1 }, p.state === 'failed' && styles.bubbleFailed]}>
                    <Text style={[styles.body, { color: '#fff' }]}>{p.body}</Text>
                  </View>
                  <View style={styles.meta}>
                    <SendBadge state={p.state} />
                  </View>
                  {p.state === 'failed' ? (
                    <>
                      {p.error ? <Text style={styles.failText}>{p.error}</Text> : null}
                      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                        <Pressable accessibilityRole="button" onPress={() => chat.retry(p.localId)} style={[styles.smallBtn, { backgroundColor: Colors.accent }]}>
                          <Text style={styles.smallBtnText}>Retry</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" onPress={() => chat.discard(p.localId)} style={styles.smallBtn}>
                          <Text style={[styles.smallBtnText, { color: Colors.textSecondary }]}>Remove</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
            ))}
            {chat.error ? <Text style={[styles.failText, { textAlign: 'center', marginTop: Spacing.three }]}>{chat.error}</Text> : null}
          </ScrollView>

          {!chat.off ? (
            <View style={styles.composer}>
              {left !== null && chat.messages.length > 0 ? (
                <Text style={styles.waitNote}>
                  {left > 0 ? `You can send ${left} more until ${who} replies.` : `Wait for ${who} to reply before sending more.`}
                </Text>
              ) : null}
              {blocked ? (
                <Text style={styles.waitNote}>You blocked {who}. Unblock them from You, Blocked Riders to message them.</Text>
              ) : (
                <View style={styles.inputRow}>
                  <TextBox
                    value={draft}
                    onChangeText={(t) => {
                      setDraft(t);
                      if (localError) setLocalError(null);
                    }}
                    placeholder={`Message ${who}`}
                    placeholderTextColor={Colors.textSecondary}
                    maxLength={MAX_MESSAGE_LENGTH}
                    multiline
                    accessibilityLabel="Message"
                    style={styles.input}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                    disabled={!draft.trim() || left === 0}
                    onPress={() => send()}
                    style={({ pressed }) => [styles.send, (!draft.trim() || left === 0) && { backgroundColor: Colors.backgroundSelected }, pressed && { opacity: 0.8 }]}>
                    <View style={{ transform: [{ rotate: '-90deg' }] }}>
                      <Icon name="chevron" color="#fff" size={24} strokeWidth={2.8} />
                    </View>
                  </Pressable>
                </View>
              )}
              {localError ? <Text style={styles.failText}>{localError}</Text> : null}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background },
  // Tablets and wide windows: a readable column, not a stretched phone.
  column: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.one, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26, lineHeight: 28 },
  sub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  pill: { minHeight: 34, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center' },
  pillText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
  menu: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, padding: Spacing.three, backgroundColor: Colors.backgroundElement },
  thread: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, flexGrow: 1 },
  day: { alignSelf: 'center', marginTop: Spacing.four, color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 15, letterSpacing: 0.4 },
  row: { flexDirection: 'row', marginTop: Spacing.two },
  rowMine: { justifyContent: 'flex-end' },
  col: { maxWidth: '80%', gap: 4, alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  bubbleMine: { backgroundColor: Colors.sky, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: Colors.backgroundElement, borderBottomLeftRadius: 6 },
  bubbleFailed: { backgroundColor: '#5A2230' },
  body: { color: Colors.text, fontFamily: font(500), fontSize: 17, lineHeight: 23 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4 },
  time: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12 },
  failText: { color: Colors.danger, fontFamily: font(600), fontSize: 13 },
  smallBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Colors.backgroundSelected, justifyContent: 'center' },
  friendBtn: { minHeight: 36, paddingHorizontal: 14, paddingVertical: 0, borderRadius: Radius.pill },
  smallBtnText: { color: '#fff', fontFamily: font(700), fontSize: 14 },
  note: {
    backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: Colors.sky,
    padding: Spacing.three, gap: 4, marginTop: Spacing.three,
  },
  empty: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.five, paddingHorizontal: Spacing.two },
  emptyTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, textAlign: 'center' },
  starter: {
    borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
  },
  starterText: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 16 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, backgroundColor: Colors.background,
    paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.two, gap: Spacing.two,
  },
  waitNote: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: {
    flex: 1, minHeight: 46, maxHeight: 140, borderRadius: 23, backgroundColor: Colors.backgroundElement, color: Colors.text,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: font(500), fontSize: 17,
  },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
});
