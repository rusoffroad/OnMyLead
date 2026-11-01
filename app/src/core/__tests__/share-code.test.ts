import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BLOCKED_SHARE_CODE_PARTS, BLOCKED_SHARE_CODE_WORDS, RESERVED_SHARE_CODE_PARTS, RESERVED_SHARE_CODES,
  cleanShareCode, codeTextSize, friendlyShareCodeError, isMadeCode, shareCodeErrorStatus, shareCodeLine, shareCodeOk,
  shareCodeProblem, shareCodesNotSwitchedOn, typingShareCode,
} from '../share-code';

const migration = readFileSync(join(__dirname, '../../../../supabase/migrations/20261101900000_custom_share_codes.sql'), 'utf8');

/** The quoted words between `-- name:start` and `-- name:end` in the migration. */
function sqlList(name: string): string[] {
  const m = migration.match(new RegExp(`-- ${name}:start([\\s\\S]*?)-- ${name}:end`));
  if (!m) throw new Error(`no ${name} list in the migration`);
  return [...m[1].matchAll(/'([A-Z0-9]+)'/g)].map((x) => x[1]);
}

describe('word lists', () => {
  it('match the database', () => {
    expect(sqlList('reserved')).toEqual([...RESERVED_SHARE_CODES]);
    expect(sqlList('reserved-parts')).toEqual([...RESERVED_SHARE_CODE_PARTS]);
    expect(sqlList('blocked-parts')).toEqual([...BLOCKED_SHARE_CODE_PARTS]);
    expect(sqlList('blocked-words')).toEqual([...BLOCKED_SHARE_CODE_WORDS]);
  });
});

describe('shareCodeProblem', () => {
  // The same cases as supabase/tests/share_codes_test.sql S1, so the app and the database agree.
  it.each([
    ['MOAB-2026', null], ['moab-2026', null], ['  Moab-2026  ', null], ['7F3A9C21', null], ['A1B2C3D4E5', null],
    ['MOAB', 'too_short'], ['ABCDEFGHIJKLMNOPQRSTU', 'too_long'], ['MOAB 2026', 'bad_characters'], ['MOAB--2026', 'bad_characters'],
    ['-MOAB26', 'bad_characters'], ['MOAB26-', 'bad_characters'], ['MOAB_2026', 'bad_characters'], ['MÖAB-2026', 'bad_characters'],
    ['ONMYLEAD', 'reserved'], ['ONMYLEAD-CREW', 'reserved'], ['SUPPORT', 'reserved'], ['RUS-OFFROAD', 'reserved'],
    ['SHIT-RIDE', 'not_allowed'], ['5H1TRIDE', 'not_allowed'], ['RIDE-ASS', 'not_allowed'], ['BIG-D1CK', 'not_allowed'],
    ['MOAB-PASS', null], ['PEACOCK-RUN', null], ['ESSEX-RIDERS', null], ['GRAPE-VINE', null], ['CLASSIC-4X4', null],
  ])('%s → %s', (code, want) => {
    expect(shareCodeProblem(code)).toBe(want);
  });

  it('lets admins use brand words but never blocked ones', () => {
    expect(shareCodeProblem('ONMYLEAD-CREW', true)).toBeNull();
    expect(shareCodeProblem('SHIT-RIDE', true)).toBe('not_allowed');
  });

  it('always accepts the codes OnMyLead makes', () => {
    expect(isMadeCode('7F3A9C21')).toBe(true);
    expect(isMadeCode('MOAB-2026')).toBe(false);
  });
});

describe('typing a code', () => {
  it('tidies as you type', () => {
    expect(typingShareCode('moab 2026')).toBe('MOAB-2026');
    expect(typingShareCode('moab_')).toBe('MOAB-');
    expect(typingShareCode('--mo!!ab  -- 26')).toBe('MOAB-26');
    expect(typingShareCode('a'.repeat(30))).toHaveLength(20);
    expect(typingShareCode(null)).toBe('');
  });
  it('drops a trailing dash when saving', () => {
    expect(cleanShareCode('moab-')).toBe('MOAB');
    expect(cleanShareCode(' Saturday Crew ')).toBe('SATURDAY-CREW');
  });
});

describe('status lines', () => {
  it('says what the database answered', () => {
    expect(shareCodeLine('available', 'ride')).toBe('Available');
    expect(shareCodeLine('taken', 'group')).toBe('Another group already uses this code');
    expect(shareCodeLine('yours', 'friend')).toBe('This is your friend link’s code now');
    expect(shareCodeOk('available')).toBe(true);
    expect(shareCodeOk('yours')).toBe(true);
    expect(shareCodeOk('taken')).toBe(false);
    expect(shareCodeOk(null)).toBe(false);
  });
  it('reads the server errors', () => {
    expect(shareCodeErrorStatus('share_code_taken')).toBe('taken');
    expect(shareCodeErrorStatus('share_code_not_allowed')).toBe('not_allowed');
    expect(shareCodeErrorStatus('duplicate key value violates unique constraint "rides_invite_code_key"')).toBe('taken');
    expect(shareCodeErrorStatus('something else')).toBeNull();
    expect(friendlyShareCodeError('share_code_reserved', 'ride')).toBe('That code is saved for OnMyLead. Pick another');
    expect(friendlyShareCodeError('Network request failed', 'ride')).toBe('No signal. Check your connection and try again.');
    expect(friendlyShareCodeError('boom', 'ride')).toBe('boom');
  });
  it('knows when the server has no custom codes yet', () => {
    expect(shareCodesNotSwitchedOn('Could not find the function public.share_code_status(p_code, p_id, p_kind) in the schema cache')).toBe(true);
    expect(shareCodesNotSwitchedOn('x', 'PGRST202')).toBe(true);
    expect(shareCodesNotSwitchedOn('share_code_taken')).toBe(false);
  });
});

describe('codeTextSize', () => {
  it('keeps made-up codes big and shrinks long typed ones', () => {
    expect(codeTextSize('7F3A9C21', 28).fontSize).toBe(28);
    expect(codeTextSize('ABCDEFGHIJKLMNOPQRST', 28).fontSize).toBe(14);
    expect(codeTextSize('MOAB-RUN-2026', 28).fontSize).toBeLessThan(28);
  });
});
