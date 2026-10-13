import { forwardRef, useId, type ReactNode } from 'react';
import {
  InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, font } from '@/constants/theme';

/**
 * Every text box in the app. On iPhone it carries a Done bar above the keyboard, so the keyboard can always be
 * put away: number pads have no return key, and in a message or notes box return only starts a new line.
 * Android has its own back key for this, and the website has no on-screen keyboard to close.
 */
export const TextBox = forwardRef<TextInput, TextInputProps>(function TextBox(props, ref) {
  const id = useId();
  if (Platform.OS !== 'ios') return <TextInput ref={ref} keyboardAppearance="dark" {...props} />;
  return (
    <>
      <TextInput ref={ref} keyboardAppearance="dark" inputAccessoryViewID={id} {...props} />
      <InputAccessoryView nativeID={id}>
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hide Keyboard"
            hitSlop={8}
            onPress={() => Keyboard.dismiss()}
            style={({ pressed }) => [styles.done, pressed && { opacity: 0.6 }]}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    </>
  );
});

/**
 * Wraps a sheet that slides up from the bottom (a Modal over a map or page) so the keyboard pushes the sheet
 * up instead of covering the box being typed in and the button under it. The sheet shrinks to fit under the
 * status bar, so give its body a ScrollView with flexShrink: 1 when it can be tall.
 */
export function KeyboardLift({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[{ flexShrink: 1, marginTop: insets.top }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}

/** Scroll props for any list a text box sits in: a drag down hides the keyboard, a tap on empty space too. */
export const keyboardScroll = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
} as const;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: Colors.backgroundElement,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
  },
  done: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  doneText: { color: Colors.sky, fontSize: 17, fontFamily: font(700) },
});
