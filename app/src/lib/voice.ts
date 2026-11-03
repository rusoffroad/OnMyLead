import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';

import { parseVoiceChoice, resolveVoice, type PhoneVoice } from '@/core/voice';

/**
 * Spoken alerts in the most natural voice on this device (core/voice.ts picks it). The choice is
 * kept on the device, not the account: the installed voices differ from phone to phone. Everything
 * here works with no service.
 */

const KEY = 'voice.choice.v1';
let choice: string = parseVoiceChoice(null);
let loaded: Promise<string> | null = null;
const listeners = new Set<(c: string) => void>();
let voices: Promise<PhoneVoice[]> | null = null;

/** The phone's language, e.g. "en-US". */
export function deviceLanguage(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

/**
 * The installed voices. iPhone sometimes answers with an empty list right after launch, and a
 * browser fills its list a moment later, so an empty answer is asked again next time.
 */
export function installedVoices(refresh = false): Promise<PhoneVoice[]> {
  if (refresh) voices = null;
  voices ??= Speech.getAvailableVoicesAsync()
    .then((list) => {
      if (!list.length) voices = null;
      return list as PhoneVoice[];
    })
    .catch(() => {
      voices = null;
      return [];
    });
  return voices;
}

export function loadVoiceChoice(): Promise<string> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((v) => {
      choice = parseVoiceChoice(v);
      listeners.forEach((l) => l(choice));
      return choice;
    })
    .catch(() => choice);
  return loaded;
}

export function setVoiceChoice(next: string) {
  choice = parseVoiceChoice(next);
  loaded = Promise.resolve(choice);
  listeners.forEach((l) => l(choice));
  AsyncStorage.setItem(KEY, choice).catch(() => {});
}

export function useVoiceChoice(): string {
  const [c, setC] = useState(choice);
  useEffect(() => {
    listeners.add(setC);
    loadVoiceChoice().then(setC);
    return () => void listeners.delete(setC);
  }, []);
  return c;
}

/** Read text aloud in a given voice, or the phone's default when there is none. */
export function speakWith(text: string, voice: PhoneVoice | null) {
  Speech.speak(text, voice ? { voice: voice.identifier, language: voice.language } : { language: deviceLanguage() });
}

/**
 * Read a Ride Mode alert aloud in the rider's voice. Never stays silent: if the voice list can't be
 * read, the phone's default voice speaks.
 */
export function speak(text: string) {
  Promise.all([installedVoices(), loadVoiceChoice()])
    .then(([list, saved]) => resolveVoice(list, deviceLanguage(), saved))
    .catch(() => null)
    .then((voice) => speakWith(text, voice));
}

export function stopSpeaking() {
  Speech.stop().catch(() => {});
}
