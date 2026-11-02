import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addSavedReply, parseSavedReplies, removeSavedReply } from '@/core/ride-message';

const KEY = 'ride.savedReplies.v1';

/** The rider's own Ride Mode quick replies, kept on this device. */
export function useSavedReplies() {
  const [saved, setSaved] = useState<string[]>([]);
  const touched = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (!touched.current) setSaved(parseSavedReplies(v));
      })
      .catch(() => {});
  }, []);

  const update = useCallback((change: (list: string[]) => string[]) => {
    touched.current = true;
    setSaved((prev) => {
      const next = change(prev);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const save = useCallback((body: string) => update((l) => addSavedReply(l, body)), [update]);
  const remove = useCallback((body: string) => update((l) => removeSavedReply(l, body)), [update]);
  return { saved, save, remove };
}
