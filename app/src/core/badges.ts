/**
 * Rider badges and ranks, as riders see them on every device. The server earns them
 * (award_rider_badges in migration 20261101500000_rider_badges.sql); this file names them, mirrors
 * the thresholds in badge_levels() for the progress bars, and works out the rank. The unit test
 * checks the thresholds against that migration so the two can't drift.
 */

export type BadgeKey = 'trail_boss' | 'tail_gunner' | 'crew_rider' | 'mile_eater' | 'trailblazer' | 'mapmaker' | 'trail_scout';
export type BadgeLevel = 1 | 2 | 3;

export type BadgeDef = {
  key: BadgeKey;
  name: string;
  /** What earns it, in a few words. */
  what: string;
  /** The unit being counted, singular and plural. */
  unit: [string, string];
  thresholds: [number, number, number];
  /** Needs the offroad navigation trails. */
  trails?: boolean;
};

export const BADGES: BadgeDef[] = [
  { key: 'trail_boss', name: 'Trail Boss', what: 'Lead group rides', unit: ['ride led', 'rides led'], thresholds: [1, 10, 25] },
  { key: 'tail_gunner', name: 'Tail Gunner', what: 'Ride at the rear so nobody gets left behind', unit: ['ride at the rear', 'rides at the rear'], thresholds: [1, 10, 25] },
  { key: 'crew_rider', name: 'Crew Rider', what: 'Ride with a group', unit: ['group ride', 'group rides'], thresholds: [1, 10, 50] },
  { key: 'mile_eater', name: 'Mile Eater', what: 'Rack up miles on your rides', unit: ['mile', 'miles'], thresholds: [100, 1000, 5000] },
  { key: 'trailblazer', name: 'Trailblazer', what: 'Share trails you mapped with every rider', unit: ['public trail', 'public trails'], thresholds: [1, 5, 20], trails: true },
  { key: 'mapmaker', name: 'Mapmaker', what: 'Get your trails rated accurate by other riders', unit: ['accurate trail', 'accurate trails'], thresholds: [1, 5, 20], trails: true },
  { key: 'trail_scout', name: 'Trail Scout', what: 'Rate trails so riders know what to expect', unit: ['trail rated', 'trails rated'], thresholds: [5, 25, 100], trails: true },
];

export const BADGE_BY_KEY = Object.fromEntries(BADGES.map((b) => [b.key, b])) as Record<BadgeKey, BadgeDef>;

export const LEVEL_NAME: Record<BadgeLevel, string> = { 1: 'Bronze', 2: 'Silver', 3: 'Gold' };

export const isBadgeKey = (v: unknown): v is BadgeKey => typeof v === 'string' && v in BADGE_BY_KEY;

export type EarnedBadge = { badge: BadgeKey; level: BadgeLevel; earnedAt: string | null; seen: boolean };

export type MyBadges = { stats: Partial<Record<BadgeKey, number>>; badges: EarnedBadge[] };

/** Reads my_badges(); unknown badges (from a newer server) and bad rows are dropped. */
export function parseMyBadges(raw: unknown): MyBadges {
  const out: MyBadges = { stats: {}, badges: [] };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { stats?: unknown; badges?: unknown };
  if (r.stats && typeof r.stats === 'object') {
    for (const [k, v] of Object.entries(r.stats as Record<string, unknown>)) {
      const n = typeof v === 'number' ? v : Number(v);
      if (isBadgeKey(k) && Number.isFinite(n)) out.stats[k] = n;
    }
  }
  if (Array.isArray(r.badges)) out.badges = parseBadgeRows(r.badges);
  return out;
}

/** Rows like { badge, level, earned_at, seen } (my_badges) or { user_id, badge, level } (rider_badges). */
export function parseBadgeRows(rows: unknown): EarnedBadge[] {
  if (!Array.isArray(rows)) return [];
  const out: EarnedBadge[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const { badge, level, earned_at, seen } = row as Record<string, unknown>;
    const lv = Number(level);
    if (!isBadgeKey(badge) || !(lv === 1 || lv === 2 || lv === 3)) continue;
    out.push({ badge, level: lv, earnedAt: typeof earned_at === 'string' ? earned_at : null, seen: seen !== false });
  }
  return out;
}

