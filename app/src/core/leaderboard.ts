/**
 * The badge leaderboard, as every device shows it. The server ranks riders
 * (badge_leaderboard in migration 20261104050000_badge_leaderboard.sql): badge levels earned by
 * riding, then Gold, then Silver, then whoever got there first. This file reads its answers and
 * names things; the order always comes from the server.
 */
import { areaLabel, countryName, stateName } from './areas';
import { parseBadgeRows, RANKS, topBadge, type BadgeKey, type BadgeLevel } from './badges';

export type LeaderRow = {
  place: number;
  userId: string;
  name: string;
  levels: number;
  gold: number;
  silver: number;
  bronze: number;
  country: string | null;
  state: string | null;
  me: boolean;
  /** The badge beside their name (an honor first, else their best level). */
  top: { badge: BadgeKey; level: BadgeLevel } | null;
};

export type Leaderboard = { total: number; rows: LeaderRow[]; me: LeaderRow | null };

export type LeaderArea = { country: string; riders: number; states: { state: string; riders: number }[] };

export type LeaderSettings = { country: string | null; state: string | null; shown: boolean; chosen: boolean };

/** Which board: everywhere, a country, or a state in it. */
export type LeaderFilter = { country: string | null; state: string | null };

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const code = (v: unknown) => (typeof v === 'string' && /^[A-Z0-9]{1,3}$/.test(v) ? v : null);

function parseRow(raw: unknown): LeaderRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.user_id !== 'string') return null;
  const place = num(r.place);
  if (place < 1) return null;
  return {
    place,
    userId: r.user_id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Rider',
    levels: num(r.levels),
    gold: num(r.gold),
    silver: num(r.silver),
    bronze: num(r.bronze),
    country: code(r.country),
    state: code(r.state),
    me: r.me === true,
    top: topBadge(parseBadgeRows(r.badges)),
  };
}

/** Reads badge_leaderboard(). Bad rows are dropped; the server's order is kept. */
export function parseLeaderboard(raw: unknown): Leaderboard {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rows = (Array.isArray(r.rows) ? r.rows : []).map(parseRow).filter((x): x is LeaderRow => !!x);
  return { total: num(r.total), rows, me: parseRow(r.me) };
}

/** Reads badge_leaderboard_areas(), most riders first. */
export function parseAreas(raw: unknown): LeaderArea[] {
  if (!Array.isArray(raw)) return [];
  const out: LeaderArea[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const x = a as Record<string, unknown>;
    const country = code(x.country);
    if (!country || country.length !== 2) continue;
    const states = (Array.isArray(x.states) ? x.states : [])
      .map((s) => (s && typeof s === 'object' ? { state: code((s as Record<string, unknown>).state), riders: num((s as Record<string, unknown>).riders) } : null))
      .filter((s): s is { state: string; riders: number } => !!s?.state);
    out.push({ country, riders: num(x.riders), states });
  }
  return out.sort((a, b) => b.riders - a.riders || (countryName(a.country) ?? '').localeCompare(countryName(b.country) ?? ''));
}

/** Reads my_leaderboard_settings(). */
export function parseSettings(raw: unknown): LeaderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const country = code(r.country);
  return { country: country?.length === 2 ? country : null, state: country ? code(r.state) : null, shown: r.shown !== false, chosen: r.chosen === true };
}

/** The rank name for a number of levels (same ladder as the Badges screen). */
export function rankName(levels: number): string {
  let name: string = RANKS[0].name;
  for (const r of RANKS) if (levels >= r.min) name = r.name;
  return name;
}

/** "Everywhere", "United States", "Texas". */
export function filterTitle(f: LeaderFilter): string {
  if (!f.country) return 'Everywhere';
  return (f.state ? stateName(f.country, f.state) : countryName(f.country)) ?? 'Everywhere';
}

/** The filter a rider starts on: their own state if they picked one, else their country, else everywhere. */
export function startingFilter(s: LeaderSettings | null): LeaderFilter {
  if (!s?.country) return { country: null, state: null };
  return { country: s.country, state: s.state };
}

/** "12 levels: 2 Gold, 3 Silver, 2 Bronze" for screen readers and the row's second line. */
export function levelsLine(r: Pick<LeaderRow, 'levels' | 'gold' | 'silver' | 'bronze'>): string {
  const parts = [r.gold && `${r.gold} Gold`, r.silver && `${r.silver} Silver`, r.bronze && `${r.bronze} Bronze`].filter(Boolean);
  const lv = r.levels === 1 ? '1 level' : `${r.levels} levels`;
  return parts.length ? `${lv}: ${parts.join(', ')}` : lv;
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** What the rider's own card says about where they stand on this board. */
export function myStanding(board: Leaderboard | null, settings: LeaderSettings | null, filter: LeaderFilter): string {
  if (settings && !settings.shown) return 'You’re hidden from the leaderboard. Turn on Show Me to be listed.';
  if (board?.me) return `You’re ${ordinal(board.me.place)} of ${board.total} in ${filterTitle(filter)}.`;
  if (filter.country && settings && (settings.country !== filter.country || (filter.state && settings.state !== filter.state))) {
    const where = areaLabel(settings.country, settings.state);
    return where ? `You ride from ${where}, so you’re not on this board.` : 'Pick where you ride from to be on country and state boards.';
  }
  return 'Earn your first badge level to get on the board.';
}
