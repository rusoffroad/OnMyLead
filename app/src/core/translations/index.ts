import type { Dictionary, LanguageCode } from '../i18n';

import es from './es';
import pt from './pt';
import fr from './fr';
import de from './de';
import it from './it';
import ru from './ru';
import zh from './zh';
import ja from './ja';
import ko from './ko';
import hi from './hi';
import id from './id';

/** Every language's lines, by language code. English needs none: its text is the key. */
export const TRANSLATIONS: Record<Exclude<LanguageCode, 'en'>, Dictionary> = { es, pt, fr, de, it, ru, zh, ja, ko, hi, id };
