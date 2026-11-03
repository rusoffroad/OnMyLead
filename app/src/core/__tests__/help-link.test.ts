import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HELP_CENTER_PATH, helpCenterPath, helpCenterUrl, SUPPORT_GUIDES } from '../help-link';

const ARTICLES = resolve(__dirname, '../../../../help/articles');

describe('help center links', () => {
  it('points at the Help Center home page', () => {
    expect(HELP_CENTER_PATH).toBe('/help');
    expect(helpCenterPath()).toBe('/help');
    expect(helpCenterUrl()).toBe('https://onmylead.com/help');
  });

  it('links one guide by its slug', () => {
    expect(helpCenterPath('join-a-ride')).toBe('/help/join-a-ride');
    expect(helpCenterUrl('ride-mode')).toBe('https://onmylead.com/help/ride-mode');
  });

  it('uses another site address without doubling slashes', () => {
    expect(helpCenterUrl('faq', 'http://localhost:8081/')).toBe('http://localhost:8081/help/faq');
    expect(helpCenterUrl(null, '')).toBe('https://onmylead.com/help');
  });

  it('falls back to the home page for anything that is not a slug', () => {
    for (const bad of ['', '../admin', 'Ride Mode', 'a/b', '-x', 'x?y=1', 'https://evil.example']) {
      expect(helpCenterPath(bad)).toBe('/help');
    }
  });

  it('only links guides that exist and are out for every app version', () => {
    for (const slug of Object.values(SUPPORT_GUIDES)) {
      const file = resolve(ARTICLES, `${slug}.md`);
      expect(existsSync(file), slug).toBe(true);
      expect(readFileSync(file, 'utf8')).toMatch(/^release: "1\.0"$/m);
    }
  });
});
