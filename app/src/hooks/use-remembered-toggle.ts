import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/** An open/closed switch the phone remembers between visits (for panels riders collapse). */
export function useRememberedToggle(key: string, initial: boolean): [boolean, () => void] {
  const [on, setOn] = useState(initial);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((v) => {
        if (v === '1' || v === '0') setOn(v === '1');
      })
      .catch(() => {});
  }, [key]);

  const toggle = () =>
    setOn((prev) => {
      AsyncStorage.setItem(key, prev ? '0' : '1').catch(() => {});
      return !prev;
    });

  return [on, toggle];
}
