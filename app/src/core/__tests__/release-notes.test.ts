import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type AppRelease, checkReleaseNotes, groupNotes, publishedReleases, storeState } from '../release-notes';

const rel = (version: string, apple: string | null, google: string | null, extra: Partial<AppRelease> = {}): AppRelease => ({
  version,
  title: `Version ${version}`,
  intro: 'Intro.',
  whatsNew: 'Fixes and improvements.',
  apple,
  google,
  notes: [{ kind: 'fixed', text: 'A fix.' }],
  ...extra,
});

const ALL = [rel('1.0.2', null, null), rel('1.0.1', null, '2026-10-20'), rel('1.0', '2026-10-28', null)];

describe('release notes', () => {
  it('publishes only versions a store has released', () => {
    const shown = publishedReleases(ALL, { apple: { version: '1.0' }, google: { version: '1.0.1' } });
    expect(shown.map((r) => r.version)).toEqual(['1.0.1', '1.0']);
  });

  it('publishes a version as soon as Apple reports it live, with its release day', () => {
    const stores = { apple: { version: '1.0.2', releasedAt: '2026-11-05T07:00:00Z' }, google: { version: '1.0.1' } };
    expect(publishedReleases(ALL, stores).map((r) => r.version)).toEqual(['1.0.2', '1.0.1', '1.0']);
    expect(storeState(ALL[0], 'apple', ALL, stores)).toEqual({ state: 'released', date: '2026-11-05' });
  });

  it('never publishes a version the stores have not reached', () => {
    expect(publishedReleases(ALL, { apple: { version: null }, google: { version: null } }).map((r) => r.version)).toEqual(['1.0.1', '1.0']);
    expect(storeState(ALL[0], 'google', ALL, { apple: { version: '1.0' }, google: { version: '1.0.1' } })).toEqual({ state: 'pending' });
  });

  it('says which later version brought a skipped one to a store', () => {
    const stores = { apple: { version: '1.0.2' }, google: { version: '1.0.1' } };
    expect(storeState(ALL[1], 'apple', ALL, stores)).toEqual({ state: 'later', version: '1.0.2' });
    expect(storeState(ALL[2], 'google', ALL, stores)).toEqual({ state: 'later', version: '1.0.1' });
  });

  it('groups notes New, Improved, Fixed', () => {
    const r = rel('1.0', null, null, {
      notes: [
        { kind: 'fixed', text: 'f' },
        { kind: 'new', text: 'n1' },
        { kind: 'new', text: 'n2' },
      ],
    });
    expect(groupNotes(r).map((g) => [g.title, g.notes.map((n) => n.text)])).toEqual([
      ['New', ['n1', 'n2']],
      ['Fixed', ['f']],
    ]);
  });

  it('checks the file', () => {
    expect(checkReleaseNotes(ALL, '1.0.2')).toEqual([]);
    expect(checkReleaseNotes(ALL, '1.0.3')[0]).toMatch(/no notes for it/);
    expect(checkReleaseNotes([...ALL].reverse()).some((e) => /newest first/.test(e))).toBe(true);
    expect(checkReleaseNotes([rel('1.0', null, null, { whatsNew: 'x'.repeat(501) })])[0]).toMatch(/at most 500/);
    expect(checkReleaseNotes([rel('1.0', null, null, { intro: 'Faster — and better.' })])[0]).toMatch(/dashes/);
    expect(checkReleaseNotes([rel('1.0', 'Oct 28', null)])[0]).toMatch(/date/);
    expect(checkReleaseNotes([rel('1.0', null, null, { notes: [{ kind: 'new', text: 'x', devices: 'watch' as never }] })])[0]).toMatch(/devices/);
  });

  it('the real file passes and covers the app version', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    const notes = JSON.parse(readFileSync(join(root, 'help', 'release-notes.json'), 'utf8'));
    const app = JSON.parse(readFileSync(join(root, 'app', 'app.json'), 'utf8'));
    expect(checkReleaseNotes(notes, app.expo.version)).toEqual([]);
  });
});
