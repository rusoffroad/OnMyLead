import { describe, expect, it } from 'vitest';

import {
  AUTO_VOICE, bestVoice, languageMatch, parseVoiceChoice, resolveVoice, suggestDownload, voiceChoices, voiceLabel, voiceTier,
  type PhoneVoice,
} from '../voice';

const v = (identifier: string, name: string, language = 'en-US', quality = 'Default'): PhoneVoice => ({ identifier, name, language, quality });

// What an iPhone reports (expo-speech calls Premium "Default", so the identifier decides).
const samanthaCompact = v('com.apple.voice.compact.en-US.Samantha', 'Samantha');
const zoePremium = v('com.apple.voice.premium.en-US.Zoe', 'Zoe');
const avaEnhanced = v('com.apple.voice.enhanced.en-US.Ava', 'Ava', 'en-US', 'Enhanced');
const danielGB = v('com.apple.voice.compact.en-GB.Daniel', 'Daniel', 'en-GB');
const zarvox = v('com.apple.speech.synthesis.voice.Zarvox', 'Zarvox');
const grandpa = v('com.apple.eloquence.en-US.Grandpa', 'Grandpa');
const bubbles = v('com.apple.voice.compact.en-US.Bubbles', 'Bubbles');
const thomasFR = v('com.apple.voice.premium.fr-FR.Thomas', 'Thomas', 'fr-FR');
const iphone = [samanthaCompact, zarvox, grandpa, bubbles, danielGB, thomasFR, avaEnhanced, zoePremium];

// Android (Google): local voices, network twins and a plain one.
const iobLocal = v('en-us-x-iob-local', 'en-us-x-iob-local', 'en-US', 'Enhanced');
const iobNetwork = v('en-us-x-iob-network', 'en-us-x-iob-network', 'en-US', 'Enhanced');
const plainAndroid = v('en-US-language', 'en-US-language', 'en_US');

describe('voice tiers', () => {
  it('reads Apple identifiers, whatever quality expo-speech reports', () => {
    expect(voiceTier(zoePremium)).toBe('premium');
    expect(voiceTier(v('com.apple.ttsbundle.Samantha-premium', 'Samantha'))).toBe('premium');
    expect(voiceTier(avaEnhanced)).toBe('enhanced');
    expect(voiceTier(samanthaCompact)).toBe('standard');
  });

  it('never offers novelty, Eloquence or cloud voices', () => {
    expect(voiceTier(zarvox)).toBe('novelty');
    expect(voiceTier(grandpa)).toBe('novelty');
    expect(voiceTier(bubbles)).toBe('novelty');
    expect(voiceTier(iobNetwork)).toBe('network');
    expect(voiceTier(v('x', 'Microsoft Aria Online (Natural) - English (United States)'))).toBe('network');
  });

  it('treats Android high quality and browser Natural voices as better than standard', () => {
    expect(voiceTier(iobLocal)).toBe('enhanced');
    expect(voiceTier(plainAndroid)).toBe('standard');
    expect(voiceTier(v('y', 'Samantha (Enhanced)'))).toBe('enhanced');
  });
});

describe('language', () => {
  it('matches region first, then language, across tag styles', () => {
    expect(languageMatch('en-US', 'en-US')).toBe(2);
    expect(languageMatch('en_us', 'en-US')).toBe(2);
    expect(languageMatch('en-GB', 'en-US')).toBe(1);
    expect(languageMatch('fr-FR', 'en-US')).toBe(0);
    expect(languageMatch('', 'en-US')).toBe(0);
  });
});

describe('picking a voice', () => {
  it('picks Premium over Enhanced over compact on an iPhone', () => {
    expect(bestVoice(iphone, 'en-US')).toBe(zoePremium);
    expect(bestVoice([samanthaCompact, avaEnhanced], 'en-US')).toBe(avaEnhanced);
  });

  it('prefers the rider’s own region when quality ties', () => {
    expect(bestVoice([danielGB, samanthaCompact], 'en-US')).toBe(samanthaCompact);
    expect(bestVoice([danielGB, samanthaCompact], 'en-GB')).toBe(danielGB);
  });

  it('picks an offline Google voice, never the network twin', () => {
    expect(bestVoice([iobNetwork, plainAndroid, iobLocal], 'en-US')).toBe(iobLocal);
    expect(bestVoice([iobNetwork], 'en-US')).toBeNull();
  });

  it('lists choices best first, one each, in the phone’s language only', () => {
    const list = voiceChoices([...iphone, zoePremium], 'en-US');
    expect(list).toEqual([zoePremium, avaEnhanced, samanthaCompact, danielGB]);
  });

  it('keeps the rider’s pick while it is installed, and falls back when it is gone', () => {
    expect(resolveVoice(iphone, 'en-US', samanthaCompact.identifier)).toBe(samanthaCompact);
    expect(resolveVoice(iphone, 'en-US', AUTO_VOICE)).toBe(zoePremium);
    expect(resolveVoice(iphone, 'en-US', 'com.apple.voice.premium.en-US.Gone')).toBe(zoePremium);
    expect(resolveVoice(iphone, 'en-US', zarvox.identifier)).toBe(zoePremium);
    expect(resolveVoice([], 'en-US', null)).toBeNull();
  });

  it('suggests a download only when nothing better than standard is installed', () => {
    expect(suggestDownload([samanthaCompact, zarvox], 'en-US')).toBe(true);
    expect(suggestDownload([], 'en-US')).toBe(true);
    expect(suggestDownload(iphone, 'en-US')).toBe(false);
  });
});

describe('labels and saved choice', () => {
  it('names the tier once', () => {
    expect(voiceLabel(zoePremium)).toBe('Zoe (Premium)');
    expect(voiceLabel(v('com.apple.voice.premium.en-US.Zoe', 'Zoe (Premium)'))).toBe('Zoe (Premium)');
    expect(voiceLabel(avaEnhanced)).toBe('Ava (Enhanced)');
    expect(voiceLabel(samanthaCompact)).toBe('Samantha');
  });

  it('defaults to Automatic', () => {
    expect(parseVoiceChoice(null)).toBe(AUTO_VOICE);
    expect(parseVoiceChoice('  ')).toBe(AUTO_VOICE);
    expect(parseVoiceChoice(zoePremium.identifier)).toBe(zoePremium.identifier);
  });
});
