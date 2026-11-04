import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, Text, View } from 'react-native';

import { ReferralRewardCard } from '@/components/referral-reward';
import { ThemedText } from '@/components/themed-text';
import { TwoPane } from '@/components/two-pane';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { friendLink } from '@/core/friends';
import { sideColumnWidth } from '@/core/layout';
import { inviteMessage, inviteStatus, inviteSummary, REFERRAL_PRICE, REFERRAL_RULES } from '@/core/referrals';
import { useLayout } from '@/hooks/use-layout';
import { useMyReferrals } from '@/lib/referrals';
import { t } from '@/lib/i18n';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

/**
 * Invite Friends (You > Invite Friends): your friend link, the 50% off reward once an invited
 * friend finishes their first ride, and who has joined with your link. Phones: one column.
 * Tablets and wide windows: the link and reward on the left, your invites on the right.
 */
export default function InviteFriends() {
  const { data, error, reload } = useMyReferrals();
  const { wide, width } = useLayout();
  const [copied, setCopied] = useState(false);

  useFocusEffect(useCallback(() => {
    reload();
  }, [reload]));

  if (!data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Invite Friends') }} />
        {error ? <ErrorText error={error} /> : <ThemedText themeColor="textSecondary">{t('Loading…')}</ThemedText>}
      </Screen>
    );
  }

  const code = data.code;
  const link = code ? friendLink(WEB_URL, code) : null;

  const hero = (
    <View style={styles.hero}>
      <View style={styles.contours} pointerEvents="none">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.contour, { width: 160 + i * 90, height: 120 + i * 70, borderRadius: 80 + i * 45, top: -40 - i * 20, right: -70 - i * 34 }]} />
        ))}
      </View>
      <Text style={styles.heroTitle} accessibilityRole="header">{t('Ride Together, Save Together')}</Text>
      <ThemedText themeColor="textSecondary" style={{ maxWidth: 420 }}>
        {data.enabled
          ? `Send your link to a riding buddy who’s new to OnMyLead. When they finish their first ride, you both get Pro Annual for $${REFERRAL_PRICE.discounted} the first year instead of $${REFERRAL_PRICE.annual}.`
          : 'Invites aren’t open right now. Any discount you already earned is below.'}
      </ThemedText>
    </View>
  );

  const linkCard = data.enabled && code ? (
    <View style={styles.card}>
      <ThemedText type="heading" style={{ fontSize: 20 }}>{t('Your Invite Link')}</ThemedText>
      <Text style={styles.link} selectable numberOfLines={2}>{link ?? code}</Text>
      <Button title={t('Share Invite')} big onPress={() => Share.share({ message: inviteMessage(link, code) }).catch(() => {})} />
      <Button
        title={copied ? 'Copied' : 'Copy Link'}
        kind="secondary"
        onPress={async () => {
          await Clipboard.setStringAsync(link ?? code);
          setCopied(true);
        }}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('It’s also your friend link, so they can add you as a friend too.')}
      </ThemedText>
    </View>
  ) : null;

  const reward = data.reward ? <ReferralRewardCard reward={data.reward} onChanged={reload} /> : null;

  const invites = (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="heading" style={{ fontSize: 22 }}>{t('Your Invites')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{inviteSummary(data)}</ThemedText>
      {data.invites.map((i, n) => (
        <View key={`${i.joinedAt}-${n}`} style={styles.row} accessible accessibilityLabel={`${i.name}, ${inviteStatus(i)}`}>
          <Text style={styles.rowName} numberOfLines={1}>{i.name}</Text>
          <Text style={[styles.rowState, i.rodeAt ? { color: RideColors.green } : null]}>{inviteStatus(i)}</Text>
        </View>
      ))}
      {data.invitedBy ? (
        <ThemedText type="small" themeColor="textSecondary">
          {data.invitedBy.rodeAt
            ? `${data.invitedBy.name} invited you, and your first ride counted.`
            : `${data.invitedBy.name} invited you. Finish your first ride and you both get 50% off Pro Annual.`}
        </ThemedText>
      ) : null}
    </View>
  );

  const rules = (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="smallBold">{t('How It Works')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {`Your friend creates a new account with your link within ${REFERRAL_RULES.newAccountDays} days and finishes a ride that ran at least ${REFERRAL_RULES.minRideMinutes} minutes. Each rider can earn the discount once, and it can be claimed for 6 months. On iPhone and iPad it’s an App Store offer code; on Android it’s a Google Play offer. If you already pay for Pro on Google Play, your next bill moves back 6 months instead. The discount covers the first year of Pro Annual, which then renews at the regular price unless you cancel.`}
      </ThemedText>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: t('Invite Friends') }} />
      {wide ? (
        <TwoPane side={<>{hero}{reward}{linkCard}</>} main={<>{invites}{rules}</>} sideWidth={sideColumnWidth(width)} />
      ) : (
        <Screen>
          {hero}
          {reward}
          {linkCard}
          {invites}
          {rules}
        </Screen>
      )}
    </>
  );
}

const styles = themedStyles(() => ({
  hero: { overflow: 'hidden', gap: Spacing.two, paddingTop: Spacing.two, paddingBottom: Spacing.one },
  contours: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  contour: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(229,38,46,0.14)' },
  heroTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 42, letterSpacing: -0.4, maxWidth: 420 },
  card: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.two },
  link: { color: Colors.sky, fontFamily: font(700), fontSize: 17, lineHeight: 22 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: Colors.backgroundElement,
    borderRadius: Radius.card, paddingVertical: 14, paddingHorizontal: 14,
  },
  rowName: { flex: 1, color: Colors.text, fontFamily: font(700), fontSize: 16 },
  rowState: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14 },
}));
