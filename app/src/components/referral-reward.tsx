import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { ProShield } from '@/components/pro-gate';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { deviceStore, otherStoreBlock, PRODUCTS } from '@/core/purchases';
import { claimErrorLine, REFERRAL_PRICE, rewardAction, rewardLines, rewardState, type ReferralReward } from '@/core/referrals';
import { useEntitlements } from '@/lib/entitlements';
import { buy } from '@/lib/purchases';
import { applyPlayDeferral, claimReward, openAppleRedeem } from '@/lib/referrals';

import { t } from '@/lib/i18n';
/**
 * The refer-a-friend reward, shaped like a trail pass: what was earned on the left of the
 * perforation, the price on the right, and one button that claims it the way this device's store
 * does (an Apple offer code, the Google Play offer, or a Google Play bill pushed back). Used on
 * Invite Friends and the Pro screen; the website says to claim it in the app.
 */
export function ReferralRewardCard({ reward, onChanged }: { reward: ReferralReward; onChanged: () => void }) {
  const { ent, refresh } = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const store = deviceStore(Platform.OS);
  const lines = rewardLines(reward);
  const action = rewardAction(reward, store);
  const state = rewardState(reward).state;
  const live = state !== 'expired' && state !== 'used';

  const claim = async () => {
    if (!store) return;
    setBusy(true);
    setNote(null);
    try {
      // Pro running on the other store: claiming here would bill twice.
      const blocked = otherStoreBlock(ent, store);
      if (blocked) {
        setNote(blocked.message);
        return;
      }
      const r = await claimReward(store);
      if (r.kind === 'error') {
        setNote(claimErrorLine(r));
      } else if (r.kind === 'apple_code') {
        const opened = await openAppleRedeem(r.url);
        setNote(opened
          ? 'Confirm the code in the App Store. Pro turns on here as soon as Apple confirms it.'
          : `Open the App Store and redeem code ${r.code}.`);
      } else if (r.kind === 'google_offer') {
        const res = await buy(PRODUCTS.annual, r.offerId);
        if (res.ok) {
          await refresh();
          setNote('You’re on Pro Annual at half price for your first year.');
        } else if (res.reason !== 'cancelled') {
          setNote(res.reason === 'pending'
            ? 'Waiting on Google Play to approve the purchase.'
            : 'Google Play didn’t offer the discount on this device. Update OnMyLead from Google Play and try again. You weren’t charged.');
        }
      } else {
        const d = await applyPlayDeferral();
        setNote(d.ok
          ? `Done. Your next Google Play bill moved back 6 months${d.expiresAt ? `, to ${new Date(d.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.`
          : 'Google Play didn’t answer. Your reward is saved; try again in a minute.');
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.pass, !live && styles.passDone]} accessible={false}>
      <View style={styles.stub}>
        <View style={styles.head}>
          <ProShield size={34} />
          <Text style={styles.title} accessibilityRole="header">{lines.title}</Text>
        </View>
        <ThemedText type="small" style={{ color: Colors.text }}>{t(lines.body)}</ThemedText>
        {lines.note ? <ThemedText type="small" themeColor="textSecondary">{t(lines.note)}</ThemedText> : null}
      </View>
      {live && state !== 'google_defer_pending' ? <View style={styles.tear} /> : null}
      {live && state !== 'google_defer_pending' ? (
        <View style={styles.perforation} accessible accessibilityLabel={`$${REFERRAL_PRICE.discounted} for the first year instead of $${REFERRAL_PRICE.annual}`}>
          <Text style={styles.was}>${REFERRAL_PRICE.annual}</Text>
          <Text style={styles.price}>${REFERRAL_PRICE.discounted}</Text>
          <ThemedText type="small" themeColor="textSecondary">{t('First Year')}</ThemedText>
        </View>
      ) : null}
      {action?.kind === 'claim' ? (
        <Button title={t(action.title)} big loading={busy} onPress={claim} />
      ) : action ? (
        <ThemedText type="small" style={{ color: Colors.text }}>{action.message}</ThemedText>
      ) : null}
      {note ? <ThemedText type="small" style={{ color: Colors.text }} accessibilityLiveRegion="polite">{note}</ThemedText> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  pass: {
    gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card,
    backgroundColor: Colors.backgroundElement, borderWidth: 2, borderColor: Colors.gold,
  },
  passDone: { borderColor: Colors.border, backgroundColor: Colors.backgroundElement },
  stub: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1, color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26, lineHeight: 28 },
  // The tear line of a trail pass, with the price on the other side of it.
  // iOS only draws a dashed border all the way round, so the line is a flat dashed box.
  tear: { height: 0, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(230,194,122,0.5)', borderRadius: 1, marginHorizontal: -Spacing.three },
  perforation: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  was: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 20, textDecorationLine: 'line-through' },
  price: { color: Colors.gold, fontFamily: font(800, 'display'), fontSize: 44, lineHeight: 46, letterSpacing: -0.5 },
}));