/** The highest level earned per badge. */
export function bestLevels(earned: Pick<EarnedBadge, 'badge' | 'level'>[]): Partial<Record<BadgeKey, BadgeLevel>> {
  const best: Partial<Record<BadgeKey, BadgeLevel>> = {};
  for (const e of earned) if (!best[e.badge] || best[e.badge]! < e.level) best[e.badge] = e.level;
  return best;
}

/** Ranks by how many levels a rider has earned (21 in all). */
export const RANKS = [
  { name: 'Rookie', min: 0 },
  { name: 'Rider', min: 1 },
  { name: 'Veteran', min: 4 },
  { name: 'Expert', min: 9 },
  { name: 'Legend', min: 15 },
] as const;

export type Rank = { name: string; levels: number; next: { name: string; min: number } | null };

export function rankFor(earned: Pick<EarnedBadge, 'badge' | 'level'>[]): Rank {
  const levels = Object.values(bestLevels(earned)).reduce<number>((n, l) => n + (l ?? 0), 0);
  let i = 0;
  while (i + 1 < RANKS.length && levels >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1] ?? null;
  return { name: RANKS[i].name, levels, next: next ? { name: next.name, min: next.min } : null };
}

export type BadgeProgress = {
  def: BadgeDef;
  level: BadgeLevel | 0;
  value: number;
  /** The next level's threshold, or null at Gold. */
  goal: number | null;
  /** 0 to 1 toward the next level (1 at Gold). */
  fraction: number;
  /** "3 of 10 rides led", "Gold. 31 rides led". */
  line: string;
};

const plural = (def: BadgeDef, n: number) => (n === 1 ? def.unit[0] : def.unit[1]);
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

export function progressFor(def: BadgeDef, value: number, level: BadgeLevel | 0): BadgeProgress {
  // The level shown is what the server awarded; the bar works from the counted value.
  const goal: number | null = level === 3 ? null : def.thresholds[level];
  const prevGoal = level === 0 ? 0 : def.thresholds[level - 1];
  const fraction = goal == null ? 1 : Math.max(0, Math.min(1, (value - prevGoal) / (goal - prevGoal)));
  const line = goal == null
    ? `${fmt(value)} ${plural(def, value)}`
    : `${fmt(Math.min(value, goal))} of ${fmt(goal)} ${plural(def, goal)} for ${LEVEL_NAME[(level + 1) as BadgeLevel]}`;
  return { def, level, value, goal, fraction, line };
}

/** Every badge with its progress, in display order. */
export function allProgress(mine: MyBadges): BadgeProgress[] {
  const best = bestLevels(mine.badges);
  return BADGES.map((def) => progressFor(def, mine.stats[def.key] ?? 0, best[def.key] ?? 0));
}

/**
 * The one badge to show beside a rider's name: their highest level, and among equals the one
 * earliest in BADGES (leading before miles). Null when they have none.
 */
export function topBadge(earned: Pick<EarnedBadge, 'badge' | 'level'>[]): { badge: BadgeKey; level: BadgeLevel } | null {
  const best = bestLevels(earned);
  let top: { badge: BadgeKey; level: BadgeLevel } | null = null;
  for (const def of BADGES) {
    const l = best[def.key];
    if (l && (!top || l > top.level)) top = { badge: def.key, level: l };
  }
  return top;
}

export const badgeTitle = (b: { badge: BadgeKey; level: BadgeLevel }) => `${BADGE_BY_KEY[b.badge].name} ${LEVEL_NAME[b.level]}`;

/** New badges the rider hasn't seen, highest first. */
export function unseen(mine: MyBadges): EarnedBadge[] {
  return mine.badges.filter((b) => !b.seen).sort((a, b) => b.level - a.level);
}
