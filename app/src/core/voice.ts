/**
 * Which voice reads Ride Mode's spoken alerts. Pure, no I/O: lib/voice.ts asks the phone for its
 * installed voices and passes them in.
 *
 * Phones hand an app their plainest voice unless it asks for another. On iPhone and iPad that is
 * a small "compact" voice, which is what sounds robotic. Every phone already carries better ones,
 * and they all work with no service (alerts matter most out of signal), so we never use a voice
 * that needs the network:
 *
 * - iPhone, iPad: Apple's Premium and Enhanced voices (identifiers `com.apple.voice.premium.*`,
 *   `com.apple.voice.enhanced.*`, older `com.apple.ttsbundle.*-premium`). Free downloads in
 *   Settings > Accessibility > Read & Speak (Spoken Content on older iOS) > Voices. Siri's own
 *   voice can't be used by apps. expo-speech reports Premium as "Default" quality, so the
 *   identifier decides. The novelty voices (Bubbles, Zarvox...) and the Eloquence voices
 *   (Grandpa, Rocko...) are left out.
 * - Android: Google's voices; a name ending `-network` needs service and is left out, and a
 *   quality above normal (expo-speech "Enhanced") is preferred.
 * - Website: the browser's voices; "Natural", "Premium" and "Enhanced" ones first, and "Online"
 *   (cloud) voices are left out.
 */

export type VoiceQuality = 'Default' | 'Enhanced';

/** What expo-speech's getAvailableVoicesAsync returns for each voice. */
export type PhoneVoice = { identifier: string; name: string; language: string; quality: VoiceQuality | string };

/** Best first. `novelty` and `network` voices are never offered or picked. */
export type VoiceTier = 'premium' | 'enhanced' | 'standard' | 'novelty' | 'network';

const TIER_RANK: Record<VoiceTier, number> = { premium: 3, enhanced: 2, standard: 1, novelty: -1, network: -1 };

/** The saved choice: let the app pick, or one voice by its identifier. */
export const AUTO_VOICE = 'auto';

/** What Play Sample reads: the kind of thing Ride Mode actually says. */
export const VOICE_SAMPLE = 'Regroup point set. Sam is falling behind.';

/** iPhone voices that are sound effects or deliberately synthetic, not readers. */
const NOVELTY_NAMES = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'good news', 'hysterical',
  'jester', 'organ', 'pipe organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox', 'fred', 'junior',
  'kathy', 'ralph', 'princess',
]);

/** Natural-sounding voices worth trying first when two voices tie (iPhone and Android). */
const FAVORITES = ['ava', 'zoe', 'evan', 'nathan', 'noelle', 'tom', 'allison', 'susan', 'samantha', 'joelle', 'serena', 'daniel', 'karen'];

function baseName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

export function voiceTier(v: PhoneVoice): VoiceTier {
  const id = v.identifier.toLowerCase();
  const name = v.name.toLowerCase();
  // Cloud voices go silent with no service.
  if (/-network$/.test(id) || /\bonline\b/.test(name)) return 'network';
  if (id.includes('com.apple.speech.synthesis.voice') || id.includes('com.apple.eloquence') || NOVELTY_NAMES.has(baseName(name).toLowerCase())) {
    return 'novelty';
  }
  if (id.includes('.premium') || id.endsWith('-premium') || name.includes('premium') || /\bnatural\b/.test(name)) return 'premium';
  if (id.includes('.enhanced') || name.includes('enhanced') || v.quality === 'Enhanced') return 'enhanced';
  return 'standard';
}

/** "en-US", "en_us" and "en-us-x-iob-local" all read as en / US. */
function splitLang(tag: string): { lang: string; region: string } {
  const [lang = '', region = ''] = tag.replace(/_/g, '-').toLowerCase().split('-');
  return { lang, region };
}

/** 2 same language and region, 1 same language, 0 another language (not offered). */
export function languageMatch(voiceLang: string, wanted: string): number {
  const a = splitLang(voiceLang);
  const b = splitLang(wanted);
  if (!a.lang || a.lang !== b.lang) return 0;
  return a.region && a.region === b.region ? 2 : 1;
}

function favoriteRank(v: PhoneVoice): number {
  const i = FAVORITES.indexOf(baseName(v.name).toLowerCase());
  return i < 0 ? FAVORITES.length : i;
}

function compare(wanted: string) {
  return (a: PhoneVoice, b: PhoneVoice) =>
    TIER_RANK[voiceTier(b)] - TIER_RANK[voiceTier(a)] ||
    languageMatch(b.language, wanted) - languageMatch(a.language, wanted) ||
    favoriteRank(a) - favoriteRank(b) ||
    a.name.localeCompare(b.name);
}

/**
 * The voices a rider can pick from: the phone's language, offline, no novelty voices, best first,
 * one entry per voice.
 */
