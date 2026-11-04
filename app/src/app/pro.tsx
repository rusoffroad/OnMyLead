import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ReferralRewardCard } from '@/components/referral-reward';
import { ProShield } from '@/components/pro-gate';
import { Disclosures, PlanStatus } from '@/components/pro-plan';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { withAlpha } from '@/core/color';
import { annualPerMonth, annualSavingsPercent, COMPARISON, PRICES } from '@/core/pro';
import { deviceStore, manageTarget, otherStoreBlock, restoreMessage } from '@/core/purchases';
import { referralsSwitchedOn, rewardState } from '@/core/referrals';
import { useAppSettings } from '@/lib/app-settings';
import { track } from '@/lib/analytics';
import { useEntitlements } from '@/lib/entitlements';
import { buy, loadProducts, manageSubscription, PRODUCTS, redeemOfferCode, restore } from '@/lib/purchases';
import { useMyReferrals } from '@/lib/referrals';
import { useSession } from '@/lib/session';

import { t } from '@/lib/i18n';
type Product = Awaited<ReturnType<typeof loadProducts>>[number];

type Period = 'annual' | 'monthly';

/** OnMyLead Pro: what it adds, what it costs, where you stand, and the ways to subscribe or restore. */
export default function ProScreen() {
  const { ent, refresh } = useEntitlements();
  const [period, setPeriod] = useState<Period>('annual');
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { session } = useSession();
  const referrals = useMyReferrals(!!session);
  const referralsOn = referralsSwitchedOn(useAppSettings().settings.flags);
  // A discount earned by inviting (or being invited by) a friend, while it can still be used.
  const reward = referrals.data?.reward ?? null;
  const rewardLive = !!reward && !['none', 'expired', 'used'].includes(rewardState(reward).state);

  useEffect(() => {
    track('pro_screen_viewed', { plan: ent.label });
    loadProducts().then(setProducts).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceOf = (p: Period) =>
    products.find((x) => x.id === PRODUCTS[p])?.displayPrice ?? `$${p === 'annual' ? PRICES.annual : PRICES.monthly}`;
  const paid = ent.proSource === 'apple' || ent.proSource === 'google';
  // The App Store on iPhone and iPad, Google Play on Android, nothing on the website.
  const store = deviceStore(Platform.OS);
  // No products means this store's subscriptions aren't live yet (or this is the website).
  const purchasesReady = !!store && products.length > 0;
  const admin = ent.accountType === 'admin';
  // Pro running (or stuck on a payment) on the other store: don't sell it twice.
  const blocked = store ? otherStoreBlock(ent, store) : null;
  const notYet = !store
    ? t('Subscriptions are in the OnMyLead app. Pro you buy there works here too.')
    : t('Subscriptions open in an upcoming update. Until then your plan stays as it is and nothing is charged.');
  const storeName = store === 'google' ? 'Google Play' : 'Apple';

  async function run(key: string, fn: () => Promise<string | null>) {
    setBusy(key);
    setNote(null);
    try {
      setNote(await fn());
    } catch (e) {
      setNote(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  const subscribe = () =>
    run('buy', async () => {
      if (blocked) return blocked.message;
      if (!purchasesReady) return notYet;
      const r = await buy(PRODUCTS[period]);
      if (r.ok) {
        await refresh();
        return 'You’re on OnMyLead Pro. Thanks for riding with us.';
      }
      return r.reason === 'cancelled' ? null : r.reason === 'pending' ? t('Waiting on {storeName} to approve the purchase.', { storeName }) : r.reason === 'ios_only' ? notYet : t('The purchase didn’t go through. You weren’t charged.');
    });

  // The store's own screen when this device's store bills it, else the other store's page.
  const manage = () =>
    run('manage', async () => {
      const target = manageTarget(ent, store);
      if (target.kind === 'store') return store ? (await manageSubscription(ent.store?.productId), null) : notYet;
      Linking.openURL(target.url).catch(() => {});
      return target.message;
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
        <Text style={styles.heroBody}>{t('Lead as many rides as you like, ride with no signal and keep every ride you’ve been on.')}</Text>
      </View>

      {ent.switchedOn ? <PlanStatus ent={ent} /> : null}

      {rewardLive && reward ? <ReferralRewardCard reward={reward} onChanged={() => { referrals.reload(); refresh(); }} /> : null}

      {admin ? null : paid ? (
        <Button title={t('Manage Subscription')} kind="secondary" loading={busy === 'manage'} onPress={manage} />
      ) : blocked ? (
        <View style={styles.blocked} accessibilityLiveRegion="polite">
          <ThemedText type="small" style={{ color: Colors.text }}>{blocked.message}</ThemedText>
        </View>
      ) : (
        <>
          <View style={{ gap: Spacing.two }} accessibilityRole="radiogroup">
            <PlanOption
              on={period === 'annual'}
              onPress={() => setPeriod('annual')}
              name={t('Annual')}
              price={t('{v} a Year', { v: priceOf('annual') })}
              detail={t('{v} a Month. Save About {v2}%', { v: annualPerMonth(), v2: annualSavingsPercent() })}
              best
            />
            <PlanOption on={period === 'monthly'} onPress={() => setPeriod('monthly')} name={t('Monthly')} price={t('{v} a Month', { v: priceOf('monthly') })} detail={t('Cancel anytime')} />
          </View>
          <Button
            title={period === 'annual' ? t('Subscribe for {v} a Year', { v: priceOf(period) }) : t('Subscribe for {v} a Month', { v: priceOf(period) })}
            big
            loading={busy === 'buy'}
            onPress={subscribe}
          />
        </>
      )}
      {note ? <ThemedText type="small" style={{ color: Colors.text, textAlign: 'center' }} accessibilityLiveRegion="polite">{note}</ThemedText> : null}

      <Text style={styles.sectionTitle} accessibilityRole="header">{t('Free and Pro')}</Text>
      <Comparison />

      <View style={styles.links}>
        <LinkButton title={t('Restore Purchases')} busy={busy === 'restore'} onPress={() => run('restore', async () => {
          if (!store) return notYet;
          const r = await restore();
          await refresh();
          return restoreMessage(store, r.restored);
        })} />
        <LinkButton title={t('Redeem Promo Code')} busy={busy === 'redeem'} onPress={() => run('redeem', async () => {
          if (!store) return notYet;
          if (blocked) return blocked.message;
          await redeemOfferCode();
          return store === 'google' ? t('After you redeem the code in Google Play, come back here and Pro turns on.') : null;
        })} />
        {admin || paid ? null : <LinkButton title={t('Manage Subscription')} busy={busy === 'manage'} onPress={manage} />}
        {session && referralsOn ? <LinkButton title={t('Invite Friends, Both Get 50% Off')} onPress={() => router.push('/invite-friends')} /> : null}
      </View>

      <Disclosures store={store} />
    </Screen>
  );
}

function PlanOption({ on, onPress, name, price, detail, best }: { on: boolean; onPress: () => void; name: string; price: string; detail: string; best?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${name}, ${price}${best ? t(', Best Value') : ''}. ${detail}`}
      onPress={onPress}
      style={[styles.option, on && styles.optionOn]}>
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <Text style={styles.optionName}>{name}</Text>
          {best ? (
            <View style={styles.best}>
              <Text style={styles.bestText}>{t('Best Value')}</Text>
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
      <Text style={[styles.cellText, pro && { color: Colors.text }]}>{t(v)}</Text>
    ) : v ? (
      <Icon name="check" size={20} color={pro ? Colors.accent : RideColors.green} strokeWidth={2.6} />
    ) : (
      <View style={styles.dash} />
    );
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.rowLabel, styles.headText]} />
        <Text style={[styles.col, styles.headText]}>{t('Free')}</Text>
        <Text style={[styles.col, styles.headText, { color: Colors.accent }]}>Pro</Text>
      </View>
      {COMPARISON.map((r, i) => (
        <View
          key={r.label}
          style={[styles.row, i > 0 && styles.rule]}
          accessible
          accessibilityLabel={t('{label}. Free: {free}. Pro: {pro}', { label: t(r.label), free: r.free === true ? t('included') : r.free === false ? t('not included') : t(r.free), pro: r.pro === true ? t('included') : t(r.pro as string) })}>
          <Text style={styles.rowLabel}>{t(r.label)}</Text>
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

const styles = themedStyles(() => ({
  hero: { overflow: 'hidden', gap: Spacing.two, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  contours: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  contour: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(59,134,247,0.12)' },
  heroTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 46, lineHeight: 46, letterSpacing: -0.5, marginTop: Spacing.one },
  heroBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 17, lineHeight: 24, maxWidth: 340 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: Spacing.three, borderRadius: Radius.card,
    backgroundColor: Colors.backgroundElement, borderWidth: 2, borderColor: Colors.backgroundElement, minHeight: 76,
  },
  optionOn: { borderColor: Colors.accent, backgroundColor: withAlpha(Colors.accent, 0.1) },
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
  blocked: { padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderLeftWidth: 4, borderLeftColor: Colors.sky },
}));
