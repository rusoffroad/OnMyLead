/**
 * RUS Offroad gear suggestions: read the WooCommerce Store API product list, work out which
 * products fit a rider's machine and checklist, and build attributed "Buy" links. Pure, no I/O.
 *
 * Fitment comes from the store's own categories: RUS files products under vehicle categories
 * like "RZR Pro R", "Can-Am Defender HD11" or "Polaris RZR XP4 (2014-2023)", plus "Universal".
 */
import type { TripCategory } from './trips';

export const RUS_ORIGIN = 'https://rusoffroad.com';

export type RusCategory = { slug: string; name: string };

export type RusProduct = {
  id: number;
  name: string;
  permalink: string;
  priceCents: number | null;
  image: string | null;
  categories: RusCategory[];
  tags: string[];
  type: string;
  purchasable: boolean;
  inStock: boolean;
  hasOptions: boolean;
  summary: string;
};

// --- Parsing --------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', trade: '™', reg: '®', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const plain = (html: unknown) =>
  typeof html === 'string' ? decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : '';

/** Only ever link to the RUS store itself over https. */
export function isRusUrl(u: unknown): u is string {
  return typeof u === 'string' && /^https:\/\/(www\.)?rusoffroad\.com(\/|$)/i.test(u);
}

/** Store API price strings are in minor units ("1500" with currency_minor_unit 2 = $15.00). */
function priceCents(prices: unknown): number | null {
  const p = prices as { price?: unknown; currency_minor_unit?: unknown } | null;
  if (!p || typeof p.price !== 'string' || !/^\d+$/.test(p.price)) return null;
  const minor = typeof p.currency_minor_unit === 'number' ? p.currency_minor_unit : 2;
  return Math.round(Number(p.price) * 10 ** (2 - minor));
}

/** Normalize a /wp-json/wc/store/v1/products response. Drops anything malformed or off-site. */
export function parseStoreProducts(json: unknown): RusProduct[] {
  if (!Array.isArray(json)) return [];
  const out: RusProduct[] = [];
  for (const raw of json as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const id = raw.id;
    const name = typeof raw.name === 'string' ? decodeEntities(raw.name).trim() : '';
    if (typeof id !== 'number' || !name || !isRusUrl(raw.permalink)) continue;
    const images = Array.isArray(raw.images) ? (raw.images as { src?: unknown; thumbnail?: unknown }[]) : [];
    const img = images[0]?.thumbnail ?? images[0]?.src;
    const cats = Array.isArray(raw.categories) ? (raw.categories as { slug?: unknown; name?: unknown }[]) : [];
    const tags = Array.isArray(raw.tags) ? (raw.tags as { name?: unknown }[]) : [];
    out.push({
      id,
      name,
      permalink: raw.permalink,
      priceCents: priceCents(raw.prices),
      image: typeof img === 'string' && /^https:\/\//i.test(img) ? img : null,
      categories: cats
        .filter((c) => typeof c?.slug === 'string')
        .map((c) => ({ slug: String(c.slug), name: decodeEntities(typeof c.name === 'string' ? c.name : String(c.slug)) })),
      tags: tags.map((x) => (typeof x?.name === 'string' ? decodeEntities(x.name) : '')).filter(Boolean),
      type: typeof raw.type === 'string' ? raw.type : 'simple',
      purchasable: raw.is_purchasable !== false,
      inStock: raw.is_in_stock !== false,
      hasOptions: raw.has_options === true || raw.type === 'variable',
      summary: plain(raw.short_description).slice(0, 200),
    });
  }
  return out;
}

// --- Vehicle fitment ----------------------------------------------------------------

/** Model names that imply a make, so a Ford Ranger never matches a Polaris Ranger category. */
const MODEL_MAKES: Record<string, string> = {
  rzr: 'polaris', ranger: 'polaris', xpedition: 'polaris', sportsman: 'polaris',
  defender: 'canam', maverick: 'canam', x3: 'canam', commander: 'canam',
  talon: 'honda', pioneer: 'honda',
  teryx: 'kawasaki', teryx4: 'kawasaki', krx: 'kawasaki', mule: 'kawasaki',
  wolverine: 'yamaha', rmax: 'yamaha', yxz: 'yamaha', viking: 'yamaha',
};
const MAKES = new Set(['polaris', 'canam', 'honda', 'kawasaki', 'yamaha', 'arcticcat', 'cfmoto', 'textron', 'segway', 'hisun', 'kubota', 'john', 'deere']);
const FILLER = new Set(['all', 'models', 'model', 'series', 'and', 'the', 'up', 'present', 'current']);

/** Lowercase words, with "Can-Am" as one word. */
const words = (s: string) =>
  s.toLowerCase().replace(/can[\s-]?am/g, 'canam').replace(/arctic\s+cat/g, 'arcticcat').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/** Split letter/number runs so "XP4" and "XP 4", "HD11" and "HD 11" compare equal. */
const parts = (ws: string[]) => ws.flatMap((w) => w.match(/[a-z]+|\d+/g) ?? []);

export type VehicleSpec = { make: string | null; tokens: string[]; years: [number, number] | null };

/** A category that names a machine, or null for "Universal", "Bed Storage" and the like. */
export function categoryVehicle(c: RusCategory): VehicleSpec | null {
  const ws = words(c.name);
  const explicitMake = ws.find((w) => MAKES.has(w)) ?? null;
  const modelKey = ws.find((w) => MODEL_MAKES[w]);
  if (!explicitMake && !modelKey) return null;
  const range = c.name.match(/\b((?:19|20)\d{2})\s*[-–]\s*((?:19|20)\d{2})\b/);
  const years: [number, number] | null = range ? [Number(range[1]), Number(range[2])] : null;
  const tokens = parts(ws.filter((w) => !MAKES.has(w) && !FILLER.has(w) && !/^(19|20)\d{2}$/.test(w)));
  return { make: explicitMake ?? MODEL_MAKES[modelKey!], tokens, years };
}

