import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { BLOCKS_NOT_SWITCHED_ON } from '@/core/blocks';
import { initialOf } from '@/core/profile';
import { loadBlocks, unblockRider, useBlocks } from '@/lib/blocks';
import { useSession } from '@/lib/session';

/** Blocked Riders: everyone this rider blocked, by ride name, each with Unblock. */
export default function BlockedRiders() {
  const { session, loading } = useSession();
  const me = session?.user.id ?? null;
  const blocks = useBlocks();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/sign-in');
  }, [loading, session]);

  useFocusEffect(
    useCallback(() => {
      if (me) loadBlocks(me, true);
    }, [me]),
  );

  const unblock = async (userId: string) => {
    setBusy(userId);
    setError(null);
    try {
      await unblockRider(userId);
    } catch (e) {
      setError(`Couldn’t unblock them. ${e instanceof Error ? e.message : 'Try again.'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        You don’t see their messages in ride chat or group chat, or get chat notifications from them. They aren’t told.
        Need Help and EMERGENCY alerts from a ride you’re on always come through.
      </ThemedText>
      <ErrorText error={error} />
      {blocks.off ? (
        <View style={styles.note}>
          <ThemedText type="smallBold">Not Switched On Yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{BLOCKS_NOT_SWITCHED_ON}</ThemedText>
        </View>
      ) : !blocks.loaded ? (
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      ) : !blocks.list.length ? (
        <View style={styles.note}>
          <ThemedText type="smallBold">Nobody Blocked</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            To block a rider, tap them in a ride’s Going list, or long press one of their messages.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.list}>
          {blocks.list.map((b, i) => (
            <View key={b.userId} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.dot}>
                <Text style={styles.initial}>{initialOf(b.name)}</Text>
              </View>
              <ThemedText style={{ flex: 1, fontWeight: 600 }} numberOfLines={1}>{b.name}</ThemedText>
              <Button
                title="Unblock"
                kind="secondary"
                loading={busy === b.userId}
                accessibilityLabel={`Unblock ${b.name}`}
                onPress={() => unblock(b.userId)}
              />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { gap: 4, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  list: { borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundElement },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: Colors.backgroundSelected },
  dot: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
  initial: { color: Colors.textSecondary, fontFamily: font(800), fontSize: 16 },
});
