import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { font } from '@/constants/theme';
import { AdminColors } from './tokens';

/** Dashboard button. Red does something, quiet is everything else, danger removes things. */
export function AdminButton({ title, onPress, kind = 'quiet', loading, disabled, small, style }: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'quiet' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = kind === 'primary' ? AdminColors.red : kind === 'danger' ? 'transparent' : AdminColors.raised;
  const fg = kind === 'danger' ? AdminColors.danger : kind === 'primary' ? '#FFFFFF' : AdminColors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.btn,
        small && styles.small,
        { backgroundColor: bg },
        kind === 'danger' && { borderWidth: 1.5, borderColor: `${AdminColors.danger}88` },
        (hovered || pressed) && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : <Text style={[styles.text, small && { fontSize: 13.5 }, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 42, borderRadius: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 34, paddingHorizontal: 12, borderRadius: 9 },
  text: { fontFamily: font(700), fontSize: 14.5 },
});
