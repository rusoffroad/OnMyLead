/**
 * Custom share codes: the code in a ride link (onmylead.com/r/CODE), a riding group link (/g/CODE)
 * and a friend link (/friend/CODE). Riders can keep the code OnMyLead made or type their own.
 *
 * The database has the final say (share_code_problem() in migration 20261101900000, the unique
 * constraints, and the set_*_code functions). These rules mirror it so the app can explain a
 * problem while the rider types. The word lists here and in the migration are kept in sync by
 * core/__tests__/share-code.test.ts.
 *
 * A code is 6 to 20 letters (A to Z) and numbers, with single dashes between words, like
 * MOAB-2026. Case doesn't matter: codes are kept in capitals, so moab-2026 opens the same ride.
 */

export type ShareCodeKind = 'ride' | 'group' | 'friend';

export const SHARE_CODE_MIN = 6;
export const SHARE_CODE_MAX = 20;

/** What the database says about a code: free, already this ride/group/link's, taken, or a problem. */
export type ShareCodeStatus = 'available' | 'yours' | 'taken' | ShareCodeProblem;
export type ShareCodeProblem = 'too_short' | 'too_long' | 'bad_characters' | 'reserved' | 'not_allowed';

/** Words that could pass for OnMyLead itself or a page on the site. Blocked as the whole code. */
export const RESERVED_SHARE_CODES = [
  'ADMIN', 'ADMINS', 'ADMINISTRATOR', 'ANDROID', 'API', 'APPLE', 'APPSTORE', 'BILLING', 'CHANGELOG', 'CONTACT', 'DOWNLOAD',
  'FRIEND', 'FRIENDS', 'GOOGLE', 'GOOGLEPLAY', 'GROUP', 'GROUPS', 'HELP', 'HELPCENTER', 'INVITE', 'IPHONE', 'LOGIN', 'LOGOUT',
  'MODERATOR', 'NULL', 'OFFICIAL', 'ONMYLEAD', 'PASSWORD', 'PRIVACY', 'PRO', 'RELEASENOTES', 'RIDE', 'RIDES', 'RUSOFFROAD',
  'SETTINGS', 'SIGNIN', 'SIGNUP', 'STAFF', 'SUPPORT', 'SYSTEM', 'TERMS', 'TEST', 'UNDEFINED',
] as const;

/** Brand words that can't appear anywhere in a code, so nobody passes as OnMyLead staff. */
export const RESERVED_SHARE_CODE_PARTS = ['ONMYLEAD', 'RUSOFFROAD', 'ADMIN'] as const;

/** Never allowed anywhere in a code (these don't hide inside ordinary words). */
export const BLOCKED_SHARE_CODE_PARTS = [
  'FUCK', 'SHIT', 'CUNT', 'BITCH', 'NIGGER', 'NIGGA', 'FAGGOT', 'WHORE', 'SLUT', 'PUSSY', 'ASSHOLE', 'MOTHERFUCK',
  'DICKHEAD', 'HITLER', 'NAZI', 'KKK', 'PORN', 'BLOWJOB', 'JIZZ', 'WANKER', 'TWAT',
] as const;

/**
 * Not allowed as the whole code or as one word of it. Only whole words, so ordinary words that
 * happen to contain them (PASS, PEACOCK, GRAPE, ESSEX) still work.
 */
export const BLOCKED_SHARE_CODE_WORDS = [
  'ASS', 'ARSE', 'BOOB', 'BOOBS', 'COCK', 'CUM', 'DICK', 'DILDO', 'FAG', 'HOE', 'PENIS', 'PISS', 'RAPE', 'RAPIST', 'SEX',
  'SEXY', 'TIT', 'TITS', 'VAGINA', 'ANAL', 'NUDE', 'NUDES', 'DAMN', 'CRAP', 'BASTARD',
] as const;

/** Numbers riders use in place of letters, so F4G or 5H1T are caught too. */
const LEET: Record<string, string> = { '0': 'O', '1': 'I', '3': 'E', '4': 'A', '5': 'S', '7': 'T' };
const deLeet = (s: string) => s.replace(/[013457]/g, (c) => LEET[c]);

/** The codes OnMyLead makes itself: 8 (rides) or 10 (groups, friend links) of 0-9 and A-F. */
export const isMadeCode = (code: string) => /^[0-9A-F]{8,10}$/.test(code);

/**
 * Tidy what a rider is typing, keystroke by keystroke: capitals, spaces and underscores become
 * dashes, anything else is dropped, no double or leading dashes, at most 20 characters. A
 * trailing dash stays while they type the next word.
 */
export function typingShareCode(raw: string | null | undefined): string {
  return (raw ?? '')
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, SHARE_CODE_MAX);
}

