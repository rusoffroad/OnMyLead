import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { AddFriendButton } from '@/components/add-friend-button';
import { faceColor, Initial } from '@/components/home/parts';
import { ReportSheet } from '@/components/report-sheet';
import { RiderPhoto } from '@/components/rider-photo';
import { ComposePrompt, ItemList, useItems } from '@/components/social/lists';
import { ProTag, Social } from '@/components/social/parts';
import { TwoPane } from '@/components/two-pane';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, themedStyles } from '@/constants/theme';
import { can } from '@/core/entitlements';
import { sideColumnWidth } from '@/core/layout';
import { sinceLine, SOCIAL_NOT_SWITCHED_ON, statLine, type RiderProfile } from '@/core/social';
import { useLayout } from '@/hooks/use-layout';
import { useEntitlements } from '@/lib/entitlements';
import { useSession } from '@/lib/session';
import { riderProfile, riderTimeline, SocialOffError } from '@/lib/social';

/**
 * A rider's profile: their picture big (tap it for full size), name, the Pro tag if they have Pro,
 * their totals, and their posts, rides, badges and trails, newest first. Riders only see someone's
 * activity when that rider's "Who Sees Your Activity" setting allows it; everyone signed in sees
 * the name and picture, as in a ride's rider list. Tablets: the profile on the left, the timeline
 * on the right.
 */
export default function RiderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useSession();
  const { ent } = useEntitlements();
  const layout = useLayout();
  const [profile, setProfile] = useState<RiderProfile | null | undefined>(undefined);
  const timeline = useItems();
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const { setItems } = timeline;
  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      if (!id) return;
      riderProfile(id)
        .then((p) => {
          setProfile(p);
          if (p?.canSee) riderTimeline(id, 30).then(setItems).catch(() => setItems([]));
          else setItems([]);
        })
        .catch((e) => {
          if (e instanceof SocialOffError) setOff(true);
          else setError(e.message);
          setProfile(null);
        });
    }, [session, loading, id, setItems]),
  );

  const title = profile?.me ? 'Your Profile' : profile?.name ?? 'Rider';
  if (!profile) {
    return (
      <Screen width="readable">
        <Stack.Screen options={{ title: '' }} />
        {off ? <Text style={styles.muted}>{SOCIAL_NOT_SWITCHED_ON}</Text> : <ErrorText error={error} />}
      </Screen>
    );
  }

  const head = (
    <View style={styles.head}>
      <View style={styles.ring}>
        <RiderPhoto userId={profile.id} name={profile.name} size={120} fallback={<Initial name={profile.name} size={120} color={faceColor(profile.id)} />} />
      </View>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={2}>{profile.name}</Text>
        {profile.pro ? <ProTag size="large" /> : null}
      </View>
      {sinceLine(profile.since) ? <Text style={styles.since}>{sinceLine(profile.since)}</Text> : null}
      {profile.canSee && !profile.blocked ? (
        <View style={styles.stats}>
          {statLine(profile).map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.buttons}>
        {profile.me ? (
          <Button title="Edit Name and Picture" kind="secondary" onPress={() => router.push('/ride-name')} style={styles.button} />
        ) : profile.blocked ? null : (
          <>
            {profile.relation === 'friends' ? (
              <Button title="Message" onPress={() => router.push(`/messages/${profile.id}` as never)} style={styles.button} />
            ) : null}
            <AddFriendButton userId={profile.id} name={profile.name} style={styles.button} />
            <Button title="Report" kind="ghost" onPress={() => setReporting(true)} style={styles.button} />
          </>
        )}
      </View>
    </View>
  );

  const body = profile.blocked ? (
    <Text style={styles.muted}>You and {profile.name} can’t see each other’s activity. Unblock them from You, Blocked Riders.</Text>
  ) : !profile.canSee ? (
    <Text style={styles.muted}>{profile.name} shares rides, badges and posts with their friends. Become friends to see them here.</Text>
  ) : timeline.items == null ? null : (
    <View style={{ gap: 14 }}>
      {profile.me ? <ComposePrompt userId={profile.id} name={profile.name} pro={can(ent, 'social_posts')} /> : null}
      <ItemList
        items={timeline.items}
        update={timeline.update}
        remove={timeline.remove}
        empty={profile.me ? 'Nothing here yet. Your posts, rides, badges and trails show here.' : `Nothing from ${profile.name} in the last year yet.`}
      />
    </View>
  );

  const report = (
    <ReportSheet
      target={reporting ? { kind: 'rider', userId: profile.id, name: profile.name, source: 'profile' } : null}
      onClose={() => setReporting(false)}
    />
  );

  if (layout.wide) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <TwoPane sideWidth={sideColumnWidth(layout.width)} side={head} main={<View style={{ maxWidth: 680, width: '100%', alignSelf: 'center' }}>{body}</View>} />
        {report}
      </>
    );
  }
  return (
    <Screen width="readable">
      <Stack.Screen options={{ title }} />
      <View style={{ gap: 24 }}>
        {head}
        {body}
      </View>
      {report}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  head: { alignItems: 'center', gap: 10, paddingTop: 8 },
  ring: { padding: 5, borderRadius: 70, borderWidth: 2, borderColor: 'rgba(229,38,46,0.7)' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  name: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 36, lineHeight: 40, textAlign: 'center' },
  since: { color: Social.muted, fontFamily: font(500), fontSize: 14 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 6, alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: Social.panel, borderWidth: 1, borderColor: Social.line },
  statValue: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 32 },
  statLabel: { color: Social.muted, fontFamily: font(600), fontSize: 12 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch', marginTop: 6 },
  button: { flexGrow: 1, flexBasis: 140 },
  muted: { color: Social.muted, fontFamily: font(500), fontSize: 15, lineHeight: 21, textAlign: 'center' },
}));
