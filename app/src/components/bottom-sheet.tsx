import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { tx } from '@/lib/i18n';

/**
 * A sheet that slides up over the screen with a title, a scrolling body and swipe-down to close
 * (components/swipe-sheet). On a tablet or a wide window it sits centred at a readable width
 * instead of stretching edge to edge.
 */
export function BottomSheet({
  visible, onClose, title, children, footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Stays under the scrolling part: the sheet's main button. */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot style={[{ backgroundColor: Colors.scrim }, layout.wide && { alignItems: 'center' }]}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <SwipeSheet
          onClose={onClose}
          accessibilityViewIsModal
          style={[styles.sheet, layout.wide && styles.sheetWide, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]}>
          <View style={styles.grip} />
          <Text style={styles.title} accessibilityRole="header">{tx(title)}</Text>
          <SheetScroll style={{ flexShrink: 1 }} contentContainerStyle={{ gap: Spacing.three, paddingBottom: Spacing.two }}>
            {children}
          </SheetScroll>
          {footer}
        </SwipeSheet>
      </SheetRoot>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  // No focus ring around the dimmed area on the website (the sheet takes focus when it opens).
  scrim: { flex: 1, alignSelf: 'stretch', outlineWidth: 0 },
  sheet: {
    flexShrink: 1, maxHeight: '88%', backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
  },
  sheetWide: { width: 560, maxWidth: '100%', alignSelf: 'center' },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
}));
