/** Garage: build areas, cost totals, money parsing and build-sheet exports. Pure, no I/O. */

import { fuelRange, type FuelRange } from './fuel';

export type VehicleKind = 'vehicle' | 'sxs_utv';

export const VEHICLE_KINDS: { value: VehicleKind; label: string }[] = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'sxs_utv', label: 'SXS/UTV' },
];

export const kindLabel = (k: VehicleKind) => (k === 'sxs_utv' ? 'SXS/UTV' : 'Vehicle');

/** The major areas of a build, in display order. Ids match the database check constraint. */
export const AREAS = [
  { id: 'wheels_tires', label: 'Wheels & Tires' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'protection', label: 'Protection' },
  { id: 'roof_cab', label: 'Roof & Cab' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'audio_comms', label: 'Audio & Comms' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'storage_mounts', label: 'Storage & Mounts' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'performance', label: 'Performance' },
  { id: 'other', label: 'Other' },
] as const;

export type AreaId = (typeof AREAS)[number]['id'];

const AREA_ORDER = new Map<string, number>(AREAS.map((a, i) => [a.id, i]));

export const isAreaId = (s: string): s is AreaId => AREA_ORDER.has(s);
export const areaLabel = (id: string) => AREAS.find((a) => a.id === id)?.label ?? 'Other';

export type GarageVehicle = {
  kind: VehicleKind;
  nickname: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  purchase_price_cents: number | null;
  engine_hours: number | null;
  odometer_miles: number | null;
  tank_gallons: number | null;
  extra_fuel_gallons: number | null;
  mpg: number | null;
};

export type GarageItem = {
  area: string;
  name: string;
  brand: string | null;
  cost_cents: number | null;
  installed_on: string | null;
  notes: string | null;
};

// --- Money ----------------------------------------------------------------

export type MoneyParse = { ok: true; cents: number | null } | { ok: false; error: string };

/** Parse what a person types for a price ("$1,299.99", "450", "") into whole cents. Empty means no price. */
export function parseDollars(input: string): MoneyParse {
  if (!input.trim()) return { ok: true, cents: null };
  const s = input.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  const m = s.match(/^(\d+)(?:\.(\d{0,2}))?$|^\.(\d{1,2})$/);
  if (!m) return { ok: false, error: 'Enter an amount like 1299.99' };
  const whole = m[1] ?? '0';
  const frac = (m[2] ?? m[3] ?? '').padEnd(2, '0');
  const cents = Number(whole) * 100 + Number(frac);
  if (!Number.isSafeInteger(cents)) return { ok: false, error: 'That amount is too large' };
  return { ok: true, cents };
}

/** Cents to "$1,234.56". */
export function formatDollars(cents: number | null | undefined, opts: { blank?: string } = {}): string {
  if (cents == null) return opts.blank ?? '$0.00';
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${neg ? '-' : ''}$${whole}.${frac}`;
}

/** Cents back to an editable string ("1234.5" -> "1234.50"; null -> ""). */
export const centsToInput = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2));

/** Cents as a plain decimal for spreadsheets ("1234.50"). */
const centsPlain = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2));

/** Parse an optional non-negative decimal (gallons, mpg, hours). */
export function parseAmount(input: string): { ok: true; value: number | null } | { ok: false } {
  const s = input.trim().replace(/,/g, '');
  if (!s) return { ok: true, value: null };
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return { ok: false };
  return { ok: true, value: Number(s) };
}

// --- Totals ---------------------------------------------------------------

export type AreaGroup<T extends GarageItem> = { area: AreaId; label: string; items: T[]; subtotalCents: number };

export type BuildTotals<T extends GarageItem> = {
  groups: AreaGroup<T>[];
  totalCents: number;
  itemCount: number;
};

/** Group items by area (canonical order, only areas with items) with per-area subtotals and a grand total. */
export function buildTotals<T extends GarageItem>(items: T[]): BuildTotals<T> {
  const groups = new Map<AreaId, AreaGroup<T>>();
  let totalCents = 0;
  for (const item of items) {
    const area: AreaId = isAreaId(item.area) ? item.area : 'other';
    let g = groups.get(area);
    if (!g) {
      g = { area, label: areaLabel(area), items: [], subtotalCents: 0 };
      groups.set(area, g);
    }
    g.items.push(item);
    const c = item.cost_cents ?? 0;
    g.subtotalCents += c;
    totalCents += c;
  }
  const sorted = [...groups.values()].sort((a, b) => AREA_ORDER.get(a.area)! - AREA_ORDER.get(b.area)!);
  return { groups: sorted, totalCents, itemCount: items.length };
}

// --- Naming and fuel --------------------------------------------------------

export function vehicleTitle(v: Pick<GarageVehicle, 'nickname' | 'year' | 'make' | 'model' | 'trim'>): string {
  const ymm = [v.year, v.make, v.model, v.trim].filter((x) => x != null && String(x).trim() !== '').join(' ');
  if (v.nickname?.trim()) return ymm ? `${v.nickname.trim()} (${ymm})` : v.nickname.trim();
  return ymm || 'My machine';
}

/** Fuel range for a vehicle, or null until tank size and mpg are both known. */
export function vehicleRange(v: Pick<GarageVehicle, 'tank_gallons' | 'extra_fuel_gallons' | 'mpg'>): FuelRange | null {
  if (!v.tank_gallons || !v.mpg) return null;
  return fuelRange({ tankGallons: v.tank_gallons, extraGallons: v.extra_fuel_gallons ?? 0, mpg: v.mpg });
}

const num = (n: number, digits = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(digits));

export function exportFileBase(v: Pick<GarageVehicle, 'nickname' | 'year' | 'make' | 'model' | 'trim'>): string {
  const slug = vehicleTitle(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'machine'}-build`;
}

