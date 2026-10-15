// Reads the stores' own daily download reports into rows of store_downloads (migration
// 20261030000000_admin_growth.sql) for the Admin Dashboard's Growth page.
//
// Pure code with no imports, so the store-downloads edge function (Deno) and the app's vitest
// suite (app/src/core/__tests__/store-reports.test.ts) run the same file.
//
// App Store: Sales and Trends, daily SALES / SUMMARY report (version 1_1), a tab-separated file
// with one line per product type, country and device. Only lines for the app itself count (its
// Apple Identifier), so Pro subscription sales are left out.
// Google Play: the installs "overview" report in the Play Console's Cloud Storage bucket, a CSV in
// UTF-16 with one line per day.

export type DownloadRow = {
  store: 'apple' | 'google';
  day: string; // YYYY-MM-DD
  device: string;
  downloads: number;
  redownloads: number;
  updates: number;
  uninstalls: number | null;
};

// Apple's product type identifiers (App Store Connect Help, "Product type identifiers").
// First-time downloads: iPhone (1), universal (1F), iPad (1T), Mac (F1), custom B2B apps (1E...).
const FIRST = new Set(['1', '1F', '1T', 'F1', '1E', '1EP', '1EU', '1-B', 'F1-B']);
const REDOWNLOAD = new Set(['3', '3F', '3T', 'F3']);
const UPDATE = new Set(['7', '7F', '7T', 'F7']);

/** MM/DD/YYYY or YYYY-MM-DD as YYYY-MM-DD; null when it is neither. */
export function isoDay(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

/** Rows of the App Store daily sales summary for one app, summed by day and device. */
export function parseAppleSales(tsv: string, appleId: string): DownloadRow[] {
  const lines = tsv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split('\t').map(key);
  const col = (name: string) => head.indexOf(name);
  const cType = col('product type identifier'), cUnits = col('units'), cId = col('apple identifier');
  const cDay = col('begin date'), cDevice = col('device');
  if (cType < 0 || cUnits < 0 || cId < 0 || cDay < 0) throw new Error('App Store report is missing columns');
  const by = new Map<string, DownloadRow>();
  for (const line of lines.slice(1)) {
    const f = line.split('\t');
    if ((f[cId] ?? '').trim() !== appleId) continue;
    const type = (f[cType] ?? '').trim();
    const kind = FIRST.has(type) ? 'downloads' : REDOWNLOAD.has(type) ? 'redownloads' : UPDATE.has(type) ? 'updates' : null;
    const day = isoDay(f[cDay] ?? '');
    if (!kind || !day) continue;
    const device = (cDevice >= 0 ? f[cDevice]?.trim() : '') || 'Unknown';
    const k = `${day}|${device}`;
    const row = by.get(k) ?? { store: 'apple' as const, day, device, downloads: 0, redownloads: 0, updates: 0, uninstalls: null };
    row[kind] += num(f[cUnits]);
    by.set(k, row);
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day) || a.device.localeCompare(b.device));
}

/** Google's report files are UTF-16 (with a byte order mark); older ones UTF-8. */
export function decodeReport(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

/** Splits one CSV line, with "quoted, fields" and "" for a quote. */
export function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Rows of a Google Play installs overview report (one month, one line per day). */
export function parsePlayInstalls(csv: string, packageName: string): DownloadRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = csvFields(lines[0]).map(key);
  const col = (...names: string[]) => names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  const cDay = col('date'), cPkg = col('package name');
  const cInstalls = col('daily user installs', 'daily device installs', 'install events');
  const cUpdates = col('daily device upgrades', 'update events');
  const cUninstalls = col('daily user uninstalls', 'daily device uninstalls', 'uninstall events');
  if (cDay < 0 || cInstalls < 0) throw new Error('Google Play report is missing columns');
  const rows: DownloadRow[] = [];
  for (const line of lines.slice(1)) {
    const f = csvFields(line);
    if (cPkg >= 0 && f[cPkg]?.trim() && f[cPkg].trim() !== packageName) continue;
    const day = isoDay(f[cDay] ?? '');
    if (!day) continue;
    rows.push({
      store: 'google', day, device: 'Android',
      downloads: num(f[cInstalls]), redownloads: 0,
      updates: cUpdates >= 0 ? num(f[cUpdates]) : 0,
      uninstalls: cUninstalls >= 0 ? num(f[cUninstalls]) : null,
    });
  }
  return rows;
}

/** The Cloud Storage object name of one month's installs overview, e.g. 202610. */
export const playInstallsObject = (packageName: string, yyyymm: string) =>
  `stats/installs/installs_${packageName}_${yyyymm}_overview.csv`;

/** YYYY-MM-DD days from `from` to `to` inclusive (UTC). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * The App Store days still to read: from the later of `start` and `maxBack` days ago up to
 * yesterday, less the days already read. The newest first when there are more than `maxCalls`.
 */
export function appleDaysToFetch(today: string, start: string, done: Set<string>, maxBack = 35, maxCalls = 40): string[] {
  const t = Date.parse(`${today}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const earliest = [start, iso(t - maxBack * 86_400_000)].sort()[1];
  const last = iso(t - 86_400_000);
  if (earliest > last) return [];
  return daysBetween(earliest, last).filter((d) => !done.has(d)).reverse().slice(0, maxCalls);
}
