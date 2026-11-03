import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/constants/theme';

/** The Social area's own shades, matching the 2.0 home cards. */
export const Social = {
  panel: '#101E33',
  panel2: '#16273F',
  line: 'rgba(151,167,190,0.16)',
  muted: '#8C9CB3',
  gold: '#E6C27A',
  heart: '#FF4D57',
} as const;

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
      accessibilityLabel="OnMyLead Pro rider">
      <Text style={[styles.text, big && styles.textBig]}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: 5, borderWidth: 1, borderColor: 'rgba(230,194,122,0.6)', backgroundColor: 'rgba(230,194,122,0.14)',
    paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'center',
  },
  tagBig: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  text: { color: Social.gold, fontFamily: font(800, 'display'), fontSize: 11, lineHeight: 13, letterSpacing: 0.8 },
  textBig: { fontSize: 15, lineHeight: 18, letterSpacing: 1.2 },
});
