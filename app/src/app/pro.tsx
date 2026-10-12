import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ProShield } from '@/components/pro-gate';
import { Disclosures, PlanStatus } from '@/components/pro-plan';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { annualPerMonth, annualSavingsPercent, COMPARISON, PRICES } from '@/core/pro';
import { track } from '@/lib/analytics';
import { useEntitlements } from '@/lib/entitlements';
import { buy, loadProducts, manageSubscription, PRODUCTS, redeemOfferCode, restore } from '@/lib/purchases';

type Product = Awaited<ReturnType<typeof loadProducts>>[number];

type Period = 'annual' | 'monthly';

/** OnMyLead Pro: what it adds, what it costs, where you stand, and the ways to subscribe or restore. */
export default function ProScreen() {
  const { ent, refresh } = useEntitlements();
  const [period, setPeriod] = useState<Period>('annual');
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    track('pro_screen_viewed', { plan: ent.label });
    loadProducts().then(setProducts).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceOf = (p: Period) =>
    products.find((x) => x.id === PRODUCTS[p])?.displayPrice ?? `$${p === 'annual' ? PRICES.annual : PRICES.monthly}`;
  const paid = ent.proSource === 'apple';
  const onIphone = Platform.OS === 'ios';
  // No products means App Store subscriptions aren't live yet (or this isn't the iPhone app).
  const purchasesReady = onIphone && products.length > 0;
  const admin = ent.accountType === 'admin';
  const notYet = !onIphone
    ? 'Subscriptions are in the OnMyLead iPhone app. Pro you buy there works here too.'
    : 'Subscriptions open in an upcoming update. Until then your plan stays as it is and nothing is charged.';

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

  const subscribe = () =>
    run('buy', async () => {
      if (!purchasesReady) return notYet;
      const r = await buy(PRODUCTS[period]);
      if (r.ok) {
        await refresh();
        return 'You’re on OnMyLead Pro. Thanks for riding with us.';
      }
      return r.reason === 'cancelled' ? null : r.reason === 'pending' ? 'Waiting on Apple to approve the purchase.' : r.reason === 'ios_only' ? notYet : 'The purchase didn’t go through. You weren’t charged.';
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />

      <View style={styles.hero}>
        <View style={styles.contours} pointerEvents="none">
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.contour, { width: 140 + i * 80, height: 110 + i * 64, borderRadius: 70 + i * 40, top: -30 - i * 18, right: -60 - i * 30 }]} />
          ))}
        </View>
        <ProShield size={76} />
        <Text style={styles.heroTitle} accessibilityRole="header">OnMyLead Pro</Text>
        <Text style={styles.heroBody}>Lead as many rides as you like, ride with no signal and keep every ride you’ve been on.</Text>
      </View>

      {ent.switchedOn ? <PlanStatus ent={ent} /> : null}

      {admin ? null : paid ? (
        <Button title="Manage Subscription" kind="secondary" loading={busy === 'manage'} onPress={() => run('manage', async () => (onIphone ? (await manageSubscription(), null) : notYet))} />
      ) : (
        <>
          <View style={{ gap: Spacing.two }} accessibilityRole="radiogroup">
            <PlanOption
              on={period === 'annual'}
              onPress={() => setPeriod('annual')}
              name="Annual"
              price={`${priceOf('annual')} a Year`}
              detail={`${annualPerMonth()} a Month. Save About ${annualSavingsPercent()}%`}
              best
            />
            <PlanOption on={period === 'monthly'} onPress={() => setPeriod('monthly')} name="Monthly" price={`${priceOf('monthly')} a Month`} detail="Cancel anytime" />
          </View>
          <Button
            title={`Subscribe for ${priceOf(period)} a ${period === 'annual' ? 'Year' : 'Month'}`}
            big
            loading={busy === 'buy'}
            onPress={subscribe}
          />
        </>
      )}
      {note ? <ThemedText type="small" style={{ color: Colors.text, textAlign: 'center' }} accessibilityLiveRegion="polite">{note}</ThemedText> : null}

      <Text style={styles.sectionTitle} accessibilityRole="header">Free and Pro</Text>
      <Comparison />

      <View style={styles.links}>
        <LinkButton title="Restore Purchases" busy={busy === 'restore'} onPress={() => run('restore', async () => {
          if (!onIphone) return notYet;
          const r = await restore();
          await refresh();
          return r.restored ? 'Your Pro subscription is restored.' : 'No OnMyLead Pro purchase found for this Apple ID.';
        })} />
        <LinkButton title="Redeem Promo Code" busy={busy === 'redeem'} onPress={() => run('redeem', async () => (onIphone ? (await redeemOfferCode(), null) : notYet))} />
        {admin || paid ? null : (
          <LinkButton title="Manage Subscription" busy={busy === 'manage'} onPress={() => run('manage', async () => (onIphone ? (await manageSubscription(), null) : notYet))} />
        )}
      </View>

      <Disclosures />
    </Screen>
  );
}

