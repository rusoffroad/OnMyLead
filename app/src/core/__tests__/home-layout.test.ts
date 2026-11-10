import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOME_LAYOUT, HOME_LAYOUT_KEY, HOME_SECTIONS, isDefaultLayout, moveSection, parseHomeLayout, placeSection,
  serializeHomeLayout, shownSections, toggleSection,
} from '../home-layout';
import { SYNCED_SETTINGS } from '../synced-settings';

describe('Customize Home', () => {
  it('shows Out Riding Now, Up Next, Your Group and Feed by default, in that order', () => {
    expect(shownSections(DEFAULT_HOME_LAYOUT)).toEqual(['out', 'next', 'group', 'feed']);
    expect(DEFAULT_HOME_LAYOUT.order).toHaveLength(HOME_SECTIONS.length);
  });

  it('reads back what was saved, and junk as the default', () => {
    const l = toggleSection(moveSection(DEFAULT_HOME_LAYOUT, 'feed', -1), 'past', true);
    expect(parseHomeLayout(serializeHomeLayout(l))).toEqual(l);
    expect(parseHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeLayout('{oops')).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeLayout({ order: 'feed' })).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('drops unknown sections and adds new ones at their default place', () => {
    const l = parseHomeLayout({ order: ['feed', 'weather', 'out', 'feed'], hidden: ['out', 'bogus'] });
    expect(l.order[0]).toBe('feed');
    expect(l.order).toHaveLength(HOME_SECTIONS.length);
    expect(new Set(l.order).size).toBe(l.order.length);
    expect(l.hidden).toContain('out');
    expect(l.hidden).toContain('past');
    expect(l.hidden).not.toContain('next');
  });

  it('moves, places and switches sections', () => {
    expect(moveSection(DEFAULT_HOME_LAYOUT, 'out', -1)).toBe(DEFAULT_HOME_LAYOUT);
    expect(moveSection(DEFAULT_HOME_LAYOUT, 'out', 1).order.slice(0, 2)).toEqual(['next', 'out']);
    expect(placeSection(DEFAULT_HOME_LAYOUT, 'past', 0).order[0]).toBe('past');
    expect(shownSections(toggleSection(DEFAULT_HOME_LAYOUT, 'group', false))).toEqual(['out', 'next', 'feed']);
    expect(isDefaultLayout(DEFAULT_HOME_LAYOUT)).toBe(true);
    expect(isDefaultLayout(toggleSection(DEFAULT_HOME_LAYOUT, 'past', true))).toBe(false);
  });

  it('keeps Badges (top) and Your Toolkit (bottom) out of the sections, even from an old saved layout', () => {
    expect(HOME_SECTIONS.map((s) => s.id)).not.toContain('badges');
    expect(HOME_SECTIONS.map((s) => s.id)).not.toContain('toolkit');
    const l = parseHomeLayout({ order: ['badges', 'feed', 'toolkit', 'out'], hidden: [] });
    expect(l.order).not.toContain('badges');
    expect(l.order).not.toContain('toolkit');
    expect(l.order.indexOf('feed')).toBeLessThan(l.order.indexOf('out'));
  });

  it('follows the account across devices', () => {
    expect(SYNCED_SETTINGS[HOME_LAYOUT_KEY]).toBeTruthy();
  });
});
