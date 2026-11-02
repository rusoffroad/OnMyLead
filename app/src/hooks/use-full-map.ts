import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { LayoutAnimation, Platform } from 'react-native';

import { fullMapKey } from '@/core/full-map';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';

/**
 * Full Map on a map screen (see core/full-map). With a `key` the phone remembers the choice, so
 * a rider who likes the big map gets it every time; with null it starts off each visit. On the
 * website and with a keyboard, F enters Full Map and Esc leaves it.
 */
export function useFullMap(key: string | null) {
  const [remembered, , setRemembered] = useRememberedToggle(key ?? 'map.fullMap.unused', false);
  const [local, setLocal] = useState(false);
  const full = key ? remembered : local;

  const set = useCallback(
    (on: boolean) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (Platform.OS !== 'web') Haptics.selectionAsync();
      if (key) setRemembered(on);
      else setLocal(on);
    },
    [key, setRemembered],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      const act = fullMapKey(e.key, full, typing);
      if (act) {
        e.preventDefault();
        set(act === 'enter');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [full, set]);

  return { full, enter: useCallback(() => set(true), [set]), exit: useCallback(() => set(false), [set]) };
}