function PlanOption({ on, onPress, name, price, detail, best }: { on: boolean; onPress: () => void; name: string; price: string; detail: string; best?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${name}, ${price}${best ? ', Best Value' : ''}. ${detail}`}
      onPress={onPress}
      style={[styles.option, on && styles.optionOn]}>
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <Text style={styles.optionName}>{name}</Text>
          {best ? (
            <View style={styles.best}>
              <Text style={styles.bestText}>Best Value</Text>
            </View>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
      </View>
      <Text style={styles.optionPrice}>{price}</Text>
    </Pressable>
  );
}

function Comparison() {
  const cell = (v: boolean | string, pro: boolean) =>
    typeof v === 'string' ? (
      <Text style={[styles.cellText, pro && { color: Colors.text }]}>{v}</Text>
    ) : v ? (
      <Icon name="check" size={20} color={pro ? Colors.accent : RideColors.green} strokeWidth={2.6} />
    ) : (
      <View style={styles.dash} />
    );
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.rowLabel, styles.headText]} />
        <Text style={[styles.col, styles.headText]}>Free</Text>
        <Text style={[styles.col, styles.headText, { color: Colors.accent }]}>Pro</Text>
      </View>
      {COMPARISON.map((r, i) => (
        <View
          key={r.label}
          style={[styles.row, i > 0 && styles.rule]}
          accessible
          accessibilityLabel={`${r.label}. Free: ${r.free === true ? 'included' : r.free === false ? 'not included' : r.free}. Pro: ${r.pro === true ? 'included' : r.pro}`}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <View style={styles.colBox}>{cell(r.free, false)}</View>
          <View style={styles.colBox}>{cell(r.pro, true)}</View>
        </View>
      ))}
    </View>
  );
}

function LinkButton({ title, onPress, busy }: { title: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={busy} hitSlop={4} style={({ pressed }) => [styles.link, (pressed || busy) && { opacity: 0.6 }]}>
      <Text style={styles.linkText}>{title}</Text>
      <Icon name="chevron" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden', gap: Spacing.two, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  contours: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  contour: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(59,134,247,0.12)' },
  heroTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 46, lineHeight: 46, letterSpacing: -0.5, marginTop: Spacing.one },
  heroBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 17, lineHeight: 24, maxWidth: 340 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: Spacing.three, borderRadius: Radius.card,
    backgroundColor: Colors.backgroundElement, borderWidth: 2, borderColor: Colors.backgroundElement, minHeight: 76,
  },
  optionOn: { borderColor: Colors.accent, backgroundColor: '#1A2238' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.accent },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent },
  optionName: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 24, lineHeight: 26 },
  optionPrice: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, textAlign: 'right' },
  best: { backgroundColor: Colors.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  bestText: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 14 },
  sectionTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 26, lineHeight: 28, marginTop: Spacing.two },
  table: { borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 46, gap: Spacing.two },
  headRow: { minHeight: 36 },
  rule: { borderTopWidth: 1, borderTopColor: Colors.backgroundSelected },
  rowLabel: { flex: 1, color: Colors.text, fontFamily: font(600), fontSize: 15, lineHeight: 20, paddingVertical: 8 },
  headText: { color: Colors.textSecondary, fontFamily: font(800, 'display'), fontSize: 17 },
  col: { width: 76, textAlign: 'center' },
  colBox: { width: 76, alignItems: 'center' },
  cellText: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 16, textAlign: 'center' },
  dash: { width: 14, height: 2, borderRadius: 1, backgroundColor: Colors.border },
  links: { borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.backgroundSelected },
  linkText: { color: Colors.sky, fontFamily: font(600), fontSize: 16 },
});