// --- CSV ------------------------------------------------------------------

/**
 * One CSV cell. Quotes when needed (comma, quote, newline, edge spaces) and doubles quotes.
 * Text that a spreadsheet would run as a formula (= + - @ tab) gets a leading apostrophe.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || s !== s.trim()) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const csvRow = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(',');

function sortedItems<T extends GarageItem>(items: T[]): T[] {
  return buildTotals(items).groups.flatMap((g) => g.items);
}

/** Every item on the machine as CSV (one row per item, then a total row). Uses CRLF line endings. */
export function buildCsv(v: GarageVehicle, items: GarageItem[]): string {
  const rows = [csvRow(['Vehicle', 'Area', 'Item', 'Brand', 'Cost (USD)', 'Installed', 'Notes'])];
  const title = vehicleTitle(v);
  for (const i of sortedItems(items)) {
    rows.push(csvRow([title, areaLabel(i.area), i.name, i.brand, centsPlain(i.cost_cents), i.installed_on, i.notes]));
  }
  rows.push(csvRow([title, 'Total', '', '', centsPlain(buildTotals(items).totalCents), '', '']));
  return rows.join('\r\n') + '\r\n';
}

// --- Plain-text build sheet -------------------------------------------------

export function buildSheetText(v: GarageVehicle, items: GarageItem[]): string {
  const lines: string[] = [];
  const title = vehicleTitle(v);
  lines.push(title, '='.repeat(Math.min(title.length, 60)));
  const facts = [kindLabel(v.kind)];
  if (v.vin) facts.push(`VIN ${v.vin}`);
  if (v.odometer_miles != null) facts.push(`${num(v.odometer_miles)} mi`);
  if (v.engine_hours != null) facts.push(`${num(v.engine_hours)} hrs`);
  lines.push(facts.join(' | '));

  const range = vehicleRange(v);
  if (range) {
    lines.push(
      `Fuel: ${num(v.tank_gallons!)} gal tank + ${num(v.extra_fuel_gallons ?? 0)} gal extra at ${num(v.mpg!)} mpg`,
      `Range: ${Math.round(range.fullRangeMiles)} mi full, ${Math.round(range.safeTurnaroundMiles)} mi safe turnaround, ${Math.round(range.safeTripMiles)} mi safe trip`,
    );
  }
  lines.push('');

  const totals = buildTotals(items);
  if (!totals.itemCount) lines.push('No parts or extras listed yet.', '');
  for (const g of totals.groups) {
    lines.push(`${g.label.toUpperCase()} - ${formatDollars(g.subtotalCents)}`);
    for (const i of g.items) {
      const bits = [i.brand ? `${i.name} (${i.brand})` : i.name];
      if (i.cost_cents != null) bits.push(formatDollars(i.cost_cents));
      if (i.installed_on) bits.push(`installed ${i.installed_on}`);
      lines.push(`  - ${bits.join(', ')}`);
      if (i.notes?.trim()) lines.push(...i.notes.trim().split(/\r?\n/).map((n) => `      ${n}`));
    }
    lines.push('');
  }

  lines.push(`Build total: ${formatDollars(totals.totalCents)} across ${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'}`);
  if (v.purchase_price_cents != null) {
    lines.push(`Purchase price: ${formatDollars(v.purchase_price_cents)}`);
    lines.push(`All in: ${formatDollars(v.purchase_price_cents + totals.totalCents)}`);
  }
  return lines.join('\n') + '\n';
}

// --- VIN ------------------------------------------------------------------

/** 17 characters, no I, O or Q. Check digit is not enforced (it is optional outside North America). */
export const isPlausibleVin = (vin: string) => /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim());

/** Pull year/make/model/trim out of an NHTSA vPIC DecodeVinValues response. */
export function parseVpic(json: unknown): { year: number | null; make: string | null; model: string | null; trim: string | null } | null {
  const r = (json as { Results?: Record<string, unknown>[] } | null)?.Results?.[0];
  if (!r) return null;
  const str = (k: string) => {
    const x = r[k];
    return typeof x === 'string' && x.trim() ? x.trim() : null;
  };
  const yearText = str('ModelYear');
  const year = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const make = str('Make');
  // vPIC makes are upper case; keep short acronyms (BMW, KTM, RAM) and title-case the rest.
  const titleCase = make ? make.replace(/[A-Za-z]+/g, (w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())) : null;
  const out = { year, make: titleCase, model: str('Model'), trim: str('Trim') ?? str('Series') };
  return out.year || out.make || out.model ? out : null;
}
