/**
 * The app's languages: which ones there are, which one a rider gets, and how a line of text is
 * translated. Pure, so it is tested without a phone (core/__tests__/i18n.test.ts).
 *
 * The English text in the code IS the key: `t('Join a Ride')` looks the line up in the rider's
 * language and falls back to the English when there is no translation yet. So a screen nobody has
 * translated still works, in English, and a translation can never break a screen.
 *
 * Placeholders are written {name}: `t('{n} Left This Month', { n: 2 })`. Every translation must
 * keep the same placeholders (the test checks).
 *
 * ADDING A LINE: wrap it in t('...') (or pass it to a shared component that translates for you:
 * ThemedText, Button, Field, MenuRow, MenuGroup, Segmented, Choice, Tag, Section, confirmAsync,
 * showNotice), then add it to every file in core/translations. The test fails until each language
 * has it.
 *
 * ADDING A LANGUAGE: add it to LANGUAGES, add core/translations/<code>.ts, list it in
 * TRANSLATIONS (core/translations/index.ts), and add its code to expo-localization's
 * supportedLocales and to `locales` in app/app.json.
 */

export type LanguageCode = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'ru' | 'zh' | 'ja' | 'ko' | 'hi' | 'id';

export type Language = {
  code: LanguageCode;
  /** The language's own name, the way its speakers write it. */
  name: string;
  /** Its name in English, under the native name in the switcher (and for search). */
  english: string;
  /** A flag riders recognise for the language. Languages aren't countries; this is the most-spoken one. */
  flag: string;
  /** The BCP-47 tag for dates and numbers (toLocaleString) and the website's <html lang>. */
  locale: string;
};

/**
 * The most widely spoken languages that read left to right, in the order the switcher shows them
 * (English first). Arabic and other right-to-left languages need the layout mirrored and are a
 * documented follow-up (docs/feature-parity.md, Exceptions).
 */
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', english: 'English', flag: '🇺🇸', locale: 'en-US' },
  { code: 'es', name: 'Español', english: 'Spanish', flag: '🇪🇸', locale: 'es' },
  { code: 'pt', name: 'Português', english: 'Portuguese', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'fr', name: 'Français', english: 'French', flag: '🇫🇷', locale: 'fr' },
  { code: 'de', name: 'Deutsch', english: 'German', flag: '🇩🇪', locale: 'de' },
  { code: 'it', name: 'Italiano', english: 'Italian', flag: '🇮🇹', locale: 'it' },
  { code: 'ru', name: 'Русский', english: 'Russian', flag: '🇷🇺', locale: 'ru' },
  { code: 'zh', name: '中文（简体）', english: 'Chinese (Simplified)', flag: '🇨🇳', locale: 'zh-Hans' },
  { code: 'ja', name: '日本語', english: 'Japanese', flag: '🇯🇵', locale: 'ja' },
  { code: 'ko', name: '한국어', english: 'Korean', flag: '🇰🇷', locale: 'ko' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', flag: '🇮🇳', locale: 'hi' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian', flag: '🇮🇩', locale: 'id' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** "Match Phone": follow the device's own language (the default for every rider). */
export const AUTO_LANGUAGE = 'auto';
export type LanguageChoice = LanguageCode | typeof AUTO_LANGUAGE;

/** What is saved on the device and synced to the rider's account. */
export type LanguageSetting = { choice: LanguageChoice; updatedAt: string };
export const DEFAULT_LANGUAGE_SETTING: LanguageSetting = { choice: AUTO_LANGUAGE, updatedAt: '1970-01-01T00:00:00.000Z' };

const CODES = new Set<string>(LANGUAGES.map((l) => l.code));
export const isLanguageCode = (v: unknown): v is LanguageCode => typeof v === 'string' && CODES.has(v);

export function languageByCode(code: LanguageCode): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/**
 * The first of the device's preferred languages (most preferred first, BCP-47 tags such as
 * "es-MX", "zh-Hant-TW", "pt_BR") that the app speaks, else English. Only the language counts,
 * not the region, so a phone set to Spanish (Mexico) gets Spanish. Traditional Chinese gets
 * Simplified Chinese, which its readers can follow, rather than English.
 */
export function matchLanguage(tags: readonly (string | null | undefined)[]): LanguageCode {
  for (const tag of tags) {
    if (!tag) continue;
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    // Old Indonesian code some Android versions still report.
    const code = primary === 'in' ? 'id' : primary;
    if (isLanguageCode(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}

/** The language the app shows: the rider's pick, or (Match Phone) the device's language. */
export function resolveLanguage(choice: LanguageChoice, deviceTags: readonly (string | null | undefined)[]): LanguageCode {
  return choice === AUTO_LANGUAGE ? matchLanguage(deviceTags) : choice;
}

/** Reads the saved JSON (or anything else) back into a setting; junk becomes Match Phone. */
export function parseLanguageSetting(raw: unknown): LanguageSetting {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      // A bare code ("es") written by hand still counts.
      return isLanguageCode(raw) || raw === AUTO_LANGUAGE ? { choice: raw, updatedAt: DEFAULT_LANGUAGE_SETTING.updatedAt } : DEFAULT_LANGUAGE_SETTING;
    }
  }
  if (!v || typeof v !== 'object') return DEFAULT_LANGUAGE_SETTING;
  const o = v as { choice?: unknown; updatedAt?: unknown };
  const choice = o.choice === AUTO_LANGUAGE || isLanguageCode(o.choice) ? (o.choice as LanguageChoice) : AUTO_LANGUAGE;
  const updatedAt = typeof o.updatedAt === 'string' && !Number.isNaN(Date.parse(o.updatedAt)) ? o.updatedAt : DEFAULT_LANGUAGE_SETTING.updatedAt;
  return { choice, updatedAt };
}

/** Of two settings (this device's and the account's), the one changed last. A tie keeps `local`. */
export function newerLanguageSetting(local: LanguageSetting, remote: LanguageSetting): LanguageSetting {
  return Date.parse(remote.updatedAt) > Date.parse(local.updatedAt) ? remote : local;
}

/** Fills {name} placeholders. A placeholder with no value is left as it is, so a gap is visible. */
export function fillPlaceholders(text: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name] ?? '') : whole));
}

