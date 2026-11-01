import { describe, expect, it } from 'vitest';

import { AVATAR_BUCKET, avatarPath, avatarUrl, chunk, idsToFetch, isOwnAvatarPath, squareCrop } from '../avatar';

const ME = '00000000-0000-0000-0000-0000000a7a01';
const YOU = '00000000-0000-0000-0000-0000000a7a02';

describe('squareCrop', () => {
  it('takes the centered square of a landscape photo', () => {
    expect(squareCrop(4032, 3024)).toEqual({ originX: 504, originY: 0, width: 3024, height: 3024 });
  });
  it('takes the centered square of a portrait photo', () => {
    expect(squareCrop(1080, 1920)).toEqual({ originX: 0, originY: 420, width: 1080, height: 1080 });
  });
  it('keeps a square photo whole', () => {
    expect(squareCrop(512, 512)).toEqual({ originX: 0, originY: 0, width: 512, height: 512 });
  });
  it('never returns an empty or fractional rectangle', () => {
    expect(squareCrop(0, 0)).toEqual({ originX: 0, originY: 0, width: 1, height: 1 });
    expect(squareCrop(101.7, 50.2)).toEqual({ originX: 25, originY: 0, width: 50, height: 50 });
  });
});

describe('avatar paths', () => {
  it('puts a new picture in the rider\u2019s own folder under a random, unguessable name', () => {
    const token = '3F2A9C1E-7B44-4D0A-9E21-55C0FFEE1234';
    const p = avatarPath(ME, token, 1730505600000);
    expect(p).toBe(`${ME}/3f2a9c1e7b444d0a9e2155c0ffee1234-1730505600000.jpg`);
    expect(isOwnAvatarPath(ME, p)).toBe(true);
    expect(avatarPath(ME, token, 1)).not.toBe(avatarPath(ME, token, 2));
    expect(() => avatarPath(ME, 'short')).toThrow();
  });
  it('matches the database rule: own folder, one plain file name', () => {
    expect(isOwnAvatarPath(ME, `${YOU}/avatar-1.jpg`)).toBe(false);
    expect(isOwnAvatarPath(ME, 'https://evil.example/x.jpg')).toBe(false);
    expect(isOwnAvatarPath(ME, `${ME}/../x.jpg`)).toBe(false);
    expect(isOwnAvatarPath(ME, `${ME}/a/b.jpg`)).toBe(false);
    expect(isOwnAvatarPath(ME, `${ME}/`)).toBe(false);
    expect(isOwnAvatarPath(ME, `${ME}/${'a'.repeat(81)}`)).toBe(false);
    expect(isOwnAvatarPath(ME, null)).toBe(false);
    expect(isOwnAvatarPath(ME, `${ME}/avatar-1.webp`)).toBe(true);
  });
  it('builds the public address only for a valid path', () => {
    expect(avatarUrl('https://x.supabase.co/', ME, `${ME}/avatar-1.jpg`)).toBe(
      `https://x.supabase.co/storage/v1/object/public/${AVATAR_BUCKET}/${ME}/avatar-1.jpg`,
    );
    expect(avatarUrl('https://x.supabase.co', ME, `${YOU}/avatar-1.jpg`)).toBeNull();
    expect(avatarUrl('https://x.supabase.co', ME, null)).toBeNull();
  });
});

describe('batching', () => {
  it('asks only for riders not known or on the way, once each, in order', () => {
    const known = new Set(['a']);
    const pending = new Set(['b']);
    expect(idsToFetch(['a', 'b', 'c', 'c', '', 'd'], known, pending)).toEqual(['c', 'd']);
  });
  it('splits long lists for the query', () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    expect(chunk(ids).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunk([])).toEqual([]);
  });
});
