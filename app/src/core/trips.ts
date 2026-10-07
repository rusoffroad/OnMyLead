/** Trip planner: checklist categories, starter templates, progress and merging. Pure, no I/O. */

/** Checklist categories in display order. Ids match the database check constraint. */
export const TRIP_CATEGORIES = [
  { id: 'recovery', label: 'Recovery' },
  { id: 'tools_spares', label: 'Tools & Spares' },
  { id: 'first_aid', label: 'First Aid' },
  { id: 'navigation_comms', label: 'Navigation & Comms' },
  { id: 'power_starlink', label: 'Power & Starlink' },
  { id: 'camping', label: 'Camping' },
  { id: 'food_water', label: 'Food & Water' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'fuel_fluids', label: 'Fuel & Fluids' },
  { id: 'documents', label: 'Documents' },
  { id: 'other', label: 'Other' },
] as const;

export type TripCategory = (typeof TRIP_CATEGORIES)[number]['id'];

const CATEGORY_ORDER = new Map<string, number>(TRIP_CATEGORIES.map((c, i) => [c.id, i]));

export const isTripCategory = (s: string): s is TripCategory => CATEGORY_ORDER.has(s);
export const categoryLabel = (id: string) => TRIP_CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';

export type TemplateItem = { name: string; category: TripCategory; quantity?: number; notes?: string };
export type TripTemplate = { id: string; label: string; blurb: string; items: TemplateItem[] };

const t = (category: TripCategory, ...names: (string | [string, number])[]): TemplateItem[] =>
  names.map((n) => (Array.isArray(n) ? { name: n[0], category, quantity: n[1] } : { name: n, category }));

/** Starter lists a rider can add in one tap. Adding more than one merges them without duplicates. */
export const TRIP_TEMPLATES: TripTemplate[] = [
  {
    id: 'day_ride',
    label: 'Day ride',
    blurb: 'The basics for a day on the trail',
    items: [
      ...t('food_water', ['Water (1 gal per person)', 1], 'Snacks / lunch'),
      ...t('clothing', 'Helmet', 'Goggles or glasses', 'Gloves', 'Rain or warm layer'),
      ...t('navigation_comms', 'Phone + charging cable', 'Offline maps downloaded', 'Radio (charged)'),
      ...t('fuel_fluids', 'Full tank'),
      ...t('first_aid', 'Basic first aid kit', 'Sunscreen'),
      ...t('tools_spares', 'Tire plug kit', 'Air compressor or pump'),
      ...t('documents', 'Driver license / ID', 'Trail permit or OHV sticker'),
    ],
  },
  {
    id: 'overnight',
    label: 'Overnight / camping',
    blurb: 'Sleep out under the stars',
    items: [
      ...t('camping', 'Tent or rooftop tent', 'Sleeping bag', 'Sleeping pad', 'Camp chairs', 'Headlamp + spare batteries', 'Lantern', 'Trash bags', 'Fire extinguisher'),
      ...t('food_water', ['Water (1 gal per person per day)', 2], 'Stove + fuel', 'Cookware + utensils', 'Cooler + ice', 'Meals for each day', 'Coffee'),
      ...t('clothing', 'Warm jacket', 'Extra socks', 'Toiletries'),
      ...t('fuel_fluids', 'Extra fuel'),
    ],
  },
  {
    id: 'desert',
    label: 'Desert',
    blurb: 'Heat, sand and long distances',
    items: [
      ...t('food_water', ['Extra water (2 gal per person)', 2], 'Electrolytes'),
      ...t('clothing', 'Sun hat', 'Long sleeves', 'Buff / face cover for dust'),
      ...t('recovery', 'Traction boards', 'Shovel'),
      ...t('tools_spares', 'Spare air filter', 'Tire deflator', 'Tire pressure gauge'),
      ...t('navigation_comms', 'Whip light / flag'),
      ...t('fuel_fluids', 'Extra fuel', 'Coolant'),
    ],
  },
  {
    id: 'mountain_snow',
    label: 'Mountain / snow',
    blurb: 'Cold, altitude and slick trails',
    items: [
      ...t('clothing', 'Insulated jacket', 'Winter gloves', 'Beanie', 'Waterproof boots', 'Base layers'),
      ...t('recovery', 'Tire chains', 'Shovel', 'Traction boards'),
      ...t('camping', 'Emergency blanket', 'Hand warmers'),
      ...t('tools_spares', 'Ice scraper', 'Jumper pack'),
      ...t('food_water', 'Hot drinks thermos'),
    ],
  },
  {
    id: 'recovery_kit',
    label: 'Recovery kit',
    blurb: 'Get unstuck and help others',
    items: t(
      'recovery',
      'Kinetic recovery rope',
      'Tow strap',
      ['Soft shackles', 2],
      ['D-ring shackles', 2],
      'Tree saver strap',
      'Snatch block',
      'Winch controller',
      'Recovery gloves',
      'Traction boards',
      'Shovel',
      'Hi-lift or bottle jack + base',
    ),
  },
  {
    id: 'first_aid',
    label: 'First aid',
    blurb: 'Patch up people on the trail',
    items: t(
      'first_aid',
      'Bandages + gauze',
      'Tourniquet',
      'Trauma shears',
      'Pain relievers',
      'Antihistamine',
      'Burn gel',
      'Splint',
      'Emergency blanket',
      'Personal medications',
      'Emergency contact card',
    ),
  },
  {
    id: 'tools_spares',
    label: 'Tools & spares',
    blurb: 'Fix it and keep going',
    items: [
      ...t('tools_spares', 'Socket + wrench set', 'Screwdrivers + pliers', 'Zip ties', 'Duct tape', 'Electrical tape + spare fuses', 'Spare belt (CVT)', 'Belt change tools', 'Spare tire + lug wrench', 'Tire plug kit', 'Air compressor', 'Jumper pack', 'Baling wire', 'Hose clamps'),
      ...t('fuel_fluids', 'Engine oil', 'Coolant'),
    ],
  },
  {
    id: 'starlink_power',
    label: 'Starlink / power',
    blurb: 'Stay online off grid',
    items: t(
      'power_starlink',
      'Starlink dish',
      'Starlink mount',
      'Starlink cable / power supply',
      'Battery pack (charged)',
      '12V or USB-C power cable',
      'Solar panel',
      'Inverter',
      'Extension cord',
    ),
  },
];

