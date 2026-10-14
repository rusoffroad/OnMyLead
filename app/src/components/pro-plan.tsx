import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { rideAllowanceText, type Entitlements } from '@/core/entitlements';
import { planHeadline, PRIVACY_URL, shortDate, TERMS_URL } from '@/core/pro';
import { disclosureText, SITE_TERMS_URL, type Store } from '@/core/purchases';

/** Where you stand: plan, trial days on a trail of mileposts, or this month's rides. */
export function PlanStatus({ ent }: { ent: Entitlements }) {
  const trial = ent.label === 'Pro Trial';
  const rides = rideAllowanceText(ent);
  const days = ent.trialDaysLeft ?? 0;
  return (
    <View style={[styles.status, trial && { borderColor: Colors.accent }]} accessible accessibilityLabel={planHeadline(ent)}>
      <Text style={styles.statusLabel}>Your Plan</Text>
      <Text style={styles.statusHeadline}>{planHeadline(ent)}</Text>
      {trial ? (
        <>
          <TrialTrail daysLeft={days} />
          <ThemedText type="small" themeColor="textSecondary">
            {`Ends ${shortDate(ent.trialEndsAt)}. No payment needed, and you’re never charged when it ends. Your rides, routes, groups and maps stay yours; new Pro actions move to Free unless you subscribe.`}
          </ThemedText>
        </>
      ) : ent.label === 'Admin' ? (
        <ThemedText type="small" themeColor="textSecondary">Every Pro feature, always. Nothing to buy.</ThemedText>
      ) : ent.label === 'Pro' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {ent.proSource === 'comp'
            ? ent.proUntil ? `Complimentary Pro until ${shortDate(ent.proUntil)}.` : 'Complimentary Pro from OnMyLead.'
            : ent.proUntil ? `Renews or ends ${shortDate(ent.proUntil)}.${ent.store ? ` Billed by ${ent.store.store === 'google' ? 'Google Play' : 'the App Store'}.` : ''} Change it in Manage Subscription.` : 'Every Pro feature is on.'}
        </ThemedText>
      ) : rides ? (
        <ThemedText type="small" themeColor="textSecondary">{rides}. Joining rides and every safety feature stay free.</ThemedText>
      ) : null}
    </View>
  );
}

/** Thirty mileposts, filled up to today. */
function TrialTrail({ daysLeft, total = 30 }: { daysLeft: number; total?: number }) {
  const used = Math.max(0, Math.min(total, total - daysLeft));
  return (
    <View style={styles.trail} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.post, i < used ? styles.postUsed : null, i === used ? styles.postNow : null, (i + 1) % 7 === 0 && styles.postWeek]} />
      ))}
    </View>
  );
}

/** The store's required subscription terms (Apple's, or Google Play's on Android), with the Terms of Use and Privacy Policy. */
export function Disclosures({ store = 'apple' }: { store?: Store | null }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 13, lineHeight: 18 }}>{disclosureText(store)}</ThemedText>
      <View style={{ flexDirection: 'row', gap: Spacing.four }}>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(store === 'google' ? SITE_TERMS_URL : TERMS_URL)} hitSlop={8}>
          <ThemedText type="linkPrimary">Terms of Use</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
          <ThemedText type="linkPrimary">Privacy Policy</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderWidth: 1.5, borderColor: Colors.backgroundSelected },
  statusLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  statusHeadline: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 32, marginTop: -4 },
  trail: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 22 },
  post: { flex: 1, height: 10, borderRadius: 2, backgroundColor: Colors.backgroundSelected },
  postUsed: { backgroundColor: Colors.border },
  postNow: { height: 22, backgroundColor: Colors.accent },
  postWeek: { height: 14 },
});