/** The code as it is saved: what typingShareCode makes, without a trailing dash. */
export function cleanShareCode(raw: string | null | undefined): string {
  return typingShareCode(raw).replace(/-+$/, '');
}

/**
 * Why a code can't be used, or null when its shape and words are fine (it may still be taken).
 * `allowReserved` is for OnMyLead's admins, who may use the brand words.
 */
export function shareCodeProblem(raw: string | null | undefined, allowReserved = false): ShareCodeProblem | null {
  const code = (raw ?? '').trim().toUpperCase();
  if (code.length < SHARE_CODE_MIN) return 'too_short';
  if (code.length > SHARE_CODE_MAX) return 'too_long';
  if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(code)) return 'bad_characters';
  if (isMadeCode(code)) return null;
  const flat = code.replace(/-/g, '');
  if (!allowReserved) {
    if ((RESERVED_SHARE_CODES as readonly string[]).includes(flat)) return 'reserved';
    if (RESERVED_SHARE_CODE_PARTS.some((w) => flat.includes(w))) return 'reserved';
  }
  const plain = deLeet(flat);
  if (BLOCKED_SHARE_CODE_PARTS.some((w) => flat.includes(w) || plain.includes(w))) return 'not_allowed';
  const words = [flat, plain, ...code.split('-'), ...code.split('-').map(deLeet)];
  if (words.some((w) => (BLOCKED_SHARE_CODE_WORDS as readonly string[]).includes(w))) return 'not_allowed';
  return null;
}

const NOUN: Record<ShareCodeKind, string> = { ride: 'ride', group: 'group', friend: 'friend link' };

/** One line for the rider about a code's status. */
export function shareCodeLine(status: ShareCodeStatus, kind: ShareCodeKind): string {
  switch (status) {
    case 'available': return 'Available';
    case 'yours': return `This is your ${NOUN[kind]}’s code now`;
    case 'taken': return `Another ${NOUN[kind]} already uses this code`;
    case 'too_short': return `Use at least ${SHARE_CODE_MIN} letters or numbers`;
    case 'too_long': return `Use ${SHARE_CODE_MAX} characters or fewer`;
    case 'bad_characters': return 'Use letters, numbers and single dashes only';
    case 'reserved': return 'That code is saved for OnMyLead. Pick another';
    case 'not_allowed': return 'That code isn’t allowed. Pick another';
  }
}

/** True for the statuses that let the rider save. */
export const shareCodeOk = (status: ShareCodeStatus | null | undefined) => status === 'available' || status === 'yours';

/** The server's code errors (share_code_<reason>), or null when it's another error. */
export function shareCodeErrorStatus(message: string | null | undefined): ShareCodeStatus | null {
  const m = message ?? '';
  const named = m.match(/share_code_(taken|too_short|too_long|bad_characters|reserved|not_allowed)/);
  if (named) return named[1] as ShareCodeStatus;
  // A brand-new ride saved with a code someone else just took (the unique constraint).
  if (/duplicate key.*invite_code|invite_code_key|friend_codes_code_key/i.test(m)) return 'taken';
  return null;
}

/** True when the database doesn't have custom codes yet (before migration 20261101900000). */
export function shareCodesNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42883', 'PGRST202'].includes(code)) return true;
  return !!message && /(share_code_status|set_(ride|group|friend)_code)/.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

export const SHARE_CODES_NOT_SWITCHED_ON = 'Custom codes aren’t switched on yet. They start working with the next server update.';

/** A friendly line for an error from saving a code. */
export function friendlyShareCodeError(message: string, kind: ShareCodeKind): string {
  if (shareCodesNotSwitchedOn(message)) return SHARE_CODES_NOT_SWITCHED_ON;
  const status = shareCodeErrorStatus(message);
  if (status) return shareCodeLine(status, kind);
  if (/network request failed|failed to fetch|fetch failed|network error/i.test(message)) return 'No signal. Check your connection and try again.';
  return message;
}

/**
 * Type size for showing a code big (the invite card, the full-screen QR code). Made-up codes are
 * 8 or 10 characters; a typed one can be 20, so longer codes get smaller to stay on one line.
 * Sized here rather than with adjustsFontSizeToFit, which shrank codes to a few points on iOS.
 */
export function codeTextSize(code: string, base: number): { fontSize: number; lineHeight: number; letterSpacing: number } {
  const n = code.length;
  const fontSize = n <= 10 ? base : Math.max(Math.round(base / 2), Math.floor((base * 10) / n));
  return { fontSize, lineHeight: Math.round(fontSize * 1.15), letterSpacing: n <= 10 ? Math.round(base / 9) : 1 };
}