/** The {name} placeholders in a line, sorted, for checking a translation keeps them all. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

export type Dictionary = Readonly<Record<string, string>>;

/**
 * One line in the rider's language: its translation if there is one, else the English as written.
 * Text that isn't a string (a number, nothing) comes back as it is.
 */
export function translateWith(dict: Dictionary | null | undefined, text: string, vars?: Record<string, string | number | null | undefined>): string {
  const found = dict && Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : undefined;
  return fillPlaceholders(found || text, vars);
}

/** The description on the You tab's Language row: "Español (Match Phone)" or just "Deutsch". */
export function describeLanguage(choice: LanguageChoice, shown: LanguageCode, matchPhoneWord: string): string {
  const name = languageByCode(shown).name;
  return choice === AUTO_LANGUAGE ? `${name} (${matchPhoneWord})` : name;
}

type Translator = (text: string, vars?: Record<string, string | number | null | undefined>) => string;
let coreTranslator: Translator = (text, vars) => fillPlaceholders(text, vars);
let coreLocaleTag = 'en-US';

/**
 * Translation for text built in core/ (time left, statuses, summaries). Core stays pure: the app
 * (lib/i18n.ts) plugs in the rider's language at launch, and tests get English.
 */
export function tc(text: string, vars?: Record<string, string | number | null | undefined>): string {
  return coreTranslator(text, vars);
}
/** The rider's BCP-47 tag for dates and numbers built in core/ ('en-US' in tests). */
export const coreLocale = () => coreLocaleTag;
/** lib/i18n.ts calls this at launch and on every language change. */
export function setCoreTranslator(tr: Translator, locale: string) {
  coreTranslator = tr;
  coreLocaleTag = locale;
}
