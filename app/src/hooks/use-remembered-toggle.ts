import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

/**
 * An open/closed switch remembered between visits (for panels riders collapse). Keys listed in
 * core/synced-settings follow the account to the rider's other devices.
 */
export function useRememberedToggle(key: string, initial: boolean): [boolean, () => void, (on: boolean) => void] {
  const [on, setOn] = useState(initial);
  // Once the rider has toggled, a slow storage read must not flip the panel back.
  const touched = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((v) => {
        if (!touched.current && (v === '1' || v === '0')) setOn(v === '1');
      })
      .catch(() => {});
    return onSyncedChange(key, (v) => setOn(v == null ? initial : v === '1'));
    // initial is the screen's default; a change to it alone needn't re-read storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: boolean) => {
      touched.current = true;
      setOn(next);
      setSyncedItem(key, next ? '1' : '0').catch(() => {});
    },
    [key],
  );

  const toggle = useCallback(() => {
    touched.current = true;
    setOn((prev) => {
      setSyncedItem(key, prev ? '0' : '1').catch(() => {});
      return !prev;
    });
  }, [key]);

  return [on, toggle, set];
}
