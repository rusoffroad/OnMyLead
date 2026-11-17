import { describe, expect, it } from 'vitest';
import { sharingRefused } from '../share-refused';

describe('sharingRefused', () => {
  it('is true for a row-level security refusal (no active share left)', () => {
    expect(sharingRefused({ code: '42501', message: 'new row violates row-level security policy' } as never)).toBe(true);
  });

  it('is false for no error, a dropped connection or any other database error', () => {
    expect(sharingRefused(null)).toBe(false);
    expect(sharingRefused(undefined)).toBe(false);
    expect(sharingRefused({ code: '' })).toBe(false);
    expect(sharingRefused({ code: 'PGRST301' })).toBe(false);
    expect(sharingRefused({ code: '23505' })).toBe(false);
  });
});
