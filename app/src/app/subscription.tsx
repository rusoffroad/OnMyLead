import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { useEntitlements } from '@/lib/entitlements';
import { manageSubscription, redeemOfferCode, restore } from '@/lib/purchases';
import { useSession } from '@/lib/session';
import { PlanStatus } from '@/components/pro-plan';
import { deviceStore, manageTarget, otherStoreBlock, restoreMessage } from '@/core/purchases';

/** Profile > Settings > Subscription: your plan, this month's rides, and the store's subscription controls. */
export default function SubscriptionScreen() {
  const { session, loading } = useSession();
  const { ent, refresh } = useEntitlements();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/sign-in');
  }, [loading, session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The App Store on iPhone and iPad, Google Play on Android, nothing on the website.
  const store = deviceStore(Platform.OS);
  const notYet = 'Subscriptions are managed in the OnMyLead app for iPhone, iPad and Android.';
  const google = store === 'google';

  async function run(key: string, fn: () => Promise<string | null>) {
    setBusy(key);
    setNote(null);
    try {
      setNote(await fn());
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const upgrade = ent.switchedOn && ent.accountType !== 'admin' && ent.proSource !== 'apple' && ent.proSource !== 'google' && ent.proSource !== 'comp'
    && !(store && otherStoreBlock(ent, store));

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Subscription' }} />

      {ent.switchedOn ? (
        <PlanStatus ent={ent} />
      ) : (
        <View style={styles.off}>
          <Text style={styles.offTitle}>Not Switched On Yet</Text>
          <ThemedText type="small" themeColor="textSecondary">
            OnMyLead Pro starts with the next server update. Until then every feature stays open to you.
          </ThemedText>
        </View>
      )}

      {upgrade ? (
        <Button title={ent.label === 'Pro Trial' ? 'Keep Pro After the Trial' : 'Upgrade to Pro'} big onPress={() => router.push('/pro')} />
      ) : (
        <Button title="See What Pro Includes" kind="secondary" onPress={() => router.push('/pro')} />
      )}

      <View style={styles.list}>
        <Row
          title="Manage Subscription"
          detail={ent.store?.store === 'google' || (!ent.store && google) ? 'Change plans or cancel in Google Play' : 'Change plans or cancel in your App Store account'}
          busy={busy === 'manage'}
          onPress={() => run('manage', async () => {
            const target = manageTarget(ent, store);
            if (target.kind === 'store') return store ? (await manageSubscription(ent.store?.productId), null) : notYet;
            Linking.openURL(target.url).catch(() => {});
            return target.message;
          })}
        />
        <Row
          title="Restore Purchases"
          detail={google ? 'Bought Pro on another Android device? Bring it here' : 'Bought Pro on another iPhone or iPad? Bring it here'}
          busy={busy === 'restore'}
          onPress={() => run('restore', async () => {
            if (!store) return notYet;
            const r = await restore();
            await refresh();
            return restoreMessage(store, r.restored);
          })}
        />
        <Row
          title="Redeem Promo Code"
          detail={google ? 'Enter an OnMyLead promo code in Google Play' : 'Enter an OnMyLead offer code from Apple'}
          busy={busy === 'redeem'}
          last
          onPress={() => run('redeem', async () => {
            if (!store) return notYet;
            const blocked = otherStoreBlock(ent, store);
            if (blocked) return blocked.message;
            await redeemOfferCode();
            return google ? 'After you redeem the code in Google Play, come back here and Pro turns on.' : null;
          })}
        />
      </View>
      {note ? <ThemedText type="small" style={{ color: Colors.text }} accessibilityLiveRegion="polite">{note}</ThemedText> : null}

      <ThemedText type="small" themeColor="textSecondary">
        Live tracking, SOS, Ride Bubble, Mechanical Issue alerts, family links and joining rides are free on every plan.
      </ThemedText>
    </Screen>
  );
}

function Row({ title, detail, onPress, busy, last }: { title: string; detail: string; onPress: () => void; busy?: boolean; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rule, (pressed || busy) && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={{ fontWeight: 600 }}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
      </View>
      <Icon name="chevron" color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  off: { gap: Spacing.one, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderLeftWidth: 4, borderLeftColor: Colors.sky },
  offTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22 },
  list: { borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 14 },
  rule: { borderBottomWidth: 1, borderBottomColor: Colors.backgroundSelected },
});
