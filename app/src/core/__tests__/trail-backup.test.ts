import { describe, expect, it } from 'vitest';

import type { LocalTrail } from '../nav-trails';
import {
  backupCopy, backupPhotoPath, backupPhotoPathsOf, BACKUP_PHOTO_PREFIX, fitsBackup, hashText, parseBackupRows, planTrailSync, TOMBSTONE_KEEP_MS,
} from '../trail-backup';

const ME = 'user-1';
const t = (id: string, updatedAt: string, extra: Partial<LocalTrail> = {}): LocalTrail => ({
  id,
  details: { name: id, description: '', difficulty: 'easy', vehicles: [], surface: null, season: null, maxWidthIn: null, oneWay: false } as unknown as LocalTrail['details'],
  points: [[38.5, -109.5, null, 0]],
  source: 'recorded',
  photos: [],
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt,
  shared: null,
  ...extra,
});
const ms = (iso: string) => Date.parse(iso);
const row = (trailId: string, iso: string, deleted = false) => ({ trailId, data: null, updatedAt: ms(iso), deleted });
const NOW = ms('2026-11-05T00:00:00Z');

describe('planning a trail sync', () => {
  it('sends new and changed trails, and brings down newer and missing ones', () => {
    const local = [t('new', '2026-11-02T00:00:00Z'), t('changed', '2026-11-03T00:00:00Z'), t('stale', '2026-11-01T00:00:00Z'), t('same', '2026-11-01T00:00:00Z')];
    const remote = [row('changed', '2026-11-02T00:00:00Z'), row('stale', '2026-11-04T00:00:00Z'), row('same', '2026-11-01T00:00:00Z'), row('other', '2026-11-01T00:00:00Z')];
    const p = planTrailSync(local, {}, remote, ME, NOW);
    expect(p.upload.map((x) => x.id)).toEqual(['new', 'changed']);
    expect(p.restore.map((x) => x.trailId)).toEqual(['stale', 'other']);
    expect(p.removeLocal).toEqual([]);
  });

  it('carries a delete to the backup and removes trails deleted elsewhere', () => {
    const local = [t('gone-there', '2026-11-01T00:00:00Z')];
    const remote = [row('gone-there', '2026-11-02T00:00:00Z', true), row('gone-here', '2026-11-01T00:00:00Z')];
    const p = planTrailSync(local, { 'gone-here': ms('2026-11-03T00:00:00Z') }, remote, ME, NOW);
    expect(p.removeLocal).toEqual(['gone-there']);
    expect(p.markDeleted).toEqual([{ trailId: 'gone-here', at: ms('2026-11-03T00:00:00Z') }]);
    expect(p.restore).toEqual([]);
  });

  it('keeps a trail edited on another device after it was deleted here', () => {
    const p = planTrailSync([], { edited: ms('2026-11-01T00:00:00Z') }, [row('edited', '2026-11-02T00:00:00Z')], ME, NOW);
    expect(p.markDeleted).toEqual([]);
    expect(p.restore.map((r) => r.trailId)).toEqual(['edited']);
    expect(p.settledTombstones).toEqual(['edited']);
  });

  it('forgets tombstones the backup already agrees with, or never had', () => {
    const p = planTrailSync([], { a: ms('2026-11-01T00:00:00Z'), b: ms('2026-11-01T00:00:00Z') }, [row('a', '2026-10-01T00:00:00Z', true)], ME, NOW);
    expect(p.settledTombstones.sort()).toEqual(['a', 'b']);
    expect(p.markDeleted).toEqual([]);
  });

  it('forgets very old tombstones', () => {
    const old = NOW - TOMBSTONE_KEEP_MS - 1;
    const p = planTrailSync([], { a: old }, [row('a', new Date(old - 1000).toISOString())], ME, NOW);
    expect(p.settledTombstones).toContain('a');
  });

  it('never sends another account’s trails, and claims unowned ones', () => {
    const local = [t('mine', '2026-11-02T00:00:00Z', { owner: ME }), t('theirs', '2026-11-02T00:00:00Z', { owner: 'user-2' }), t('old', '2026-11-02T00:00:00Z')];
    const p = planTrailSync(local, {}, [], ME, NOW);
    expect(p.upload.map((x) => x.id)).toEqual(['mine', 'old']);
  });
});

describe('the backup copy', () => {
  it('points device photos at their private copies and leaves out ones not uploaded yet', () => {
    const trail = t('a', '2026-11-02T00:00:00Z', { photos: ['https://x/trail-photos/p.jpg', 'file:///docs/1.jpg', 'file:///docs/2.jpg'] });
    const { data, missing } = backupCopy(trail, { 'file:///docs/1.jpg': `${ME}/a/0-x.jpg` }, ME);
    expect(data.photos).toEqual(['https://x/trail-photos/p.jpg', `${BACKUP_PHOTO_PREFIX}${ME}/a/0-x.jpg`]);
    expect(missing).toEqual(['file:///docs/2.jpg']);
    expect(data.owner).toBe(ME);
    expect(backupPhotoPathsOf(data)).toEqual([`${ME}/a/0-x.jpg`]);
  });

  it('keeps photos in the rider’s own folder, at a stable path', () => {
    const p = backupPhotoPath(ME, 't1/../x', 'file:///docs/a.png', 2);
    expect(p.startsWith(`${ME}/t1x/2-`)).toBe(true);
    expect(p.endsWith('.png')).toBe(true);
    expect(backupPhotoPath(ME, 't1', 'data:image/jpeg;base64,xx', 0).endsWith('.jpg')).toBe(true);
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
  });

  it('refuses a trail too big for the backup', () => {
    expect(fitsBackup(t('a', '2026-11-02T00:00:00Z'))).toBe(true);
    const huge = t('b', '2026-11-02T00:00:00Z', { points: Array.from({ length: 120_000 }, (_, i) => [38.123456, -109.123456, 1234.5, i] as LocalTrail['points'][number]) });
    expect(fitsBackup(huge)).toBe(false);
  });
});

describe('reading the backup', () => {
  it('takes the list without data and full rows with it', () => {
    const rows = parseBackupRows([
      { trail_id: 'a', deleted: false, updated_at: '2026-11-01T00:00:00Z' },
      { trail_id: 'b', deleted: true, updated_at: '2026-11-01T00:00:00Z', data: null },
      { trail_id: 'c', deleted: false, updated_at: '2026-11-01T00:00:00Z', data: { id: 'wrong', points: [] } },
      { trail_id: 'd', updated_at: 'never' },
      { nope: 1 },
    ]);
    expect(rows.map((r) => r.trailId)).toEqual(['a', 'b', 'c']);
    expect(rows[2].data?.id).toBe('c');
    expect(rows[0].data).toBeNull();
    expect(parseBackupRows(null)).toEqual([]);
  });
});
