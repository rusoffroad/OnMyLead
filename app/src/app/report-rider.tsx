import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ReportSheet } from '@/components/report-sheet';
import { ThemedText } from '@/components/themed-text';
import { ErrorText, Field, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { DmThread } from '@/core/out-riding';
import type { FriendSuggestion } from '@/core/friends';
import { reportablePeople } from '@/core/moderation';
import { initialOf } from '@/core/profile';
import { loadBlocks, useBlocks } from '@/lib/blocks';
import { friendSuggestions, useFriends } from '@/lib/friends';
import { myDmThreads } from '@/lib/out-riding';
import { useSession } from '@/lib/session';

/**
 * You > Report a Rider: report someone without finding the ride or chat first. Lists riders this
 * rider has messaged, friended, ridden with or blocked, each opening the usual report sheet.
 * There is no search of all riders, so nobody can be looked up by name (same rule as Friends).
 */
export default function ReportRider() {
  const { session, loading } = useSession();
  const me = session?.user.id ?? null;
  const friends = useFriends();
  const blocks = useBlocks();
  const [dms, setDms] = useState<DmThread[]>([]);
  const [known, setKnown] = useState<FriendSuggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reporting, setReporting] = useState<ComponentProps<typeof ReportSheet>['target']>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/sign-in');
  }, [loading, session]);

  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      let live = true;
      loadBlocks(me);
      // Each list is optional: a server without Out Riding or Friends just leaves that part out.
      Promise.allSettled([myDmThreads(), friendSuggestions()]).then(([d, k]) => {
        if (!live) return;
        setDms(d.status === 'fulfilled' ? d.value : []);
        setKnown(k.status === 'fulfilled' ? k.value : []);
        setError(d.status === 'rejected' && k.status === 'rejected' ? 'Couldn’t load your riders. Check your connection and try again.' : null);
        setLoaded(true);
      });
      return () => { live = false; };
    }, [me]),
  );

  const sections = useMemo(
    () => reportablePeople({ me, dms, friends: friends.list, known, blocked: blocks.list, query }),
    [me, dms, friends.list, known, blocks.list, query],
  );

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Pick who you want to report for harassment, threats or anything else that breaks the rider rules. It goes to the
        OnMyLead team. They aren’t told who reported them. If anyone is in danger, call 911.
      </ThemedText>
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="Rider name" autoCorrect={false} returnKeyType="search" />
      <ErrorText error={error} />
      {!loaded ? (
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      ) : !sections.length ? (
        <View style={styles.note}>
          <ThemedText type="smallBold">{query ? 'No Riders Match' : 'Nobody to Report Yet'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Riders you’ve messaged, ridden with, added as friends or blocked show here. You can also report a rider from their
            message, a ride’s Going list or Out Riding.
          </ThemedText>
        </View>
      ) : (
        sections.map((s) => (
          <View key={s.title} style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold" themeColor="textSecondary">{s.title}</ThemedText>
            <View style={styles.list}>
              {s.people.map((p, i) => (
                <Pressable
                  key={p.userId}
                  style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: Colors.backgroundSelected }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Report ${p.name}`}
                  onPress={() => setReporting({ kind: 'rider', userId: p.userId, name: p.name, source: 'you' })}>
                  <View style={styles.dot}><Text style={styles.initial}>{initialOf(p.name)}</Text></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText style={{ fontWeight: 600 }} numberOfLines={1}>{p.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{p.detail}</ThemedText>
                  </View>
                  <Icon name="flagged" size={20} color={Colors.textSecondary} />
                </Pressable>
              ))}
            </View>
          </View>
        ))
      )}
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { gap: 4, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  list: { borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundElement },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: Colors.backgroundSelected },
  dot: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
  initial: { color: Colors.textSecondary, fontFamily: font(800), fontSize: 16 },
});
