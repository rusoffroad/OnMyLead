import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { Animated, LayoutAnimation, PanResponder, Platform } from 'react-native';

import { isVerticalSwipe, swipeResult } from '@/core/panel-swipe';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';

/**
 * A panel over a map that folds down to see more map: swipe it down to fold, up to open, or tap
 * its handle (PanelHandle). The phone remembers the choice under `key`. Spread `panHandlers` on the
 * panel and put `drag` in its translateY so it follows the finger. `swipe` false (a wide website
 * screen, where the panel sits beside the map) leaves only the tap.
 */
export function usePanelFold(key: string, swipe = true) {
  const [open, , setOpenRaw] = useRememberedToggle(key, true);
  const setOpen = useCallback((on: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenRaw(on);
  }, [setOpenRaw]);
  const [drag] = useState(() => new Animated.Value(0));
  const responder = useMemo(() => {
    const settle = () => Animated.spring(drag, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => isVerticalSwipe(g.dx, g.dy),
      onPanResponderMove: (_e, g) => drag.setValue(open ? Math.max(0, g.dy) : 0),
      onPanResponderRelease: (_e, g) => {
        const result = swipeResult(open, g.dy, g.vy);
        if (!result) return settle();
        Haptics.selectionAsync();
        drag.setValue(0);
        setOpen(result === 'open');
      },
      onPanResponderTerminate: settle,
    });
  }, [open, setOpen, drag]);

  return { open, setOpen, drag, panHandlers: swipe ? responder.panHandlers : {} };
}
