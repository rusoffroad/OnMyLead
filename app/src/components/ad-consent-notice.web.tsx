import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { setWebAdChoice, useWebAdChoice } from '@/lib/ad-tracking';
import { Button } from './ui';

import { t } from '@/lib/i18n';
/**
 * onmylead.com's cookie notice, along the bottom on a first visit, only when an ad pixel is set up
 * (lib/ad-tracking.web.ts). Nothing from Meta, Google or TikTok loads until Allow. A phone gets
 * the buttons stacked under the text; a tablet or computer gets one row, kept to a readable width.
 */
export function AdConsentNotice() {
  const { show } = useWebAdChoice();
  const router = useRouter();
  if (!show) return null;
  return (
    <View style={styles.wrap} accessibilityRole="alert" accessibilityLabel={t('Cookie Notice')}>
      <View style={styles.card}>
        <Text style={styles.body}>
          {t('We use ad cookies from Meta, Google and TikTok to see which of our ads bring riders to OnMyLead. They never see your location, rides or messages.')}{' '}
          <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/privacy')}>
            {t('Privacy')}
          </Text>
        </Text>
        <View style={styles.actions}>
          <Button title={t('Decline')} kind="secondary" style={styles.button} onPress={() => setWebAdChoice('decline')} />
          <Button title={t('Allow')} style={styles.button} onPress={() => setWebAdChoice('allow')} />
        </View>
      </View>
    </View>
  );
}

/** On the Privacy Policy: change the cookie choice later. Shown only when a pixel is set up. */
export function AdCookieChoice() {
  const { choice, available } = useWebAdChoice();
  if (!available) return null;
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceTitle} accessibilityRole="header">{t('Ad Cookies on This Website')}</Text>
      <Text style={styles.choiceBody}>{choice === 'allow' ? t('Allowed. Meta, Google and TikTok can tell when one of our ads brought you here.') : t('Off. Nothing from Meta, Google or TikTok loads on this website.')}</Text>
      <View style={[styles.actions, { justifyContent: 'flex-start' }]}>
        {choice === 'allow' ? (
          <Button title={t('Turn Off Ad Cookies')} kind="secondary" style={styles.button} onPress={() => setWebAdChoice('decline')} />
        ) : (
          <Button title={t('Allow Ad Cookies')} kind="secondary" style={styles.button} onPress={() => setWebAdChoice('allow')} />
        )}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: {
    position: 'fixed' as 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
    paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, alignItems: 'center',
  },
  card: {
    width: '100%', maxWidth: 760, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three,
    padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement,
    borderWidth: 1, borderColor: Colors.border, boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
  },
  body: { flexGrow: 1, flexShrink: 1, flexBasis: 320, color: Colors.text, fontFamily: font(500), fontSize: 15, lineHeight: 21 },
  link: { color: Colors.sky, fontFamily: font(700), textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', gap: Spacing.two, flexGrow: 1, flexBasis: 200, justifyContent: 'flex-end' },
  button: { minHeight: 44, flexGrow: 1, maxWidth: 220 },
  choice: { gap: Spacing.two, marginTop: Spacing.three, padding: Spacing.three, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border },
  choiceTitle: { color: Colors.text, fontFamily: font(700), fontSize: 17 },
  choiceBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 15, lineHeight: 21 },
}));
