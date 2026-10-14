import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { Animated, LayoutAnimation, PanResponder, Platform } from 'react-native';

import { isHorizontalSwipe, isVerticalSwipe, swipeResultToward, type FoldDirection } from '@/core/panel-swipe';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';

/**
 * A panel over a map that folds down to see more map: swipe it down to fold, up to open, or tap
 * its handle (PanelHandle). The phone remembers the choice under `key`. Spread `panHandlers` on the
 * panel and put `drag` in its transform so it follows the finger: translateY for a panel that folds
 * down or up, translateX for one that folds left. `direction` is the way it folds: down for a sheet
 * at the bottom (phones), up for a panel hanging from the top beside the map (tablets and the wide
 * website), left for a sidebar (Ride Mode's riders on a tablet). `swipe` false leaves only the tap.
 */
export function usePanelFold(key: string, swipe = true, direction: FoldDirection = 'down', initial = true) {
  const [open, , setOpenRaw] = useRememberedToggle(key, initial);
  const setOpen = useCallback((on: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenRaw(on);
  }, [setOpenRaw]);
  const [drag] = useState(() => new Animated.Value(0));
  const responder = useMemo(() => {
    const settle = () => Animated.spring(drag, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => (direction === 'left' ? isHorizontalSwipe(g.dx, g.dy) : isVerticalSwipe(g.dx, g.dy)),
      // The panel follows the finger only the way it folds, and only while it is open.
      onPanResponderMove: (_e, g) => {
        if (!open) return drag.setValue(0);
        drag.setValue(direction === 'left' ? Math.min(0, g.dx) : direction === 'up' ? Math.min(0, g.dy) : Math.max(0, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        const result = swipeResultToward(direction, open, g.dx, g.dy, g.vx, g.vy);
        if (!result) return settle();
        Haptics.selectionAsync();
        drag.setValue(0);
        setOpen(result === 'open');
      },
      onPanResponderTerminate: settle,
    });
  }, [open, setOpen, drag, direction]);

  return { open, setOpen, drag, panHandlers: swipe ? responder.panHandlers : {} };
}
