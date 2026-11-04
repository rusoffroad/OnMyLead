import { Text, View } from 'react-native';

import { Colors, font, Glass, themedStyles } from '@/constants/theme';

import { t } from '@/lib/i18n';
/** The Social area's own shades, matching the 2.0 home cards. */
export const Social = {
  get panel() { return Colors.backgroundElement; },
  get panel2() { return Colors.backgroundSelected; },
  get line() { return Glass.edge; },
  get muted() { return Colors.textSecondary; },
  get gold() { return Colors.gold; },
  heart: '#FF4D57',
};

/**
 * The Pro tag next to a rider's name: a small gold plate, the same gold as the Pro screen, so
 * riders can tell who has OnMyLead Pro at a glance.
 */
export function ProTag({ size = 'small' }: { size?: 'small' | 'large' }) {
  const big = size === 'large';
  return (
    <View
      style={[styles.tag, big && styles.tagBig]}
      accessible
      accessibilityLabel={t('OnMyLead Pro rider')}>
      <Text style={[styles.text, big && styles.textBig]}>{t('PRO')}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  tag: {
    borderRadius: 5, borderWidth: 1, borderColor: 'rgba(230,194,122,0.6)', backgroundColor: 'rgba(230,194,122,0.14)',
    paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'center',
  },
  tagBig: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  text: { color: Social.gold, fontFamily: font(800, 'display'), fontSize: 11, lineHeight: 13, letterSpacing: 0.8 },
  textBig: { fontSize: 15, lineHeight: 18, letterSpacing: 1.2 },
}));