export const templateById = (id: string) => TRIP_TEMPLATES.find((x) => x.id === id);

export type ChecklistItem = { name: string; category: string; checked: boolean; quantity: number };

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Template items not already on the list (same name, ignoring case and spacing). */
export function itemsToAdd(existing: { name: string }[], template: TemplateItem[]): TemplateItem[] {
  const have = new Set(existing.map((i) => key(i.name)));
  const out: TemplateItem[] = [];
  for (const item of template) {
    const k = key(item.name);
    if (have.has(k)) continue;
    have.add(k);
    out.push(item);
  }
  return out;
}

export type Progress = { packed: number; total: number; done: boolean; label: string; fraction: number };

export function progress(items: { checked: boolean }[]): Progress {
  const total = items.length;
  const packed = items.filter((i) => i.checked).length;
  return {
    packed,
    total,
    done: total > 0 && packed === total,
    fraction: total ? packed / total : 0,
    label: total ? `${packed} of ${total} packed` : 'Nothing on the list yet',
  };
}

export type CategoryGroup<T extends { category: string }> = { category: TripCategory; label: string; items: T[] };

/** Group items by category in display order, keeping each group's order as given. */
export function groupByCategory<T extends { category: string }>(items: T[]): CategoryGroup<T>[] {
  const groups = new Map<TripCategory, CategoryGroup<T>>();
  for (const item of items) {
    const c: TripCategory = isTripCategory(item.category) ? item.category : 'other';
    let g = groups.get(c);
    if (!g) {
      g = { category: c, label: categoryLabel(c), items: [] };
      groups.set(c, g);
    }
    g.items.push(item);
  }
  return [...groups.values()].sort((a, b) => CATEGORY_ORDER.get(a.category)! - CATEGORY_ORDER.get(b.category)!);
}

/** Categories that are on the list but not all packed, for gear suggestions. */
export const categoriesOnList = (items: { category: string }[]) =>
  [...new Set(items.map((i) => (isTripCategory(i.category) ? i.category : 'other')))];

/**
 * Turn a ride's free-text "Bring" and "Required" notes into checklist items.
 * Splits on new lines, commas, semicolons and bullets; drops blanks and duplicates.
 */
export function itemsFromRideNotes(...notes: (string | null | undefined)[]): TemplateItem[] {
  const out: TemplateItem[] = [];
  const seen = new Set<string>();
  for (const note of notes) {
    if (!note) continue;
    for (const raw of note.split(/[\n,;•]+/)) {
      const name = raw.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim().slice(0, 200);
      if (!name || seen.has(key(name))) continue;
      seen.add(key(name));
      out.push({ name, category: guessCategory(name) });
    }
  }
  return out;
}

const GUESSES: [RegExp, TripCategory][] = [
  [/strap|shackle|winch|recovery|traction|shovel|\btow\b|snatch|jack/i, 'recovery'],
  [/first aid|\bmed|bandage|tourniquet/i, 'first_aid'],
  [/radio|gmrs|\bham\b|map|gps|whip|flag|satellite|inreach/i, 'navigation_comms'],
  [/starlink|battery|solar|inverter|charger|power/i, 'power_starlink'],
  [/\btent|sleep|chair|lantern|headlamp|camp|extinguisher/i, 'camping'],
  [/water|food|snack|lunch|cooler|\bice\b|stove/i, 'food_water'],
  [/helmet|goggle|glove|jacket|layer|boots|\bhat\b|clothes|clothing/i, 'clothing'],
  [/fuel|gas|oil|coolant|fluid/i, 'fuel_fluids'],
  [/license|permit|registration|insurance|\bid\b|sticker/i, 'documents'],
  [/tool|spare|tire|belt|plug|compressor|fuse|tape|zip tie/i, 'tools_spares'],
];

export function guessCategory(name: string): TripCategory {
  for (const [re, c] of GUESSES) if (re.test(name)) return c;
  return 'other';
}

/** A date range for display: "Oct 12", "Oct 12 – 14", "Oct 30 – Nov 2". Dates are YYYY-MM-DD. */
export function tripDates(startsOn: string | null, endsOn: string | null): string | null {
  const fmt = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return { y, m, d, month: MONTHS[m - 1] ?? '' };
  };
  if (!startsOn && !endsOn) return null;
  if (!startsOn || !endsOn || startsOn === endsOn) {
    const a = fmt((startsOn ?? endsOn)!);
    return `${a.month} ${a.d}`;
  }
  const a = fmt(startsOn);
  const b = fmt(endsOn);
  if (a.y === b.y && a.m === b.m) return `${a.month} ${a.d} – ${b.d}`;
  return `${a.month} ${a.d} – ${b.month} ${b.d}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Local calendar date of an ISO timestamp, as YYYY-MM-DD. */
export function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
