import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RiderDot } from '@/components/convoy';
import { Icon } from '@/components/icon';
import { keyboardScroll, TextBox } from '@/components/keyboard';
import { ReportSheet } from '@/components/report-sheet';
import { SendBadge } from '@/components/ride-chat';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { withoutBlocked } from '@/core/blocks';
import { checkMessage, MAX_MESSAGE_LENGTH } from '@/core/chat';
import {
  NOT_SWITCHED_ON, ridePhase, ridesTalkedAbout, rideWhen, talkableRides, threadRows, type ChatRide, type GroupMessage, type RidePhase,
} from '@/core/group-chat';
import { useGroupChat } from '@/hooks/use-group-chat';
import { confirmAndBlock, useBlocks } from '@/lib/blocks';
import { confirmAsync } from '@/lib/confirm';
import { myGroupChats, myJoinedRides, setGroupChatMuted, setOpenGroupChat } from '@/lib/group-chat';
import { getGroup, type RidingGroup } from '@/lib/groups';
import { useSession } from '@/lib/session';

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Ride tickets carry the ride's moment in one colour: green riding now, blue coming up, grey over. */
const PHASE_COLOR: Record<RidePhase, string> = { live: RideColors.green, upcoming: Colors.sky, over: RideColors.unknown };

/** First things a group usually says, for an empty chat. */
const STARTERS = ['Who’s in this weekend?', 'Anyone need a spot on a trailer?', 'Post your photos from the last ride'];

/**
 * A riding group's chat: a group text for everyone in the group. A message can be about one of
 * your rides (riding now, coming up, or just done), and the strip at the top narrows the chat to
 * the talk about one ride. A long press on someone else's message offers Report Rider and Block
 * Rider (and Clear, for whoever runs the group); messages from blocked riders aren't shown.
 */
