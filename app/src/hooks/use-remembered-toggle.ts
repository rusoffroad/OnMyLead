import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/** An open/closed switch the phone remembers between visits (for panels riders collapse). */
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
  }, [key]);

  const set = useCallback(
    (next: boolean) => {
      touched.current = true;
      setOn(next);
      AsyncStorage.setItem(key, next ? '1' : '0').catch(() => {});
    },
    [key],
  );

  const toggle = useCallback(() => {
    touched.current = true;
    setOn((prev) => {
      AsyncStorage.setItem(key, prev ? '0' : '1').catch(() => {});
      return !prev;
    });
  }, [key]);

  return [on, toggle, set];
}
