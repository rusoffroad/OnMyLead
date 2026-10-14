import { describe, expect, it } from 'vitest';

import { compareVersions, filterRelease, matchesAny, parseArticle, renderMarkdown, searchHelp, visibility } from '../help';

const ARTICLE = `---
title: Create a Ride
summary: Set a meeting point and time, choose who can find the ride, and share it.
category: rides
order: 10
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/ride/new.tsx
screenshots:
  - file: create.webp
    shows: app/src/app/ride/new.tsx
related: [join-a-ride, invite-riders]
keywords: [new ride, plan]
---

Intro.

## Steps
`;

describe('help articles', () => {
  it('reads front matter', () => {
    const a = parseArticle('create-a-ride', ARTICLE);
    expect(a.title).toBe('Create a Ride');
    expect(a.release).toBe('1.0');
    expect(a.order).toBe(10);
    expect(a.sources).toEqual(['app/src/app/ride/new.tsx']);
    expect(a.screenshots).toEqual([{ file: 'create.webp', shows: ['app/src/app/ride/new.tsx'] }]);
    expect(a.related).toEqual(['join-a-ride', 'invite-riders']);
    expect(a.body.startsWith('Intro.')).toBe(true);
  });

  it('refuses an article without front matter', () => {
    expect(() => parseArticle('x', 'Just text')).toThrow(/front matter/);
  });
});

describe('release awareness', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });

  it('publishes only what the live version has', () => {
    const base = { draft: false, review: null };
    expect(visibility({ ...base, release: '1.0' }, '1.0')).toBe('published');
    expect(visibility({ ...base, release: '1.1' }, '1.0')).toBe('upcoming');
    expect(visibility({ ...base, release: 'web' }, null)).toBe('published');
    expect(visibility({ ...base, release: '1.0' }, null)).toBe('upcoming');
    expect(visibility({ draft: false, review: 'check', release: '1.0' }, '1.0')).toBe('needs-review');
    expect(visibility({ draft: true, review: null, release: '1.0' }, '1.0')).toBe('draft');
  });

  it('hides release blocks until their version is live, and until blocks after', () => {
    const md = 'A\n:::release 1.1\nNew\n:::\n:::until 1.1\nOld\n:::\n:::tip\nKeep\n:::\nZ';
    expect(filterRelease(md, '1.0')).toBe('A\nOld\n:::tip\nKeep\n:::\nZ');
    expect(filterRelease(md, '1.1')).toBe('A\nNew\n:::tip\nKeep\n:::\nZ');
    expect(filterRelease(md, null)).toBe('A\nOld\n:::tip\nKeep\n:::\nZ');
  });

  it('keeps a callout inside a release block with the block', () => {
    const md = ':::release 2.0\n:::note\nSoon\n:::\n:::\nAfter';
    expect(filterRelease(md, '1.0')).toBe('After');
  });
});

describe('markdown', () => {
  it('renders steps, callouts and links, and escapes HTML', () => {
    const r = renderMarkdown('## Do It\n\n1. Tap **Go**.\n2. See [Join](/help/join-a-ride).\n\n:::tip\nNice <b>x</b>\n:::');
    expect(r.html).toContain('<h2 id="do-it">Do It</h2>');
    expect(r.html).toContain('<ol><li>Tap <strong>Go</strong>.</li>');
    expect(r.html).toContain('<a href="/help/join-a-ride">Join</a>');
    expect(r.html).toContain('callout-tip');
    expect(r.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(r.links).toEqual(['/help/join-a-ride']);
  });

  it('never makes a javascript: link', () => {
    expect(renderMarkdown('[x](javascript:alert(1))').html).not.toContain('javascript:');
  });

  it('renders tables and lone images as figures', () => {
    const r = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n\n![Shot](/help/img/a.webp)');
    expect(r.html).toContain('<th>A</th>');
    expect(r.html).toContain('<figure class="shot">');
    expect(r.images).toEqual(['/help/img/a.webp']);
  });
});

describe('sources and search', () => {
  it('matches source globs', () => {
    expect(matchesAny('app/src/app/garage/[id]/edit.tsx', ['app/src/app/garage/**'])).toBe(true);
    expect(matchesAny('app/src/app/_layout.tsx', ['app/src/app/**/_layout.tsx'])).toBe(true);
    expect(matchesAny('app/src/core/pro.ts', ['app/src/core/*.tsx'])).toBe(false);
  });

  it('ranks title matches first and needs every word', () => {
    const docs = [
      { slug: 'offline-maps', title: 'Offline Maps', summary: 'Save maps', category: 'Maps', keywords: [], headings: [], text: 'download an area' },
      { slug: 'ride-mode', title: 'Ride Mode', summary: 'Live map', category: 'Ride', keywords: ['offline'], headings: [], text: 'maps' },
    ];
    expect(searchHelp(docs, 'offline maps').map((d) => d.slug)).toEqual(['offline-maps', 'ride-mode']);
    expect(searchHelp(docs, 'offline lunch')).toEqual([]);
  });
});
