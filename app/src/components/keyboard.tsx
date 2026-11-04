import { forwardRef, useCallback, useId, useRef, useState, type ReactNode } from 'react';
import {
  InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, font, themedStyles } from '@/constants/theme';

import { t } from '@/lib/i18n';
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
            accessibilityLabel={t('Hide Keyboard')}
            hitSlop={8}
            onPress={() => Keyboard.dismiss()}
            style={({ pressed }) => [styles.done, pressed && { opacity: 0.6 }]}>
            <Text style={styles.doneText}>{t('Done')}</Text>
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
    <KeyboardAvoidingView behavior="padding" style={[{ flexShrink: 1, marginTop: insets.top }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * The body of a full screen whose text box is pinned to the bottom (a chat, a comment box). It keeps that box
 * above the keyboard on iPhone, iPad and Android.
 *
 * React Native's KeyboardAvoidingView measures itself against its parent, not the screen, so inside a safe-area
 * page under a header it lifts the box too little and the keyboard hides it (2.0 build 8, Social comments). This
 * measures where it sits on the screen and passes that as the offset, so the lift is right wherever it is placed.
 * On Android the app draws edge to edge and the window no longer shrinks for the keyboard, so it pads there too;
 * if a device does shrink the window the measured overlap is 0 and nothing is added twice. The website has no
 * on-screen keyboard, so it is a plain view there.
 */
export function KeyboardScreen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const box = useRef<View>(null);
  const [top, setTop] = useState(0);
  const measure = useCallback(() => {
    box.current?.measureInWindow((_x, y) => {
      if (Number.isFinite(y)) setTop((old) => (Math.abs(old - y) < 0.5 ? old : y));
    });
  }, []);
  if (Platform.OS === 'web') return <View style={[{ flex: 1 }, style]}>{children}</View>;
  return (
    <View ref={box} collapsable={false} onLayout={measure} style={[{ flex: 1 }, style]}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={top} style={{ flex: 1 }}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

/** Scroll props for any list a text box sits in: a drag down hides the keyboard, a tap on empty space too. */
export const keyboardScroll = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
} as const;

const styles = themedStyles(() => ({
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
}));
