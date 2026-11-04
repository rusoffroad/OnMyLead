import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ComposePrompt, FriendRows, ItemList, useItems } from '@/components/social/lists';
import { Social } from '@/components/social/parts';
import { TwoPane } from '@/components/two-pane';
import { Button, ErrorText, Screen, Segmented } from '@/components/ui';
import { Colors, font, themedStyles } from '@/constants/theme';
import { can } from '@/core/entitlements';
import { profileHref, SOCIAL_NOT_SWITCHED_ON, type SocialTab } from '@/core/social';
import { sideColumnWidth } from '@/core/layout';
import { useLayout } from '@/hooks/use-layout';
import { myRideName } from '@/lib/api';
import { useEntitlements } from '@/lib/entitlements';
import { refreshFriends, useFriends } from '@/lib/friends';
import { useSession } from '@/lib/session';
import { riderTimeline, socialFeed, SocialOffError } from '@/lib/social';
import { t } from '@/lib/i18n';

const PAGE = 25;

/**
 * Social: everything your friends (and riders you follow) have been up to, with likes and every
 * comment, your friends, and your own posts. Phones: one column with Activity / Friends / My Posts
 * tabs. Tablets and wide windows: you, the composer and your friends on the left, the feed on the
 * right, so you never lose your place switching between them.
 */
export default function SocialScreen() {
  const { session, loading } = useSession();
  const { ent } = useEntitlements();
  const layout = useLayout();
  const friends = useFriends();
  const me = session?.user.id ?? null;
  const pro = can(ent, 'social_posts');

  const [tab, setTab] = useState<SocialTab>('activity');
  const feed = useItems();
  const mine = useItems();
  const [name, setName] = useState('');
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { setItems: setFeed } = feed;
  const { setItems: setMine } = mine;
  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      setError(null);
      myRideName().then(setName).catch(() => {});
      refreshFriends();
      socialFeed(PAGE)
        .then((list) => {
          setFeed(list);
          setHasMore(list.length >= PAGE);
          setOff(false);
        })
        .catch((e) => {
          setFeed([]);
          if (e instanceof SocialOffError) setOff(true);
          else setError(e.message);
        });
      riderTimeline(session.user.id, PAGE).then(setMine).catch(() => setMine([]));
    }, [session, loading, setFeed, setMine]),
  );

  const more = async () => {
    const last = feed.items?.[feed.items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const older = await socialFeed(PAGE, last.at);
      setFeed([...(feed.items ?? []), ...older]);
      setHasMore(older.length >= PAGE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (!me) return <Screen><Stack.Screen options={{ title: t('Social') }} /></Screen>;

  const compose = off ? null : <ComposePrompt userId={me} name={name || 'You'} pro={pro} />;
  const activity = off ? (
    <Text style={styles.muted}>{SOCIAL_NOT_SWITCHED_ON}</Text>
  ) : feed.items == null ? null : (
    <ItemList
      items={feed.items}
      update={feed.update}
      remove={feed.remove}
      empty={t('Nothing here yet. When your friends ride, earn badges, share trails or post, it shows up here for you to like and comment on.')}
      more={hasMore ? more : undefined}
      loadingMore={loadingMore}
    />
  );
  const myPosts = mine.items == null ? null : (
    <ItemList
      items={mine.items}
      update={mine.update}
      remove={mine.remove}
      empty={pro ? 'Your posts, rides, badges and trails show here. Post a ride report to get started.' : 'Your rides, badges and trails show here. With Pro you can post ride reports and photos too.'}
    />
  );
  const freeNote = !pro && !off ? (
    <Text style={styles.free}>{t('On Free you can see everything and like it. Pro lets you post, comment and share to Facebook, Instagram and X.')}</Text>
  ) : null;

  if (layout.wide) {
    return (
      <>
        <Stack.Screen options={{ title: t('Social') }} />
        <TwoPane
          sideWidth={sideColumnWidth(layout.width)}
          side={
            <View style={{ gap: 18 }}>
              <Text style={styles.title} accessibilityRole="header">{t('Your Friends')}</Text>
              <FriendRows list={friends.list} limit={12} />
              <Button title={t('View Your Profile')} kind="secondary" onPress={() => router.push(profileHref(me) as never)} />
              {freeNote}
            </View>
          }
          main={
            <View style={{ gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
              {compose}
              <Segmented options={[{ value: 'activity', label: t('Activity') }, { value: 'mine', label: t('My Posts') }]} value={tab === 'friends' ? 'activity' : tab} onChange={setTab} />
              <ErrorText error={error} />
              {tab === 'mine' ? myPosts : activity}
            </View>
          }
        />
      </>
    );
  }

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: t('Social') }} />
      <View style={{ gap: 16 }}>
        {compose}
        <Segmented
          options={[{ value: 'activity', label: t('Activity') }, { value: 'friends', label: t('Friends') }, { value: 'mine', label: t('My Posts') }]}
          value={tab}
          onChange={setTab}
        />
        <ErrorText error={error} />
        {tab === 'activity' ? activity : tab === 'friends' ? <FriendRows list={friends.list} /> : myPosts}
        {tab !== 'friends' ? freeNote : null}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  title: { color: Colors.text, fontFamily: font(600, 'display'), fontSize: 24 },
  muted: { color: Social.muted, fontFamily: font(500), fontSize: 14, lineHeight: 20 },
  free: { color: Social.muted, fontFamily: font(500), fontSize: 13, lineHeight: 18, textAlign: 'center' },
}));