export function voiceChoices(voices: readonly PhoneVoice[], wanted: string): PhoneVoice[] {
  const seen = new Set<string>();
  const usable = voices.filter((v) => TIER_RANK[voiceTier(v)] > 0 && languageMatch(v.language, wanted) > 0);
  // Android lists its default voice for a language twice: as "en-US-language" and as the voice it
  // points at ("en-us-x-iob-local"). Keep the named one.
  const hasNamed = new Set(usable.filter((v) => /-x-/i.test(v.identifier)).map((v) => langKey(v.language)));
  return usable
    .filter((v) => !(/-language$/i.test(v.identifier) && hasNamed.has(langKey(v.language))))
    .sort(compare(wanted))
    .filter((v) => (seen.has(v.identifier) ? false : (seen.add(v.identifier), true)));
}

/** The voice the app picks on its own: the most natural offline voice in the phone's language. */
export function bestVoice(voices: readonly PhoneVoice[], wanted: string): PhoneVoice | null {
  return voiceChoices(voices, wanted)[0] ?? null;
}

/**
 * The voice to speak with: the rider's pick while it is still installed, otherwise the best one.
 * Null means none fits, and the phone's default voice reads it (never silence).
 */
export function resolveVoice(voices: readonly PhoneVoice[], wanted: string, saved: string | null | undefined): PhoneVoice | null {
  if (saved && saved !== AUTO_VOICE) {
    const pick = voices.find((v) => v.identifier === saved);
    if (pick && TIER_RANK[voiceTier(pick)] > 0) return pick;
  }
  return bestVoice(voices, wanted);
}

/** "en-US", "en_us", "en-us-x-iob" all key as "en-us". */
function langKey(tag: string): string {
  const { lang, region } = splitLang(tag);
  return region ? `${lang}-${region}` : lang;
}

/**
 * Android names its voices by engine code ("en-us-x-iob-local", "en-US-language"), which mean
 * nothing to a rider. Apple and browser voices have real names ("Zoe", "Google US English").
 */
export function isEngineName(name: string): boolean {
  return !/\s/.test(name.trim()) && /^[a-z]{2,3}[-_][a-z]{2,3}([-_]|$)/i.test(name.trim());
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch',
  sv: 'Swedish', da: 'Danish', nb: 'Norwegian', no: 'Norwegian', fi: 'Finnish', pl: 'Polish', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', ru: 'Russian', tr: 'Turkish', ar: 'Arabic', hi: 'Hindi',
};

/** Short region words riders say: "US English", "UK English", "Mexican Spanish". */
const REGION_NAMES: Record<string, string> = {
  'en-us': 'US English', 'en-gb': 'UK English', 'en-au': 'Australian English', 'en-ca': 'Canadian English',
  'en-in': 'Indian English', 'en-ie': 'Irish English', 'en-nz': 'New Zealand English', 'en-za': 'South African English',
  'en-ng': 'Nigerian English', 'es-es': 'Spain Spanish', 'es-mx': 'Mexican Spanish', 'es-us': 'US Spanish',
  'fr-fr': 'France French', 'fr-ca': 'Canadian French', 'pt-br': 'Brazilian Portuguese', 'pt-pt': 'Portugal Portuguese',
};

/** "US English", or "English (PH)" for a region without a short name. */
export function languageName(tag: string): string {
  const key = langKey(tag);
  if (REGION_NAMES[key]) return REGION_NAMES[key];
  const { lang, region } = splitLang(tag);
  const name = LANGUAGE_NAMES[lang] ?? lang.toUpperCase();
  return region ? `${name} (${region.toUpperCase()})` : name;
}

/**
 * What the Voice screen calls a voice: "Zoe (Premium)", "Samantha (Enhanced)", "Samantha", or for
 * an Android engine code "US English Voice 2". Engine voices are numbered within their language by
 * identifier, so a voice keeps its number while the list's order changes; pass the listed voices
 * as `all` for that numbering.
 */
export function voiceLabel(v: PhoneVoice, all: readonly PhoneVoice[] = [v]): string {
  if (isEngineName(v.name)) {
    const key = langKey(v.language || v.name);
    const same = all
      .filter((o) => isEngineName(o.name) && langKey(o.language || o.name) === key)
      .map((o) => o.identifier)
      .sort();
    const n = Math.max(0, same.indexOf(v.identifier)) + 1;
    return `${languageName(v.language || v.name)} Voice ${n}`;
  }
  const tier = voiceTier(v);
  const name = baseName(v.name) || v.name;
  if (tier === 'premium') return `${name} (Premium)`;
  if (tier === 'enhanced') return `${name} (Enhanced)`;
  return name;
}

/**
 * True when the phone has no Premium or Enhanced voice in the rider's language, so the Voice screen
 * should say how to download one.
 */
export function suggestDownload(voices: readonly PhoneVoice[], wanted: string): boolean {
  const best = bestVoice(voices, wanted);
  return !best || voiceTier(best) === 'standard';
}

export function parseVoiceChoice(v: string | null | undefined): string {
  return v && v.trim() ? v : AUTO_VOICE;
}
