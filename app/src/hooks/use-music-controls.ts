import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { useFlag } from '@/lib/app-settings';
import { musicAvailable } from '@/lib/music';
import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';

// Each rider's own Music Controls switch (You > Music Controls), shared by every screen so turning
// it off in the Music sheet hides the button everywhere at once. On unless the rider turned it off.
const KEY = 'music.controls.v1';

let on = true;
let loaded = false;
const listeners = new Set<() => void>();

// Changed on another device (lib/settings-sync).
onSyncedChange(KEY, (v) => {
  on = v !== '0';
  loaded = true;
  listeners.forEach((f) => f());
});

function subscribe(l: () => void) {
  listeners.add(l);
  if (!loaded) {
    loaded = true;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === '0' || v === '1') {
          on = v === '1';
          listeners.forEach((f) => f());
        }
      })
      .catch(() => {});
  }
  return () => {
    listeners.delete(l);
  };
}

export function setMusicControls(next: boolean) {
  on = next;
  loaded = true;
  setSyncedItem(KEY, next ? '1' : '0').catch(() => {});
  listeners.forEach((f) => f());
}

/** The rider's switch, whether or not this phone can show Music Controls. */
export function useMusicControlsSetting(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => on, () => on);
  return [value, setMusicControls];
}

/** True when the Music button should show: a phone build with the module, the rider's switch on, and the owner's flag on. */
export function useMusicControls(): boolean {
  const [mine] = useMusicControlsSetting();
  const flag = useFlag('music_controls');
  return musicAvailable && mine && flag;
}
