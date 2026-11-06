import * as Haptics from 'expo-haptics';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import {
  Animated, Keyboard, Platform, ScrollView, useWindowDimensions,
  View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type StyleProp, type ViewProps, type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, type NativeGesture } from 'react-native-gesture-handler';

import { sheetCanPull, sheetDrag, sheetRelease } from '@/core/sheet-swipe';

/**
 * Every sheet in the app (a menu or form that slides up from the bottom) closes when you swipe it
 * down, the same as its Cancel or Close button. Use the three pieces together inside the sheet's Modal:
 *
 *   <SheetModal transparent ...>
 *     <SheetRoot>
 *       <Pressable style={scrim} onPress={onClose} />
 *       <SwipeSheet onClose={onClose} style={styles.sheet}>
 *         <SheetScroll>...a long form...</SheetScroll>
 *       </SwipeSheet>
 *     </SheetRoot>
 *   </SheetModal>
 *
 * A pull anywhere on the sheet drags it down; let go far enough (or flick) and it closes, otherwise
 * it springs back. Inside SheetScroll the list scrolls first and the sheet only follows once the list
 * is back at its top. While the keyboard is up, a drag puts the keyboard away instead. Works on
 * iPhone, iPad, Android phones and tablets, and the website (mouse drag).
 */

/**
 * What one sheet knows while a finger is on it: the list's scroll position, whether the touch began
 * in the list, and the latest close callback and screen height. Plain fields, read by the gesture.
 */
class SheetTracker {
  /** The list's own scrolling, which runs alongside the sheet's drag; it notes when a touch starts in the list. */
  readonly list: NativeGesture = listGesture(this);
  listY = 0;
  inList = false;
  mounted = true;
  onClose: () => void = () => {};
  height = 800;
  touchedList() {
    this.inList = true;
  }
  touchEnded() {
    this.inList = false;
  }
  scrolled(y: number) {
    this.listY = y;
  }
  update(onClose: () => void, height: number) {
    this.onClose = onClose;
    this.height = height;
  }
  setMounted(on: boolean) {
    this.mounted = on;
  }
}
function listGesture(tracker: SheetTracker): NativeGesture {
  // Gesture callbacks are turned into worklets, which have no `this`: keep the tracker in the closure.
  return Gesture.Native()
    .runOnJS(true)
    .onBegin(() => tracker.touchedList());
}
const SheetContext = createContext<SheetTracker | null>(null);

/** Gestures inside a Modal need their own root (Android in particular). Fills the Modal like a plain View. */
export function SheetRoot({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <GestureHandlerRootView style={[{ flex: 1 }, style]}>{children}</GestureHandlerRootView>;
}

const native = Platform.OS !== 'web';

export function SwipeSheet({
  onClose, children, style, enabled = true, ref, ...rest
}: Omit<ViewProps, 'style' | 'children'> & {
  onClose: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** False holds the sheet in place (e.g. while it is saving). */
  enabled?: boolean;
  ref?: Ref<View>;
}) {
  const { height } = useWindowDimensions();
  const [drag] = useState(() => new Animated.Value(0));
  const [ctx] = useState(() => new SheetTracker());
  useEffect(() => {
    ctx.update(onClose, height);
  });
  useEffect(() => {
    ctx.setMounted(true);
    return () => ctx.setMounted(false);
  }, [ctx]);

  const pan = useMemo(() => {
    // One drag at a time: whether it may move the sheet, whether it is, where it started pulling, how far.
    const s = { allowed: true, pulling: false, origin: 0, value: 0, closing: false };
    const settle = () => {
      s.value = 0;
      s.pulling = false;
      Animated.spring(drag, { toValue: 0, useNativeDriver: native, bounciness: 4 }).start();
    };
    const close = () => {
      s.closing = true;
      Haptics.selectionAsync();
      Animated.timing(drag, { toValue: ctx.height, duration: 180, useNativeDriver: native }).start(() => {
        ctx.onClose();
        // If the screen kept the sheet open (it was busy), bring it back.
        setTimeout(() => {
          if (!ctx.mounted) return;
          s.closing = false;
          settle();
        }, 700);
      });
    };
    return Gesture.Pan()
      .runOnJS(true)
      .enabled(enabled)
      .activeOffsetY(10)
      .failOffsetX([-24, 24])
      .simultaneousWithExternalGesture(ctx.list)
      .onStart(() => {
        // With the keyboard up, the first drag only puts the keyboard away (the list does that itself).
        const keyboardUp = Keyboard.isVisible();
        if (keyboardUp && !ctx.inList) Keyboard.dismiss();
        s.allowed = !s.closing && !keyboardUp;
        s.pulling = false;
        s.origin = 0;
        s.value = 0;
      })
      .onUpdate((e) => {
        if (!s.allowed) return;
        if (!s.pulling && !sheetCanPull({ keyboardUp: false, inList: ctx.inList, listY: ctx.listY })) {
          // Still scrolling the list back to its top: the sheet starts following from here.
          s.origin = e.translationY;
          return;
        }
        s.value = sheetDrag(e.translationY, s.origin);
        s.pulling = s.value > 0;
        drag.setValue(s.value);
      })
      .onEnd((e) => {
        if (!s.allowed || s.closing) return;
        if (sheetRelease(s.value, e.velocityY) === 'close') close();
        else settle();
      })
      .onFinalize(() => {
        ctx.touchEnded();
        if (!s.closing && s.value > 0) settle();
      });
  }, [drag, ctx, enabled]);

  return (
    <SheetContext.Provider value={ctx}>
      <GestureDetector gesture={pan}>
        <Animated.View
          {...rest}
          ref={ref}
          style={[style, { transform: [{ translateY: drag }] }]}
          onAccessibilityEscape={onClose}>
          {children}
        </Animated.View>
      </GestureDetector>
    </SheetContext.Provider>
  );
}

/**
 * The scrolling body of a SwipeSheet. A drag down scrolls the list back to its top first, then
 * pulls the sheet down. It doesn't bounce at the top, so the pull moves the sheet, not the list.
 * Outside a SwipeSheet it's a plain ScrollView.
 */
export function SheetScroll({ onScroll, onTouchStart, ...props }: ScrollViewProps) {
  const ctx = useContext(SheetContext);
  const scroll = (
    <ScrollView
      bounces={!ctx}
      overScrollMode={ctx ? 'never' : undefined}
      scrollEventThrottle={16}
      {...props}
      onTouchStart={(e) => {
        ctx?.touchedList();
        onTouchStart?.(e);
      }}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        ctx?.scrolled(e.nativeEvent.contentOffset.y);
        onScroll?.(e);
      }}
    />
  );
  if (!ctx) return scroll;
  return <GestureDetector gesture={ctx.list}>{scroll}</GestureDetector>;
}
