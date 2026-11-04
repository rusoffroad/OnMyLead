import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RiderDot } from '@/components/convoy';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { dayLabel, unreadLabel } from '@/core/group-chat';
import { dmPreview, NOT_SWITCHED_ON, type DmThread } from '@/core/out-riding';
import { myDmThreads, OutRidingOffError } from '@/lib/out-riding';
import { useSession } from '@/lib/session';
import { t as tr } from '@/lib/i18n';

const when = (iso: string | null) => {
  if (!iso) return '';
  const day = dayLabel(iso);
  return day === tr('Today') ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : day;
};

/**
 * Messages: your direct message conversations, newest first. Riders you blocked aren't listed.
 * Start one from Out Riding, or from a rider you've ridden with.
 */
export default function Messages() {
  const { session, loading } = useSession();
  const me = session?.user.id;
  const [threads, setThreads] = useState<DmThread[] | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      const load = () =>
        myDmThreads()
          .then((t) => {
            setThreads(t);
            setOff(false);
          })
          .catch((e) => (e instanceof OutRidingOffError ? setOff(true) : setError((e as Error).message)));
      load();
      const t = setInterval(load, 30_000);
      return () => clearInterval(t);
    }, [session, loading]),
  );

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: tr('Messages') }} />
      {off ? (
        <View style={styles.note}>
          <ThemedText type="smallBold">{tr('Not Switched On Yet')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{NOT_SWITCHED_ON}</ThemedText>
        </View>
      ) : null}
      <ErrorText error={error} />

      {threads && !threads.length ? (
        <View style={styles.empty}>
          <Icon name="mail" color={Colors.sky} size={34} />
          <Text style={styles.emptyTitle}>{tr('No Messages Yet')}</Text>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 320 }}>
            {tr('Switch on Out Riding to see who’s out near you, then tap a rider to message them.')}
          </ThemedText>
          <Button title={tr('Open Out Riding')} onPress={() => router.push('/out-riding')} />
        </View>
      ) : null}

      {threads?.length ? (
        <View style={styles.list}>
          {threads.map((t, i) => {
            const unread = t.muted ? null : unreadLabel(t.unread);
            return (
              <Pressable
                key={t.thread_id}
                accessibilityRole="button"
                accessibilityLabel={`${t.other_name}${unread ? `, ${unread}` : ''}${t.muted ? tr(', muted') : ''}`}
                onPress={() => router.push(`/messages/${t.other_id}`)}
                style={({ pressed }) => [styles.row, i > 0 && styles.rule, pressed && { backgroundColor: Colors.backgroundSelected }]}>
                <RiderDot userId={t.other_id} name={t.other_name} size={42} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.top}>
                    <Text style={styles.name} numberOfLines={1}>{t.other_name}</Text>
                    <Text style={styles.time}>{when(t.last_at)}</Text>
                  </View>
                  <View style={styles.top}>
                    <Text style={[styles.preview, unread ? { color: Colors.text } : null]} numberOfLines={1}>{dmPreview(t, me)}</Text>
                    {unread ? <Text style={styles.unread}>{unread}</Text> : t.muted ? <Text style={styles.time}>{tr('Muted')}</Text> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  note: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.control, borderLeftWidth: 4, borderLeftColor: Colors.sky, padding: Spacing.three, gap: 4 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  emptyTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30 },
  list: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 68 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1, color: Colors.text, fontFamily: font(800, 'display'), fontSize: 21 },
  time: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  preview: { flex: 1, color: Colors.textSecondary, fontFamily: font(500), fontSize: 15 },
  unread: {
    color: '#fff', backgroundColor: Colors.accent, fontFamily: font(700), fontSize: 12, overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill,
  },
}));
