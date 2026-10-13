import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { SocialProvider } from '@/core/auth-link';

/**
 * One "Continue with ..." button. Each provider's wording and mark follow its own rules: Apple's
 * is white on a dark screen with the Apple logo (Human Interface Guidelines), Google keeps its
 * four-colour G, Facebook its blue f.
 */
const LABEL: Record<SocialProvider, string> = {
  apple: 'Continue with Apple',
  google: 'Continue with Google',
  facebook: 'Continue with Facebook',
};

export function SocialButton({ provider, loading, disabled, onPress }: { provider: SocialProvider; loading?: boolean; disabled?: boolean; onPress: () => void }) {
  const apple = provider === 'apple';
  const fg = apple ? '#000000' : Colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={LABEL[provider]}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        apple ? styles.apple : styles.dark,
        { opacity: disabled ? 0.4 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <View style={styles.mark}>
            <ProviderMark provider={provider} />
          </View>
          <Text style={[styles.text, { color: fg }]}>{LABEL[provider]}</Text>
        </>
      )}
    </Pressable>
  );
}

/** The provider's own mark, at any size (the sign-in buttons and rider info). */
export function ProviderMark({ provider, size = 20, light }: { provider: SocialProvider; size?: number; light?: boolean }) {
  if (provider === 'apple') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill={light ? '#FFFFFF' : '#000000'}
          d="M16.37 12.6c-.02-2.13 1.74-3.15 1.82-3.2-.99-1.45-2.54-1.65-3.09-1.67-1.31-.13-2.57.78-3.23.78-.67 0-1.69-.76-2.78-.74-1.43.02-2.75.83-3.49 2.11-1.49 2.58-.38 6.4 1.07 8.5.71 1.02 1.55 2.17 2.66 2.13 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.78.67 1.15-.02 1.88-1.04 2.58-2.07.81-1.19 1.15-2.34 1.17-2.4-.03-.01-2.24-.86-2.25-3.42zM14.25 6.34c.59-.71.98-1.7.88-2.69-.85.03-1.88.57-2.49 1.28-.55.63-1.03 1.64-.9 2.61.95.07 1.92-.48 2.51-1.2z"
        />
      </Svg>
    );
  }
  if (provider === 'google') {
    return (
      <Svg width={size * 0.95} height={size * 0.95} viewBox="0 0 48 48">
        <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </Svg>
    );
  }
  return (
    <Svg width={size * 1.05} height={size * 1.05} viewBox="0 0 24 24">
      <Path fill="#FFFFFF" d="M15.83 7.73h1.5V4.92s-1.37-.24-2.69-.24c-2.74 0-4.53 1.67-4.53 4.7v2.66H7.08v3.49h3.05V24h3.74v-8.47h2.8l.53-3.49h-3.33V9.62c0-.96.47-1.89 1.96-1.89z" />
      <Path
        fill="#0866FF"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.95.93-1.95 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52, borderRadius: Radius.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.two, paddingHorizontal: Spacing.three,
  },
  apple: { backgroundColor: '#FFFFFF' },
  dark: { backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: Colors.border },
  mark: { width: 22, alignItems: 'center' },
  text: { fontFamily: font(600), fontSize: 17 },
});
