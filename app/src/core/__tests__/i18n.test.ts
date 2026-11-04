import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUTO_LANGUAGE,
  DEFAULT_LANGUAGE_SETTING,
  describeLanguage,
  fillPlaceholders,
  LANGUAGES,
  matchLanguage,
  newerLanguageSetting,
  parseLanguageSetting,
  placeholdersOf,
  resolveLanguage,
  translateWith,
} from '../i18n';
import { TRANSLATIONS } from '../translations';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'translations' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Every literal handed to t() or tc() (or an alias) in a file that imports it from lib/i18n or core/i18n. */
function translatedLiterals(): { file: string; text: string }[] {
  const found: { file: string; text: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    const code = readFileSync(file, 'utf8');
    const imp = /import \{([^}]*)\} from '(?:@\/lib\/i18n|@\/core\/i18n|\.\/i18n|\.\.\/i18n)'/.exec(code);
    if (!imp) continue;
    const names = imp[1]
      .split(',')
      .map((s) => s.trim())
      .map((s) => (/^(t|tx|tc) as (\w+)$/.exec(s)?.[2] ?? s))
      .filter((s) => s === 't' || s === 'tx' || s === 'tc' || /^\w+$/.test(s) && imp[1].includes(`as ${s}`));
    for (const n of names) {
      for (const m of code.matchAll(new RegExp(`\\b${n}\\(\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g'))) found.push({ file, text: m[1] });
    }
  }
  return found;
}

describe('device language', () => {
  it('uses the first device language the app speaks, by language not region', () => {
    expect(matchLanguage(['es-MX', 'en-US'])).toBe('es');
    expect(matchLanguage(['pt_BR'])).toBe('pt');
    expect(matchLanguage(['nl-NL', 'de-DE'])).toBe('de');
    expect(matchLanguage(['zh-Hant-TW'])).toBe('zh');
    expect(matchLanguage(['in-ID'])).toBe('id');
  });

  it('falls back to English when it speaks none of them', () => {
    expect(matchLanguage(['nl-NL', 'sv-SE'])).toBe('en');
    expect(matchLanguage([])).toBe('en');
    expect(matchLanguage([null, undefined, ''])).toBe('en');
  });

  it('Match Phone follows the device; a pick wins over it', () => {
    expect(resolveLanguage(AUTO_LANGUAGE, ['fr-CA'])).toBe('fr');
    expect(resolveLanguage('ja', ['fr-CA'])).toBe('ja');
  });
});

describe('the saved setting', () => {
  it('reads back what was saved, and junk as Match Phone', () => {
    expect(parseLanguageSetting(JSON.stringify({ choice: 'ko', updatedAt: '2026-11-03T00:00:00.000Z' }))).toEqual({ choice: 'ko', updatedAt: '2026-11-03T00:00:00.000Z' });
    expect(parseLanguageSetting(null)).toEqual(DEFAULT_LANGUAGE_SETTING);
    expect(parseLanguageSetting('{oops')).toEqual(DEFAULT_LANGUAGE_SETTING);
    expect(parseLanguageSetting({ choice: 'klingon' }).choice).toBe(AUTO_LANGUAGE);
    expect(parseLanguageSetting('de').choice).toBe('de');
  });

  it('keeps the newer of two devices, and this device on a tie', () => {
    const a = { choice: 'es' as const, updatedAt: '2026-11-03T10:00:00.000Z' };
    const b = { choice: 'fr' as const, updatedAt: '2026-11-03T11:00:00.000Z' };
    expect(newerLanguageSetting(a, b)).toBe(b);
    expect(newerLanguageSetting(b, a)).toBe(b);
    expect(newerLanguageSetting(a, { ...b, updatedAt: a.updatedAt })).toBe(a);
  });

  it('describes the choice for the You tab', () => {
    expect(describeLanguage(AUTO_LANGUAGE, 'es', 'Match Phone')).toBe('Español (Match Phone)');
    expect(describeLanguage('de', 'de', 'Match Phone')).toBe('Deutsch');
  });
});

describe('translating a line', () => {
  it('uses the translation, else the English as written', () => {
    expect(translateWith(TRANSLATIONS.es, 'Join a Ride')).toBe('Unirse a una ruta');
    expect(translateWith(TRANSLATIONS.es, 'A line nobody translated')).toBe('A line nobody translated');
    expect(translateWith(null, 'Join a Ride')).toBe('Join a Ride');
  });

  it('fills placeholders, and leaves a missing one visible', () => {
    expect(translateWith(TRANSLATIONS.de, '{n} Left This Month', { n: 2 })).toBe('Noch 2 diesen Monat');
    expect(fillPlaceholders('{n} of {total}', { n: 1 })).toBe('1 of {total}');
    expect(translateWith(null, '{n} trails near you', { n: 3 })).toBe('3 trails near you');
  });

  it('never matches an object key like "constructor"', () => {
    expect(translateWith(TRANSLATIONS.fr, 'constructor')).toBe('constructor');
  });
});

describe('every language', () => {
  const reference = Object.keys(TRANSLATIONS.es).sort();

  it('lists each language once, English first, each with a flag and its own name', () => {
    expect(LANGUAGES[0].code).toBe('en');
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(LANGUAGES.length);
    for (const l of LANGUAGES) {
      expect(l.flag).toMatch(/^\p{RI}\p{RI}$/u);
      expect(l.name.length).toBeGreaterThan(1);
    }
    expect(Object.keys(TRANSLATIONS).sort()).toEqual(LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code).sort());
  });

  for (const [code, dict] of Object.entries(TRANSLATIONS)) {
    it(`${code} has every line, none empty, with the same placeholders`, () => {
      expect(Object.keys(dict).sort()).toEqual(reference);
      for (const [en, line] of Object.entries(dict)) {
        expect(line.trim(), `${code}: ${en}`).not.toBe('');
        expect(placeholdersOf(line), `${code}: ${en}`).toEqual(placeholdersOf(en));
      }
    });
  }

  it('has a translation for every t() line in the app', () => {
    const missing = translatedLiterals()
      .filter(({ text }) => !Object.prototype.hasOwnProperty.call(TRANSLATIONS.es, text.replace(/\\'/g, "'")))
      .map(({ file, text }) => `${file.slice(SRC.length + 1)}: ${text}`);
    expect(missing).toEqual([]);
  });
});
