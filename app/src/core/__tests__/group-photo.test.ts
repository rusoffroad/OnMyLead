import { describe, expect, it } from 'vitest';

import {
  aspectCrop, GROUP_PHOTO_ASPECT, GROUP_PHOTO_BUCKET, groupInitials, groupPhotoPath, groupPhotoUrl, hasAspect, isGroupPhotoPath,
} from '../group-photo';

const OWNER = '00000000-0000-0000-0000-0000000b7a01';
const OTHER = '00000000-0000-0000-0000-0000000b7a02';
const GROUP = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0';

describe('aspectCrop', () => {
  it('takes a centered 16:9 band from a 4:3 landscape photo', () => {
    expect(aspectCrop(4032, 3024)).toEqual({ originX: 0, originY: 378, width: 4032, height: 2268 });
  });
  it('takes a centered 16:9 band from a portrait photo', () => {
    expect(aspectCrop(1080, 1920)).toEqual({ originX: 0, originY: 656, width: 1080, height: 607 });
  });
  it('trims the sides of a very wide panorama', () => {
    expect(aspectCrop(4000, 1000)).toEqual({ originX: 1111, originY: 0, width: 1777, height: 1000 });
  });
  it('keeps a 16:9 photo whole', () => {
    expect(aspectCrop(1280, 720)).toEqual({ originX: 0, originY: 0, width: 1280, height: 720 });
    expect(hasAspect(1280, 720)).toBe(true);
    expect(hasAspect(1920, 1080)).toBe(true);
    expect(hasAspect(4032, 3024)).toBe(false);
    expect(hasAspect(0, 0)).toBe(false);
  });
  it('never returns an empty or fractional rectangle', () => {
    expect(aspectCrop(0, 0)).toEqual({ originX: 0, originY: 0, width: 1, height: 1 });
    const r = aspectCrop(101.7, 50.2);
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
    expect(aspectCrop(10, 10, Number.NaN)).toEqual({ originX: 0, originY: 0, width: 10, height: 10 });
  });
  it('is 16:9 by default', () => {
    expect(GROUP_PHOTO_ASPECT).toBeCloseTo(16 / 9);
  });
});

describe('group photo paths', () => {
  it('puts a new photo in the owner’s own folder under the group id and a random token', () => {
    const p = groupPhotoPath(OWNER, GROUP, '3F2A9C1E-7B44-4D0A-9E21-55C0FFEE1234', 1730505600000);
    expect(p).toBe(`${OWNER}/${GROUP}-3f2a9c1e7b444d0a9e2155c0ffee1234-1730505600000.jpg`);
    expect(isGroupPhotoPath(p, OWNER)).toBe(true);
    expect(isGroupPhotoPath(p)).toBe(true);
  });
  it('refuses a short token', () => {
    expect(() => groupPhotoPath(OWNER, GROUP, 'abc')).toThrow();
  });
  it('matches the database rule: the database allows paths up to 160 characters', () => {
    const p = groupPhotoPath(OWNER, GROUP, 'f'.repeat(32), 9_999_999_999_999);
    expect(p.length).toBeLessThanOrEqual(160);
    expect(p.slice(p.indexOf('/') + 1).length).toBeLessThanOrEqual(120);
  });
  it('never shows a photo from someone else’s folder, another site, or a nested path', () => {
    expect(isGroupPhotoPath(`${OTHER}/x.jpg`, OWNER)).toBe(false);
    expect(isGroupPhotoPath('https://evil.example/x.jpg')).toBe(false);
    expect(isGroupPhotoPath(`${OWNER}/../x.jpg`)).toBe(false);
    expect(isGroupPhotoPath(`${OWNER}/a/b.jpg`)).toBe(false);
    expect(isGroupPhotoPath('not-a-user/x.jpg')).toBe(false);
    expect(isGroupPhotoPath(null)).toBe(false);
    expect(isGroupPhotoPath('')).toBe(false);
  });
});

describe('groupPhotoUrl', () => {
  it('builds the public address in the group-photos bucket', () => {
    expect(groupPhotoUrl('https://x.supabase.co/', `${OWNER}/a.jpg`, OWNER)).toBe(
      `https://x.supabase.co/storage/v1/object/public/${GROUP_PHOTO_BUCKET}/${OWNER}/a.jpg`,
    );
  });
  it('is null without a valid photo', () => {
    expect(groupPhotoUrl('https://x.supabase.co', null)).toBeNull();
    expect(groupPhotoUrl('https://x.supabase.co', `${OTHER}/a.jpg`, OWNER)).toBeNull();
  });
});

describe('groupInitials', () => {
  it('uses the first letters of the first two words', () => {
    expect(groupInitials('Saturday Crew')).toBe('SC');
    expect(groupInitials('moab')).toBe('M');
    expect(groupInitials('  ')).toBe('G');
  });
});
