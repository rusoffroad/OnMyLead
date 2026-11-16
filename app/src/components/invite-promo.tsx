import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { REFERRAL_PRICE } from '@/core/referrals';
import { useInvitePromo } from '@/lib/invite-promo';
import { t } from '@/lib/i18n';

/**
 * Home's one-time Invite Friends pop-up (3.1): tells riders about refer a friend once (rules in
 * core/invite-promo.ts). Invite Friends opens You > Invite Friends; Not Now, swipe down or a tap
 * outside closes it for good. Phones: a sheet from the bottom. Tablets and the website: the same
 * sheet centred at a readable width (components/bottom-sheet).
 */
export function InvitePromo({ active }: { active: boolean }) {
  const { show, hide } = useInvitePromo(active);
  const now = `$${REFERRAL_PRICE.discounted}`;
  const was = `$${REFERRAL_PRICE.annual}`;
  return (
    <BottomSheet
      visible={show}
      onClose={hide}
      title={t('Invite Friends, Both Get 50% Off')}
      footer={
        <View style={{ gap: Spacing.two }}>
          <Button
            title={t('Invite Friends')}
            big
            onPress={() => {
              hide();
              router.push('/invite-friends');
            }}
          />
          <Button title={t('Not Now')} kind="ghost" onPress={hide} />
        </View>
      }>
      <View style={styles.price} accessible accessibilityLabel={`${now}, ${was}`}>
        <View style={styles.icon}>
          <Icon name="people" size={24} color={Colors.text} />
        </View>
        <Text style={styles.now}>{now}</Text>
        <Text style={styles.was}>{was}</Text>
      </View>
      <Text style={styles.body}>
        {t('Send your link to a riding buddy who’s new to OnMyLead. When they finish their first ride, you both get Pro Annual for ${discounted} the first year instead of ${annual}.', { discounted: REFERRAL_PRICE.discounted, annual: REFERRAL_PRICE.annual })}
      </Text>
    </BottomSheet>
  );
}

const styles = themedStyles(() => ({
  price: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: 14, borderRadius: Radius.card, backgroundColor: Colors.backgroundSelected },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(229,38,46,0.18)' },
  now: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 34, lineHeight: 36 },
  was: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 18, textDecorationLine: 'line-through' },
  body: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 16, lineHeight: 23 },
}));
