import { useContext, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { keyboardScroll } from './keyboard';

/**
 * Two panes side by side, for tablets and wide windows: a fixed-width side column on the left
 * (ride details, a list) and the main pane filling the rest (the ride's map, riders and chat, or a
 * map). Each pane scrolls on its own. `mainScroll` false hands the main pane the whole height (for a
 * map). Phones never get this: screens fall back to their one-column layout below Medium width.
 */
export function TwoPane({
  side, main, sideWidth, mainScroll = true, top = false,
}: { side: ReactNode; main: ReactNode; sideWidth: number; mainScroll?: boolean; top?: boolean }) {
  // Inside the tabs the rail sits beside this; elsewhere the page pads for the home indicator itself.
  const inTabs = !!useContext(BottomTabBarHeightContext);
  const edges = [...(top ? (['top'] as const) : []), ...(inTabs ? [] : (['bottom'] as const)), 'left', 'right'] as const;
  return (
    <SafeAreaView edges={edges} style={styles.row}>
      <ScrollView
        style={[styles.side, { width: sideWidth }]}
        contentContainerStyle={styles.pad}
        automaticallyAdjustKeyboardInsets
        {...keyboardScroll}
        indicatorStyle="white">
        {side}
      </ScrollView>
      {mainScroll ? (
        <ScrollView
          style={styles.main}
          contentContainerStyle={[styles.pad, styles.mainPad]}
          automaticallyAdjustKeyboardInsets
          {...keyboardScroll}
          indicatorStyle="white">
          {main}
        </ScrollView>
      ) : (
        <View style={[styles.main, styles.mainFill]}>{main}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },
  side: { flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: Colors.backgroundElement },
  main: { flex: 1 },
  pad: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  // The main pane's content keeps a readable width on the biggest screens.
  mainPad: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  mainFill: { padding: Spacing.three, paddingLeft: Spacing.three },
});
