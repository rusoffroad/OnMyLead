import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/**
 * A short piece of text remembered between visits (the route builder's speed for its time
 * estimate). Keys listed in core/synced-settings follow the account to the rider's other devices.
 */
export function useRememberedText(key: string): [string, (next: string) => void] {
  const [text, setText] = useState('');
  // Once the rider has typed, a slow storage read must not put the old value back.
  const touched = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((v) => {
        if (!touched.current && v != null) setText(v);
      })
      .catch(() => {});
    return onSyncedChange(key, (v) => {
      if (!touched.current) setText(v ?? '');
    });
  }, [key]);

  const set = useCallback(
    (next: string) => {
      touched.current = true;
      setText(next);
      setSyncedItem(key, next || null).catch(() => {});
    },
    [key],
  );

  return [text, set];
}
