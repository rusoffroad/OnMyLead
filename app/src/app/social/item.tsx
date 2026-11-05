import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { KeyboardScreen, keyboardScroll, TextBox } from '@/components/keyboard';
import { ReportSheet } from '@/components/report-sheet';
import { RiderPhoto } from '@/components/rider-photo';
import { faceColor, Initial } from '@/components/home/parts';
import { ProTag, Social } from '@/components/social/parts';
import { SocialCard } from '@/components/social/social-card';
import { Colors, font, scrollIndicator, themedStyles } from '@/constants/theme';
import { Button } from '@/components/ui';
import { can } from '@/core/entitlements';
import { timeAgo } from '@/core/feed';
import { COMMENT_MAX, isItemKey, likesLine, profileHref, SOCIAL_NOT_SWITCHED_ON, type Comment, type SocialItem } from '@/core/social';
import { useLayout } from '@/hooks/use-layout';
import { confirmAsync } from '@/lib/confirm';
import { useEntitlements } from '@/lib/entitlements';
import { requirePro } from '@/lib/pro';
import { useSession } from '@/lib/session';
import { addComment, deleteComment, feedItem, itemComments, itemLikers, ProNeededError, SocialOffError } from '@/lib/social';
import { t } from '@/lib/i18n';

/**
 * One Feed item with every comment and who liked it, opened from the Feed, Social, a profile or a
 * notification. Pro riders write comments in the box at the bottom (it rides up with the keyboard);
 * Free riders read them and see what Pro adds. A comment's writer can delete it, and so can the
 * rider whose item it's on; anyone else can report it.
 */
