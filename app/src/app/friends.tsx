import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, Share, Text, View } from 'react-native';

import { RiderDot } from '@/components/convoy';
import { ShareCodeEditor } from '@/components/share-code-editor';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { TwoPane } from '@/components/two-pane';
import { Button, ErrorText, Field, Screen, Section } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { mailUrl, smsUrl } from '@/core/discovery';
import {
  friendInviteMessage, friendLink, FRIENDS_NOT_SWITCHED_ON, readFriendCode, requestResultLine, splitFriends,
  type Friend, type FriendSuggestion,
} from '@/core/friends';
import { sideColumnWidth } from '@/core/layout';
import { codeTextSize, isMadeCode } from '@/core/share-code';
import { distanceLabel } from '@/core/out-riding';
import { useLayout } from '@/hooks/use-layout';
import { useBlocks } from '@/lib/blocks';
import { confirmAsync } from '@/lib/confirm';
import {
  friendSuggestions, myFriendCode, refreshFriends, removeFriend, resetFriendCode, respondFriendRequest, sendFriendRequest,
  useFriends,
} from '@/lib/friends';
import { useSession } from '@/lib/session';
import { setFriendCode } from '@/lib/share-codes';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

/** "Friends Since Oct 30", "Asked Oct 30". */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The code split in two so it reads aloud: "A1B2C 3D4E5". */
/** Made-up 10-character codes read easier in two halves; a code the rider typed shows as typed. */
const spaced = (code: string) => (isMadeCode(code) && code.length === 10 ? `${code.slice(0, 5)} ${code.slice(5)}` : code);

/**
 * Friends: requests to answer, your friends (the ones Out Riding near you first, with roughly how
 * far), requests you sent, riders you've ridden with to add, and your friend link for anyone else.
 * Nobody can search for riders by name: you add riders you know, or share your link. Phones: one
 * column, requests and friends above the friend link. Tablets and wide windows: your friend link
 * and add-by-code on the left, the lists on the right.
 */
