import { describe, expect, it } from 'vitest';
import {
  TRIP_CATEGORIES, TRIP_TEMPLATES, categoriesOnList, categoryLabel, groupByCategory, guessCategory, isIsoDate,
  isTripCategory, itemsFromRideNotes, itemsToAdd, progress, templateById, tripDates,
} from '../trips';

describe('templates', () => {
  it('has the eight starter lists Chris asked for', () => {
    expect(TRIP_TEMPLATES.map((x) => x.label)).toEqual([
      'Day ride', 'Overnight / camping', 'Desert', 'Mountain / snow', 'Recovery kit', 'First aid', 'Tools & spares', 'Starlink / power',
    ]);
  });

  it('only uses real categories, sane quantities and no duplicate names within a template', () => {
    for (const tpl of TRIP_TEMPLATES) {
      expect(tpl.items.length, tpl.id).toBeGreaterThan(4);
      const names = tpl.items.map((i) => i.name.toLowerCase());
      expect(new Set(names).size, tpl.id).toBe(names.length);
      for (const item of tpl.items) {
        expect(isTripCategory(item.category), item.name).toBe(true);
        expect(item.name.length).toBeLessThanOrEqual(200);
        if (item.quantity != null) expect(item.quantity).toBeGreaterThanOrEqual(1);
      }
    }
    expect(templateById('desert')?.label).toBe('Desert');
    expect(templateById('nope')).toBeUndefined();
  });

  it('category ids match the database list', () => {
    expect(TRIP_CATEGORIES.map((c) => c.id)).toEqual([
      'recovery', 'tools_spares', 'first_aid', 'navigation_comms', 'power_starlink', 'camping', 'food_water', 'clothing',
      'fuel_fluids', 'documents', 'other',
    ]);
    expect(categoryLabel('power_starlink')).toBe('Power & Starlink');
    expect(categoryLabel('junk')).toBe('Other');
  });
});

describe('merging templates', () => {
  it('skips items already on the list, ignoring case and spacing', () => {
    const existing = [{ name: 'shovel' }, { name: ' Traction   boards ' }];
    const add = itemsToAdd(existing, templateById('recovery_kit')!.items);
    const names = add.map((i) => i.name);
    expect(names).not.toContain('Shovel');
    expect(names).not.toContain('Traction boards');
    expect(names).toContain('Kinetic recovery rope');
    expect(add.length).toBe(templateById('recovery_kit')!.items.length - 2);
  });

  it('adding the same template twice adds nothing the second time', () => {
    const first = itemsToAdd([], templateById('day_ride')!.items);
    expect(itemsToAdd(first, templateById('day_ride')!.items)).toEqual([]);
  });

  it('dedupes inside the incoming list too', () => {
    const add = itemsToAdd([], [
      { name: 'Shovel', category: 'recovery' },
      { name: 'shovel', category: 'camping' },
    ]);
    expect(add).toEqual([{ name: 'Shovel', category: 'recovery' }]);
  });
});

describe('progress', () => {
  it('counts packed items', () => {
    const items = [...Array(20)].map((_, i) => ({ checked: i < 12 }));
    expect(progress(items)).toEqual({ packed: 12, total: 20, done: false, fraction: 0.6, label: '12 of 20 packed' });
    expect(progress(items.map(() => ({ checked: true }))).done).toBe(true);
    expect(progress([])).toEqual({ packed: 0, total: 0, done: false, fraction: 0, label: 'Nothing on the list yet' });
  });
});

describe('grouping', () => {
  it('groups by category in display order and keeps order inside a group', () => {
    const groups = groupByCategory([
      { name: 'Snacks', category: 'food_water' },
      { name: 'Strap', category: 'recovery' },
      { name: 'Water', category: 'food_water' },
      { name: 'Mystery', category: 'bogus' },
    ]);
    expect(groups.map((g) => g.category)).toEqual(['recovery', 'food_water', 'other']);
    expect(groups[1].items.map((i) => i.name)).toEqual(['Snacks', 'Water']);
    expect(groups[1].label).toBe('Food & Water');
    expect(categoriesOnList([{ category: 'recovery' }, { category: 'recovery' }, { category: 'x' }])).toEqual(['recovery', 'other']);
  });
});

describe('ride notes', () => {
  it('splits a ride\'s bring and required notes into items with guessed categories', () => {
    const items = itemsFromRideNotes('Water, lunch; radio\n- Tow strap\n1. Helmet', 'Whip flag • Fire extinguisher, water', null);
    expect(items).toEqual([
      { name: 'Water', category: 'food_water' },
      { name: 'lunch', category: 'food_water' },
      { name: 'radio', category: 'navigation_comms' },
      { name: 'Tow strap', category: 'recovery' },
      { name: 'Helmet', category: 'clothing' },
      { name: 'Whip flag', category: 'navigation_comms' },
      { name: 'Fire extinguisher', category: 'camping' },
    ]);
    expect(itemsFromRideNotes(null, undefined, '  ')).toEqual([]);
  });

  it('guesses categories without tripping on parts of words', () => {
    expect(guessCategory('Spare belt')).toBe('tools_spares');
    expect(guessCategory('Towel')).toBe('other');
    expect(guessCategory('Driver ID')).toBe('documents');
    expect(guessCategory('Brake fluid')).toBe('fuel_fluids');
    expect(guessCategory('Starlink Mini')).toBe('power_starlink');
    expect(guessCategory('Sunscreen')).toBe('other');
  });
});

describe('dates', () => {
  it('formats a trip date range', () => {
    expect(tripDates(null, null)).toBeNull();
    expect(tripDates('2026-10-12', null)).toBe('Oct 12');
    expect(tripDates('2026-10-12', '2026-10-12')).toBe('Oct 12');
    expect(tripDates('2026-10-12', '2026-10-14')).toBe('Oct 12 – 14');
    expect(tripDates('2026-10-30', '2026-11-02')).toBe('Oct 30 – Nov 2');
  });

  it('validates YYYY-MM-DD', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
  });
});
