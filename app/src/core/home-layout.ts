/**
 * Customize Home (3.0, Chris 2026-11-10): riders show, hide and reorder the sections under the
 * four fixed cards at the top of Home (Map Mode, Join a Ride, Start a Ride, Events). Badges sit
 * at the very top, over the map above the greeting, and Your Toolkit at the very bottom (Chris
 * 2026-11-10), so neither is a section here; a saved layout that still lists them drops them. The choice
 * follows the account (core/synced-settings `home.layout.v1`). Pure, so it is tested without a phone.
 */

export type HomeSection = 'out' | 'next' | 'group' | 'feed' | 'public' | 'past';

/** Every section, in the default order, with its title and whether it shows by default. */
export const HOME_SECTIONS: { id: HomeSection; title: string; on: boolean }[] = [
  { id: 'out', title: 'Out Riding Now', on: true },
  { id: 'next', title: 'Up Next', on: true },
  { id: 'group', title: 'Your Group', on: true },
  { id: 'feed', title: 'Feed', on: true },
  { id: 'public', title: 'Public Rides Near You', on: false },
  { id: 'past', title: 'Past Rides', on: false },
];

export const HOME_LAYOUT_KEY = 'home.layout.v1';

/** The rider's sections in their order; `hidden` are the ones switched off. */
export type HomeLayout = { order: HomeSection[]; hidden: HomeSection[] };

const IDS = HOME_SECTIONS.map((s) => s.id);
const isSection = (v: unknown): v is HomeSection => typeof v === 'string' && (IDS as string[]).includes(v);

export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  order: [...IDS],
  hidden: HOME_SECTIONS.filter((s) => !s.on).map((s) => s.id),
};

/**
 * Read a saved layout. Junk gives the default; unknown sections are dropped; a section added in a
 * later version (missing from the saved order) goes in at its default place with its default switch.
 */
export function parseHomeLayout(raw: unknown): HomeLayout {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return DEFAULT_HOME_LAYOUT;
    }
  }
  if (!v || typeof v !== 'object') return DEFAULT_HOME_LAYOUT;
  const o = v as { order?: unknown; hidden?: unknown };
  if (!Array.isArray(o.order)) return DEFAULT_HOME_LAYOUT;
  const order: HomeSection[] = [];
  for (const id of o.order) if (isSection(id) && !order.includes(id)) order.push(id);
  const saved = new Set(order);
  const hidden = new Set(Array.isArray(o.hidden) ? o.hidden.filter(isSection) : []);
  IDS.forEach((id, i) => {
    if (saved.has(id)) return;
    // Put it after the section that comes before it by default (or first).
    const before = IDS.slice(0, i).reverse().find((b) => order.includes(b));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
    if (!HOME_SECTIONS[i].on) hidden.add(id);
  });
  return { order, hidden: order.filter((id) => hidden.has(id)) };
}

export const serializeHomeLayout = (l: HomeLayout) => JSON.stringify({ order: l.order, hidden: l.hidden });

/** The sections that show, in order. */
export const shownSections = (l: HomeLayout) => l.order.filter((id) => !l.hidden.includes(id));

export function toggleSection(l: HomeLayout, id: HomeSection, on: boolean): HomeLayout {
  const hidden = on ? l.hidden.filter((h) => h !== id) : l.hidden.includes(id) ? l.hidden : [...l.hidden, id];
  return { order: l.order, hidden: l.order.filter((x) => hidden.includes(x)) };
}

/** Move a section up (-1) or down (+1) one place; at either end it stays put. */
export function moveSection(l: HomeLayout, id: HomeSection, by: -1 | 1): HomeLayout {
  const i = l.order.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= l.order.length) return l;
  const order = [...l.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { order, hidden: order.filter((x) => l.hidden.includes(x)) };
}

/** Move a section to a new index (drag and drop). */
export function placeSection(l: HomeLayout, id: HomeSection, to: number): HomeLayout {
  const order = l.order.filter((x) => x !== id);
  order.splice(Math.max(0, Math.min(to, order.length)), 0, id);
  return { order, hidden: order.filter((x) => l.hidden.includes(x)) };
}

export const isDefaultLayout = (l: HomeLayout) => serializeHomeLayout(l) === serializeHomeLayout(DEFAULT_HOME_LAYOUT);