export type RiderVehicle = { make: string | null; model: string | null; trim?: string | null; year?: number | null };

export function vehicleMatches(spec: VehicleSpec, v: RiderVehicle): boolean {
  const make = v.make ? words(v.make).join('') : null;
  if (spec.make && make && make !== spec.make) return false;
  const have = new Set(parts(words(`${v.make ?? ''} ${v.model ?? ''} ${v.trim ?? ''}`)));
  if (!spec.tokens.length) return !!make && make === spec.make; // "Can-Am (All Models)"
  if (!spec.tokens.every((t) => have.has(t))) return false;
  if (spec.years && v.year && (v.year < spec.years[0] || v.year > spec.years[1])) return false;
  return true;
}

export type Fitment = { universal: boolean; specific: boolean; fits: boolean };

export function fitment(p: RusProduct, v: RiderVehicle | null): Fitment {
  const specs = p.categories.map(categoryVehicle).filter((s): s is VehicleSpec => !!s);
  const universal = p.categories.some((c) => c.slug === 'universal') || specs.length === 0;
  const specific = !!v && specs.some((s) => vehicleMatches(s, v));
  return { universal, specific, fits: universal || specific };
}

// --- Checklist relevance ----------------------------------------------------------------

export const CATEGORY_KEYWORDS: Record<TripCategory, string[]> = {
  recovery: ['recovery', 'strap', 'shackle', 'winch', 'traction', 'tow', 'rope', 'tie down', 'anchor'],
  tools_spares: ['tool', 'packout', 'spare', 'belt'],
  first_aid: ['first aid', 'medical', 'extinguisher'],
  navigation_comms: ['radio', 'gps', 'phone', 'tablet', 'antenna', 'whip', 'flag'],
  power_starlink: ['starlink', 'battery', 'power', 'solar', 'charger', 'usb'],
  camping: ['cooler', 'tent', 'awning', 'camp', 'chair', 'table'],
  food_water: ['cooler', 'water', 'drink'],
  clothing: ['apparel', 'shirt', 'hat', 'hoodie', 'tee', 'jacket', 'glove'],
  fuel_fluids: ['fuel', 'gas can', 'jerry', 'rotopax'],
  documents: [],
  other: ['storage', 'mount'],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** How many of the given checklist categories this product is relevant to. */
export function categoryHits(p: RusProduct, cats: TripCategory[]): number {
  const hay = [p.name, ...p.categories.map((c) => c.name), ...p.tags].join(' | ').toLowerCase();
  let hits = 0;
  for (const c of new Set(cats)) {
    if (CATEGORY_KEYWORDS[c]?.some((k) => new RegExp(`\\b${escapeRe(k)}`, 'i').test(hay))) hits++;
  }
  return hits;
}

export type GearSuggestion = { product: RusProduct; reason: string; score: number };

/**
 * Rank products for a rider. With a vehicle: only gear that fits it (vehicle-specific first).
 * Without one: only gear that fits anything. With checklist categories: only gear relevant
 * to at least one of them.
 */
export function matchProducts(
  products: RusProduct[],
  opts: { vehicle?: RiderVehicle | null; categories?: TripCategory[]; limit?: number } = {},
): GearSuggestion[] {
  const v = opts.vehicle && (opts.vehicle.make || opts.vehicle.model) ? opts.vehicle : null;
  const cats = opts.categories ?? [];
  const out: GearSuggestion[] = [];
  for (const p of products) {
    if (!p.inStock || !p.purchasable) continue;
    const fit = fitment(p, v);
    if (!fit.fits) continue;
    const hits = cats.length ? categoryHits(p, cats) : 0;
    if (cats.length && !hits) continue;
    const label = v ? [v.make, v.model].filter(Boolean).join(' ') : '';
    out.push({
      product: p,
      score: (fit.specific ? 3 : 0) + hits * 2,
      reason: fit.specific ? `Fits your ${label}` : 'Fits most machines',
    });
  }
  return out.sort((a, b) => b.score - a.score || a.product.id - b.product.id).slice(0, opts.limit ?? 4);
}

// --- Links ---------------------------------------------------------------------------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'app';

/** Add query params to a URL, keeping any #fragment at the end. */
export function withParams(url: string, params: Record<string, string>): string {
  const [base, hash] = url.split('#', 2);
  const q = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${q}${hash != null ? `#${hash}` : ''}`;
}

export const utm = (campaign: string) => ({ utm_source: 'onmylead', utm_medium: 'app', utm_campaign: slug(campaign) });

/**
 * The product page with attribution. Simple in-stock products also go straight into the
 * cart (WooCommerce's ?add-to-cart=ID on the product page); products with options do not,
 * so the rider can pick a size or fitment first.
 */
export function buyUrl(p: RusProduct, campaign: string): string {
  const direct = !p.hasOptions && p.purchasable && p.inStock && p.type === 'simple';
  return withParams(p.permalink, { ...(direct ? { 'add-to-cart': String(p.id) } : {}), ...utm(campaign) });
}

export const storeUrl = (campaign: string) => withParams(`${RUS_ORIGIN}/`, utm(campaign));

export function formatPrice(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