export default function GroupChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const [group, setGroup] = useState<RidingGroup | null | undefined>(undefined);
  const [muted, setMuted] = useState(false);
  const [mine, setMine] = useState<ChatRide[]>([]);
  const [focusRide, setFocusRide] = useState<string | null>(null);
  const [aboutRide, setAboutRide] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reporting, setReporting] = useState<ComponentProps<typeof ReportSheet>['target']>(null);
  const chat = useGroupChat(id);
  const blocks = useBlocks();
  const messages = useMemo(() => withoutBlocked(chat.messages, blocks.ids, me), [chat.messages, blocks.ids, me]);
  const scroller = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      setOpenGroupChat(id ?? null);
      getGroup(id).then(setGroup).catch(() => setGroup(null));
      myGroupChats().then((all) => setMuted(!!all.find((c) => c.group_id === id)?.muted)).catch(() => {});
      myJoinedRides().then((r) => setMine(talkableRides(r))).catch(() => {});
      return () => setOpenGroupChat(null);
    }, [id]),
  );

  const nameOf = useMemo(() => {
    const names = new Map((group?.riders ?? []).map((r) => [r.id, r.name]));
    return (uid: string) => names.get(uid) ?? 'Former Rider';
  }, [group]);
  const ownerId = group?.ownerId;

  // Every ride a ticket can show: the ones the chat links to, plus my own for the composer.
  const rideById = useMemo(() => new Map([...mine, ...chat.rides].map((r) => [r.id, r])), [mine, chat.rides]);
  const talkedAbout = useMemo(() => ridesTalkedAbout(messages, [...rideById.values()]), [messages, rideById]);
  const shown = focusRide ? messages.filter((m) => m.ride_id === focusRide) : messages;
  const rows = threadRows(shown);
  const myLatestId = [...chat.messages].reverse().find((m) => m.user_id === me)?.id;
  const about = aboutRide ? rideById.get(aboutRide) ?? null : null;

  // Narrowing to a ride also aims the next message at it, when it's one of mine.
  const focusOn = (rideId: string | null) => {
    setFocusRide(rideId);
    if (rideId && mine.some((r) => r.id === rideId)) setAboutRide(rideId);
  };

  async function send(text = draft) {
    const check = checkMessage(text);
    if (!check.ok) return setLocalError(check.error);
    setLocalError(null);
    setDraft('');
    setPicking(false);
    await chat.send(check.body, aboutRide);
  }

  async function clear(m: GroupMessage) {
    setMenuFor(null);
    const theirs = m.user_id !== me;
    const ok = await confirmAsync(
      'Clear This Message?',
      theirs ? `You run this group, so you can clear ${nameOf(m.user_id)}’s message. It disappears for everyone.` : 'It disappears from the group chat for everyone. This can’t be undone.',
      'Clear',
    );
    if (ok) chat.clear(m.id);
  }

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    await setGroupChatMuted(id, next).catch(() => setMuted(!next));
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.page}>
      <Stack.Screen options={{ headerShown: false, title: group?.name ?? 'Group Chat' }} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/groups/${id}`))}
          style={styles.back}>
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <Icon name="chevron" color={Colors.text} size={26} />
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityHint="Open the group" onPress={() => router.push(`/groups/${id}`)} style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{group?.name ?? 'Group Chat'}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {group ? `${group.riders.length} ${group.riders.length === 1 ? 'Rider' : 'Riders'}` : ' '}
            {muted ? ', Muted' : ''}
          </Text>
        </Pressable>
        {!chat.off ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: muted }}
            accessibilityLabel={muted ? 'Unmute this group chat' : 'Mute this group chat'}
            onPress={toggleMute}
            style={[styles.mute, muted && { backgroundColor: Colors.backgroundSelected }]}>
            <Text style={[styles.muteText, muted && { color: Colors.textSecondary }]}>{muted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
        ) : null}
      </View>

      {talkedAbout.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stripWrap} contentContainerStyle={styles.strip}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: !focusRide }}
            onPress={() => focusOn(null)}
            style={[styles.allChip, !focusRide && styles.allChipOn]}>
            <Text style={[styles.allChipText, !focusRide && { color: Colors.background }]}>All Talk</Text>
          </Pressable>
          {talkedAbout.map((r) => (
            <RideTicket
              key={r.id}
              ride={r}
              selected={focusRide === r.id}
              onPress={() => focusOn(focusRide === r.id ? null : r.id)}
              accessibilityRole="radio"
            />
          ))}
        </ScrollView>
      ) : null}

      {focusRide && rideById.get(focusRide) ? (
        <View style={styles.focusBar}>
          <Text style={styles.focusText} numberOfLines={1}>Only Talk About {rideById.get(focusRide)!.name}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push(`/r/${rideById.get(focusRide)!.invite_code}`)}>
            <Text style={styles.focusLink}>Open the Ride</Text>
          </Pressable>
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

          {chat.loaded && !chat.off && !messages.length && !chat.pending.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Start the Conversation</Text>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 300 }}>
                Everyone in {group?.name ?? 'the group'} sees what you post here. Plan the next ride, share how the last one went.
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

          {focusRide && !shown.length ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.four }}>
              Nothing about this ride yet.
            </ThemedText>
          ) : null}

          {rows.map(({ message: m, day, firstInRun, lastInRun, newRide }) => {
            const self = m.user_id === me;
            const ride = m.ride_id ? rideById.get(m.ride_id) : null;
            const canClear = self || ownerId === me;
            const menuOpen = menuFor === m.id;
            return (
              <View key={m.id}>
                {day ? <Text style={styles.day}>{day}</Text> : null}
                <View style={[styles.row, self ? styles.rowMine : null, { marginTop: firstInRun ? Spacing.three : 3 }]}>
                  {!self ? (
                    <View style={styles.avatarSlot}>
                      {lastInRun ? <RiderDot name={nameOf(m.user_id)} lead={m.user_id === ownerId} size={28} /> : null}
                    </View>
                  ) : null}
                  <View style={[styles.col, self && { alignItems: 'flex-end' }]}>
                    {firstInRun && !self ? <Text style={styles.sender}>{nameOf(m.user_id)}</Text> : null}
                    {newRide && ride && !focusRide ? (
                      <RideTicket ride={ride} compact onPress={() => focusOn(ride.id)} accessibilityRole="button" />
                    ) : null}
                    <Pressable
                      onLongPress={self ? () => clear(m) : () => setMenuFor(menuOpen ? null : m.id)}
                      delayLongPress={350}
                      accessibilityHint={self ? 'Long press to clear it' : 'Long press to report or block this rider'}
                      style={[
                        styles.bubble,
                        self ? styles.bubbleMine : styles.bubbleTheirs,
                        self ? { borderBottomRightRadius: lastInRun ? 6 : 18 } : { borderBottomLeftRadius: lastInRun ? 6 : 18 },
                      ]}>
                      <Text style={[styles.body, self && { color: '#fff' }]}>{m.body}</Text>
                    </Pressable>
                    {menuOpen ? (
                      <View style={styles.menu}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setMenuFor(null);
                            setReporting({ kind: 'rider', userId: m.user_id, rideId: m.ride_id, name: nameOf(m.user_id) });
                          }}
                          style={styles.smallBtn}>
                          <Text style={styles.smallBtnText}>Report Rider</Text>
                        </Pressable>
                        {!blocks.off ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setMenuFor(null);
                              confirmAndBlock(m.user_id, nameOf(m.user_id));
                            }}
                            style={styles.smallBtn}>
                            <Text style={styles.smallBtnText}>Block Rider</Text>
                          </Pressable>
                        ) : null}
                        {canClear ? (
                          <Pressable accessibilityRole="button" onPress={() => clear(m)} style={styles.smallBtn}>
                            <Text style={[styles.smallBtnText, { color: Colors.textSecondary }]}>Clear</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                    {lastInRun ? (
                      <View style={styles.meta}>
                        <Text style={styles.time}>{clock(m.sent_at)}</Text>
                        {self ? <SendBadge state="sent" iconOnly={m.id !== myLatestId || chat.pending.length > 0} /> : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}

          {chat.pending.map((p) => (
            <View key={p.localId} style={[styles.row, styles.rowMine, { marginTop: Spacing.three }]}>
              <View style={[styles.col, { alignItems: 'flex-end' }]}>
                {p.rideId && rideById.get(p.rideId) ? <RideTicket ride={rideById.get(p.rideId)!} compact /> : null}
                <View style={[styles.bubble, styles.bubbleMine, { borderBottomRightRadius: 6, opacity: p.state === 'sending' ? 0.6 : 1 }, p.state === 'failed' && styles.bubbleFailed]}>
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
            {picking ? (
              <View style={styles.picker}>
                <ThemedText type="smallBold" themeColor="textSecondary">Which Ride Is This About?</ThemedText>
                {mine.length ? (
                  mine.slice(0, 8).map((r) => (
                    <RideTicket
                      key={r.id}
                      ride={r}
                      selected={aboutRide === r.id}
                      wide
                      onPress={() => {
                        setAboutRide(r.id);
                        setPicking(false);
                      }}
                      accessibilityRole="radio"
                    />
                  ))
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Join or create a ride and you can talk about it here.
                  </ThemedText>
                )}
              </View>
            ) : null}
            <View style={styles.aboutRow}>
              {about ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`About ${about.name}. Tap to send it without a ride.`}
                  onPress={() => setAboutRide(null)}
                  style={[styles.aboutChip, { borderColor: PHASE_COLOR[ridePhase(about)] }]}>
                  <View style={[styles.aboutDot, { backgroundColor: PHASE_COLOR[ridePhase(about)] }]} />
                  <Text style={styles.aboutText} numberOfLines={1}>About {about.name}</Text>
                  <Icon name="close" size={14} color={Colors.textSecondary} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: picking }}
                  onPress={() => setPicking(!picking)}
                  style={styles.aboutChip}>
                  <Icon name="flag" size={14} color={Colors.sky} />
                  <Text style={[styles.aboutText, { color: Colors.sky }]}>{picking ? 'Not About a Ride' : 'About a Ride'}</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.inputRow}>
              <TextBox
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  if (localError) setLocalError(null);
                }}
                placeholder={`Message ${group?.name ?? 'the group'}`}
                placeholderTextColor={Colors.textSecondary}
                maxLength={MAX_MESSAGE_LENGTH}
                multiline
                accessibilityLabel="Message"
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={!draft.trim()}
                onPress={() => send()}
                style={({ pressed }) => [styles.send, !draft.trim() && { backgroundColor: Colors.backgroundSelected }, pressed && { opacity: 0.8 }]}>
                <View style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Icon name="chevron" color="#fff" size={24} strokeWidth={2.8} />
                </View>
              </Pressable>
            </View>
            {localError ? <Text style={styles.failText}>{localError}</Text> : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </SafeAreaView>
  );
}

/**
 * A ride as a ticket stub: the colour edge says riding now, coming up or done, and it opens the
 * ride (or narrows the chat to it).
 */
function RideTicket({
  ride, selected, compact, wide, onPress, accessibilityRole,
}: {
  ride: ChatRide;
  selected?: boolean;
  compact?: boolean;
  wide?: boolean;
  onPress?: () => void;
  accessibilityRole?: 'button' | 'radio';
}) {
  const color = PHASE_COLOR[ridePhase(ride)];
  const when = rideWhen(ride);
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      onLongPress={() => router.push(`/r/${ride.invite_code}`)}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'radio' ? { selected: !!selected } : undefined}
      accessibilityLabel={`${ride.name}, ${when}`}
      accessibilityHint={compact ? 'Show only the talk about this ride. Long press to open the ride.' : 'Long press to open the ride.'}
      style={[
        styles.ticket,
        { borderLeftColor: color },
        compact && styles.ticketCompact,
        wide && { alignSelf: 'stretch', maxWidth: '100%' },
        selected && { backgroundColor: Colors.border },
      ]}>
      <View style={styles.ticketNotch} />
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.ticketName, compact && { fontSize: 15 }]} numberOfLines={1}>{ride.name}</Text>
        <Text style={[styles.ticketWhen, { color }]} numberOfLines={1}>{when}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.one, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26, lineHeight: 28 },
  sub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  mute: { minHeight: 34, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center' },
  muteText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
  stripWrap: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  strip: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: 10, alignItems: 'center' },
  allChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: Colors.backgroundElement, justifyContent: 'center' },
  allChipOn: { backgroundColor: Colors.text },
  allChipText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 17 },
  focusBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: 8,
    backgroundColor: Colors.backgroundElement,
  },
  focusText: { flex: 1, color: Colors.textSecondary, fontFamily: font(600), fontSize: 14 },
  focusLink: { color: Colors.sky, fontFamily: font(700), fontSize: 14 },
  thread: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, flexGrow: 1 },
  day: {
    alignSelf: 'center', marginTop: Spacing.four, color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 15, letterSpacing: 0.4,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  rowMine: { justifyContent: 'flex-end' },
  avatarSlot: { width: 28 },
  col: { maxWidth: '80%', gap: 4, alignItems: 'flex-start' },
  sender: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13, marginLeft: 4 },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  bubbleMine: { backgroundColor: Colors.sky },
  bubbleTheirs: { backgroundColor: Colors.backgroundElement },
  bubbleFailed: { backgroundColor: '#5A2230' },
  body: { color: Colors.text, fontFamily: font(500), fontSize: 17, lineHeight: 23 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4 },
  time: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12 },
  failText: { color: Colors.danger, fontFamily: font(600), fontSize: 13 },
  smallBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Colors.backgroundSelected, justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontFamily: font(700), fontSize: 14 },
  menu: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  note: {
    backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: Colors.sky,
    padding: Spacing.three, gap: 4, marginTop: Spacing.three,
  },
  empty: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.five, paddingHorizontal: Spacing.two },
  emptyTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30 },
  starter: {
    borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
  },
  starterText: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 16 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, backgroundColor: Colors.background,
    paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.two, gap: Spacing.two,
  },
  picker: { gap: Spacing.two, paddingBottom: Spacing.one },
  aboutRow: { flexDirection: 'row' },
  aboutChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: Radius.pill,
    borderWidth: 1, borderColor: Colors.border, maxWidth: '100%',
  },
  aboutDot: { width: 8, height: 8, borderRadius: 4 },
  aboutText: { color: Colors.text, fontFamily: font(600), fontSize: 14, flexShrink: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: {
    flex: 1, minHeight: 46, maxHeight: 140, borderRadius: 23, backgroundColor: Colors.backgroundElement, color: Colors.text,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: font(500), fontSize: 17,
  },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  ticket: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, maxWidth: 240, paddingLeft: 12, paddingRight: 16, paddingVertical: 6,
    backgroundColor: Colors.backgroundSelected, borderRadius: 10, borderLeftWidth: 5, overflow: 'hidden',
  },
  ticketCompact: { minHeight: 0, paddingVertical: 5, maxWidth: 260 },
  // The punched hole of a ticket stub, cut into the right edge.
  ticketNotch: { position: 'absolute', right: -7, top: '50%', marginTop: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.background },
  ticketName: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 17, lineHeight: 20 },
  ticketWhen: { fontFamily: font(600), fontSize: 12 },
});