export default function SocialItemScreen() {
  const params = useLocalSearchParams<{ key?: string; comment?: string }>();
  const key = isItemKey(params.key) ? params.key : null;
  const { session, loading } = useSession();
  const { ent } = useEntitlements();
  const layout = useLayout();
  const pro = can(ent, 'social_posts');

  const [item, setItem] = useState<SocialItem | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likers, setLikers] = useState<{ userId: string; name: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const [reporting, setReporting] = useState<Comment | null>(null);
  const input = useRef<TextInput>(null);
  const scroller = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!key) return setItem(null);
    try {
      const [it, cs] = await Promise.all([feedItem(key), itemComments(key)]);
      setItem(it);
      setComments(cs);
      itemLikers(key).then(setLikers).catch(() => {});
    } catch (e) {
      if (e instanceof SocialOffError) setOff(true);
      else setError((e as Error).message);
      setItem(null);
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      load().then(() => {
        if (params.comment && pro) setTimeout(() => input.current?.focus(), 250);
      });
    }, [session, loading, load, params.comment, pro]),
  );

  // Opened from a notification while the app was still waking up and the request got dropped:
  // try again on its own once the app is in front, so the Retry button is the last resort.
  const failed = item === null && !!error;
  useEffect(() => {
    if (!failed) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setError(null);
        setItem(undefined);
        load();
      }
    });
    return () => sub.remove();
  }, [failed, load]);

  const send = async () => {
    if (!key || !draft.trim()) return;
    if (!requirePro('social_posts')) return;
    setSending(true);
    setError(null);
    try {
      await addComment(key, draft);
      setDraft('');
      setComments(await itemComments(key));
      setItem((it) => (it ? { ...it, commentCount: it.commentCount + 1 } : it));
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      if (!(e instanceof ProNeededError)) setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const remove = async (c: Comment) => {
    const ok = await confirmAsync(t('Delete This Comment?'), c.mine ? t('It comes off for everyone.') : t('{authorName}’s comment comes off your post for everyone.', { authorName: c.authorName }), t('Delete'));
    if (!ok) return;
    try {
      await deleteComment(c.id);
      setComments((list) => list.filter((x) => x.id !== c.id));
      setItem((it) => (it ? { ...it, commentCount: Math.max(0, it.commentCount - 1) } : it));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/social'));
  // Everyone who liked it but you: "You and 3 others like this" already says you did.
  const others = likers.filter((l) => l.userId !== session?.user.id).map((l) => l.name);
  const firstLiker = others[0];

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.page}>
      <Stack.Screen options={{ headerShown: false, title: t('Post') }} />
      <View style={[styles.column, layout.wide && { maxWidth: 720 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} hitSlop={12} onPress={back} style={styles.back}>
            <Icon name="back" color={Colors.text} size={26} />
          </Pressable>
          <Text style={styles.headTitle} accessibilityRole="header">{item?.kind === 'post' ? t('Post') : t('Activity')}</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/social')} hitSlop={8}>
            <Text style={styles.headLink}>{t('Social')}</Text>
          </Pressable>
        </View>

        <KeyboardScreen>
          <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={styles.body} {...keyboardScroll} indicatorStyle={scrollIndicator()}>
            {off ? <Text style={styles.muted}>{SOCIAL_NOT_SWITCHED_ON}</Text> : null}
            {item === null && !off ? (
              <>
                <Text style={styles.muted}>{error ?? 'This isn’t available anymore. It may have been deleted, or the rider changed who sees their activity.'}</Text>
                {error ? <Button title={t('Retry')} kind="secondary" onPress={() => { setError(null); setItem(undefined); void load(); }} /> : null}
              </>
            ) : null}
            {item ? (
              <>
                <SocialCard item={item} onChange={setItem} onDeleted={back} full />
                {item.likeCount ? (
                  <Text style={styles.likes}>
                    {item.liked || item.likeCount > 1 || !firstLiker ? likesLine(item.likeCount, item.liked) : likesLine(1, false, firstLiker)}
                    {others.length > 1 || (item.liked && others.length) ? `: ${others.slice(0, 5).join(', ')}${others.length > 5 ? ` and ${others.length - 5} more` : ''}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.section} accessibilityRole="header">
                  {comments.length ? `${comments.length} ${comments.length === 1 ? t('Comment') : t('Comments')}` : t('Comments')}
                </Text>
                {comments.length ? (
                  <View style={{ gap: 14 }}>
                    {comments.map((c) => (
                      <View key={c.id} style={styles.comment}>
                        <RiderPhoto userId={c.authorId} name={c.authorName} size={34} fallback={<Initial name={c.authorName} size={34} color={faceColor(c.authorId)} />} />
                        <View style={styles.bubble}>
                          <View style={styles.commentHead}>
                            <Pressable onPress={() => router.push(profileHref(c.authorId) as never)} accessibilityRole="link" style={{ flexShrink: 1 }}>
                              <Text style={styles.commentName} numberOfLines={1}>{c.mine ? t('You') : c.authorName}</Text>
                            </Pressable>
                            <Text style={styles.commentWhen}>{timeAgo(c.at)}</Text>
                          </View>
                          <Text style={styles.commentBody} selectable>{t(c.body)}</Text>
                          <View style={styles.commentActions}>
                            {c.canDelete ? (
                              <Pressable onPress={() => remove(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Delete comment')}>
                                <Text style={styles.commentAction}>{t('Delete')}</Text>
                              </Pressable>
                            ) : null}
                            {!c.mine ? (
                              <Pressable onPress={() => setReporting(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Report {authorName}’s comment', { authorName: c.authorName })}>
                                <Text style={styles.commentAction}>{t('Report')}</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.muted}>{pro ? t('No comments yet. Say something.') : t('No comments yet.')}</Text>
                )}
              </>
            ) : null}
          </ScrollView>

          {item && item.key ? (
            pro ? (
              <View style={styles.composer}>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.inputRow}>
                  <TextBox
                    ref={input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={t('Comment on {v} {v2}', { v: item.mine ? 'your' : `${item.actorName}’s`, v2: item.kind === 'post' ? 'post' : item.kind })}
                    placeholderTextColor={Colors.textSecondary}
                    maxLength={COMMENT_MAX}
                    multiline
                    accessibilityLabel={t('Comment')}
                    style={styles.input}
                    onSubmitEditing={Platform.OS === 'web' ? send : undefined}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Post comment')}
                    disabled={!draft.trim() || sending}
                    onPress={send}
                    style={({ pressed }) => [styles.send, (!draft.trim() || sending) && { backgroundColor: Colors.backgroundSelected }, pressed && { opacity: 0.8 }]}>
                    <View style={{ transform: [{ rotate: '-90deg' }] }}>
                      <Icon name="chevron" color={(!draft.trim() || sending) ? Colors.textSecondary : '#fff'} size={24} strokeWidth={2.8} />
                    </View>
                  </Pressable>
                </View>
                {draft.length > COMMENT_MAX - 60 ? <Text style={styles.count}>{t('{v} left', { v: COMMENT_MAX - draft.length })}</Text> : null}
              </View>
            ) : (
              <Pressable onPress={() => requirePro('social_posts')} accessibilityRole="button" style={styles.locked}>
                <ProTag />
                <Text style={styles.lockedText}>{t('Commenting is part of OnMyLead Pro. Reading and liking stay free.')}</Text>
                <Icon name="chevron" size={18} color={Social.gold} />
              </Pressable>
            )
          ) : null}
        </KeyboardScreen>
      </View>
      <ReportSheet
        target={reporting ? { kind: 'rider', userId: reporting.authorId, name: reporting.authorName, source: 'comment', commentId: reporting.id } : null}
        onClose={() => setReporting(null)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  page: { flex: 1, backgroundColor: Colors.background },
  column: { flex: 1, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, color: Colors.text, fontFamily: font(700, 'display'), fontSize: 24 },
  headLink: { color: Colors.sky, fontFamily: font(600), fontSize: 15, paddingHorizontal: 8 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  muted: { color: Social.muted, fontFamily: font(500), fontSize: 14, lineHeight: 20 },
  likes: { color: Colors.textSoft, fontFamily: font(600), fontSize: 14, lineHeight: 19 },
  section: { color: Colors.text, fontFamily: font(600, 'display'), fontSize: 22, marginTop: 4 },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bubble: { flex: 1, backgroundColor: Social.panel, borderRadius: 16, borderTopLeftRadius: 4, borderWidth: 1, borderColor: Social.line, padding: 12, gap: 4 },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { color: Colors.text, fontFamily: font(700), fontSize: 14 },
  commentWhen: { color: Social.muted, fontFamily: font(500), fontSize: 12 },
  commentBody: { color: Colors.text, fontFamily: font(500), fontSize: 15, lineHeight: 21 },
  commentActions: { flexDirection: 'row', gap: 18, paddingTop: 2 },
  commentAction: { color: Social.muted, fontFamily: font(600), fontSize: 12 },
  composer: { borderTopWidth: 1, borderTopColor: Social.line, padding: 10, gap: 6, backgroundColor: Colors.background },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, backgroundColor: Colors.backgroundSelected, color: Colors.text,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: font(500), fontSize: 16,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  count: { color: Social.muted, fontFamily: font(500), fontSize: 12, textAlign: 'right' },
  error: { color: Colors.danger, fontFamily: font(600), fontSize: 13 },
  locked: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, margin: 10, borderRadius: 16,
    backgroundColor: 'rgba(230,194,122,0.08)', borderWidth: 1, borderColor: 'rgba(230,194,122,0.35)',
  },
  lockedText: { flex: 1, color: Colors.text, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
}));