export default function Friends() {
  const { session, loading } = useSession();
  const friends = useFriends();
  const blocks = useBlocks();
  const { wide, width } = useLayout();

  const [code, setCode] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadExtras = useCallback(() => {
    myFriendCode().then(setCode).catch(() => {});
    friendSuggestions().then(setSuggestions).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      refreshFriends();
      loadExtras();
    }, [session, loading, loadExtras]),
  );

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const msg = await fn();
      if (msg) setNote(msg);
      friendSuggestions().then(setSuggestions).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const shown = friends.list.filter((f) => !blocks.ids.has(f.user_id));
  const { received, friends: mine, sent } = splitFriends(shown);
  const out = mine.filter((f) => f.out_now).length;
  const link = code ? friendLink(WEB_URL, code) : null;
  const message = code ? friendInviteMessage(code, link) : '';

  const share = async (how: 'sheet' | 'text' | 'email') => {
    if (!code) return;
    if (how === 'sheet') return Share.share({ message });
    const url = how === 'text' ? smsUrl(message, Platform.OS) : mailUrl('Add me on OnMyLead', message);
    await Linking.openURL(url).catch(() => Share.share({ message }));
  };

  const typedCode = readFriendCode(typed);

  const head = (
    <>
      {friends.off ? (
        <View style={styles.note}>
          <ThemedText type="smallBold">Not Switched On Yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{FRIENDS_NOT_SWITCHED_ON}</ThemedText>
        </View>
      ) : null}

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{mine.length ? `${mine.length} ${mine.length === 1 ? 'Friend' : 'Friends'}` : 'Your Riding Friends'}</Text>
        <ThemedText type="small" themeColor="textSecondary">
          {out
            ? `${out} out riding near you right now.`
            : 'Friends see each other in Out Riding and can message any time. Nobody sees where you are.'}
        </ThemedText>
      </View>
    </>
  );

  const linkCards = (
    <>

      <View style={styles.linkCard}>
        <ThemedText type="heading" style={{ fontSize: 20 }}>Your Friend Link</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Send it to a riding buddy. They open it, and you’re friends once you accept.
        </ThemedText>
        {code ? (
          <View style={styles.codeBox}>
            <Text style={[styles.code, codeTextSize(spaced(code), 34)]} numberOfLines={1} accessibilityLabel={`Friend code ${code.split('').join(' ')}`} selectable>{spaced(code)}</Text>
          </View>
        ) : null}
        <Button title="Share Friend Link" disabled={!code} onPress={() => share('sheet')} style={{ backgroundColor: Colors.sky }} />
        <View style={styles.btnRow}>
          <Button title="Text" kind="secondary" style={{ flex: 1 }} disabled={!code} onPress={() => share('text')} />
          <Button title="Email" kind="secondary" style={{ flex: 1 }} disabled={!code} onPress={() => share('email')} />
          <Button
            title={copied ? 'Copied' : 'Copy'}
            kind="secondary"
            style={{ flex: 1 }}
            disabled={!code}
            onPress={async () => {
              await Clipboard.setStringAsync(link ?? code ?? '');
              setCopied(true);
            }}
          />
        </View>
        {code ? (
          <ShareCodeEditor
            kind="friend"
            current={code}
            note="Your old link and code stop working. Your friends stay friends."
            save={setFriendCode}
            onSaved={(c) => {
              setCode(c);
              setCopied(false);
            }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            if (!(await confirmAsync('Make a new link?', 'Your old link and code stop working. Your friends stay friends.', 'New Link'))) return;
            act('reset', async () => {
              setCode(await resetFriendCode());
              setCopied(false);
            });
          }}
          style={{ minHeight: 40, justifyContent: 'center' }}>
          <ThemedText type="small" style={{ color: Colors.sky, fontWeight: 600 }}>Make a New Link</ThemedText>
        </Pressable>
      </View>

      <View style={styles.linkCard}>
        <Field
          label="Got a Friend Code?"
          hint="Paste their friend link or type their code."
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="A1B2C 3D4E5"
          returnKeyType="go"
          onSubmitEditing={() => typedCode && router.push(`/friend/${typedCode}`)}
        />
        <Button
          title="Look Up"
          kind="secondary"
          disabled={!typedCode}
          onPress={() => {
            if (!typedCode) return;
            setTyped('');
            router.push(`/friend/${typedCode}`);
          }}
        />
      </View>
    </>
  );

  const row = (f: Friend | FriendSuggestion, line: string, actions: ReactNode, onPress?: () => void) => (
    <View key={f.user_id} style={styles.row}>
      <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={styles.rowMain}>
        <View>
          <RiderDot userId={f.user_id} name={f.display_name} size={42} zoom />
          {'out_now' in f && f.out_now ? <View style={styles.outBadge} /> : null}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{f.display_name}</Text>
          <Text style={[styles.line, 'out_now' in f && f.out_now && { color: RideColors.green }]} numberOfLines={1}>{line}</Text>
        </View>
      </Pressable>
      <View style={styles.rowActions}>{actions}</View>
    </View>
  );

  const main = (
    <>
      {note ? <Text style={styles.done}>{note}</Text> : null}
      <ErrorText error={error} />

      {received.length ? (
        <>
          <Section title="Friend Requests" />
          {received.map((f) =>
            row(f, `Asked ${shortDate(f.since)}`, (
              <>
                <Button title="Accept" loading={busy === `yes-${f.user_id}`} style={styles.small} onPress={() => act(`yes-${f.user_id}`, async () => {
                  await respondFriendRequest(f.user_id, true);
                  return `You and ${f.display_name} are friends now.`;
                })} />
                <Button title="Decline" kind="ghost" loading={busy === `no-${f.user_id}`} style={styles.small} onPress={() => act(`no-${f.user_id}`, () => respondFriendRequest(f.user_id, false))} />
              </>
            )),
          )}
        </>
      ) : null}

      <Section title="Friends" />
      {friends.loaded && !mine.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          No friends yet. Add riders you’ve ridden with below, or send your friend link.
        </ThemedText>
      ) : null}
      {mine.map((f) =>
        row(
          f,
          f.out_now ? `Out Riding, ${distanceLabel(f.miles ?? 0)}${f.spot ? `, at ${f.spot}` : ''}` : `Friends Since ${shortDate(f.since)}`,
          (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Message ${f.display_name}`}
                onPress={() => router.push(`/messages/${f.user_id}`)}
                style={({ pressed }) => [styles.msgBtn, pressed && { opacity: 0.8 }]}>
                <Icon name="mail" color="#fff" size={20} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${f.display_name}`}
                hitSlop={6}
                onPress={async () => {
                  if (!(await confirmAsync(`Remove ${f.display_name}?`, 'You’ll stop being friends. They aren’t told.', 'Remove'))) return;
                  act(`rm-${f.user_id}`, () => removeFriend(f.user_id));
                }}
                style={styles.iconBtn}>
                <Icon name="close" color={Colors.textSecondary} size={20} />
              </Pressable>
            </>
          ),
          () => router.push(`/messages/${f.user_id}`),
        ),
      )}

      {sent.length ? (
        <>
          <Section title="Requests You Sent" />
          {sent.map((f) =>
            row(f, `Waiting Since ${shortDate(f.since)}`, (
              <Button title="Cancel" kind="ghost" loading={busy === `rm-${f.user_id}`} style={styles.small} onPress={() => act(`rm-${f.user_id}`, () => removeFriend(f.user_id))} />
            )),
          )}
        </>
      ) : null}

      {suggestions.length ? (
        <>
          <Section title="Riders You Know" />
          {suggestions.filter((s) => !blocks.ids.has(s.user_id)).map((s) =>
            row(s, s.reason, (
              <Button title="Add" loading={busy === `add-${s.user_id}`} style={[styles.small, { backgroundColor: RideColors.green }]} onPress={() => act(`add-${s.user_id}`, async () =>
                requestResultLine(await sendFriendRequest(s.user_id), s.display_name))} />
            )),
          )}
        </>
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Friends' }} />
      {wide ? (
        <TwoPane side={<>{head}{linkCards}</>} main={main} sideWidth={sideColumnWidth(width)} />
      ) : (
        // Phones: requests and friends first, then the friend link (first when there are no friends yet).
        <Screen>
          {head}
          {mine.length || received.length ? <>{main}{linkCards}</> : <>{linkCards}{main}</>}
        </Screen>
      )}
    </>
  );
}

const styles = themedStyles(() => ({
  note: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: Colors.sky, padding: Spacing.three, gap: 4 },
  hero: { gap: 6, paddingTop: Spacing.two },
  heroTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 42, letterSpacing: -0.4 },
  linkCard: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.two },
  // The dashed box is a View around the code: iOS mis-sizes text that carries its own border and padding.
  codeBox: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radius.control, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.border, alignItems: 'center' },
  code: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 34, letterSpacing: 3, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: Spacing.two },
  done: { color: RideColors.green, fontFamily: font(700), fontSize: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: Colors.backgroundElement,
    borderRadius: Radius.card, paddingVertical: 12, paddingHorizontal: 14,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  outBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 15, height: 15, borderRadius: 8,
    backgroundColor: RideColors.green, borderWidth: 3, borderColor: Colors.backgroundElement,
  },
  name: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 21, lineHeight: 24 },
  line: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  small: { minHeight: 42, paddingHorizontal: 14 },
  msgBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.sky, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
}));
