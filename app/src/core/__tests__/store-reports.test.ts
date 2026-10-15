import { describe, expect, it } from 'vitest';

import {
  appleDaysToFetch, csvFields, daysBetween, decodeReport, isoDay, parseAppleSales, parsePlayInstalls, playInstallsObject,
} from '../../../../supabase/functions/_shared/store-reports';

const APP = '6822352321';
const HEAD = ['Provider', 'Provider Country', 'SKU', 'Developer', 'Title', 'Version', 'Product Type Identifier', 'Units',
  'Developer Proceeds', 'Begin Date', 'End Date', 'Customer Currency', 'Country Code', 'Currency of Proceeds', 'Apple Identifier',
  'Customer Price', 'Promo Code', 'Parent Identifier', 'Subscription', 'Period', 'Category', 'CMB', 'Device', 'Supported Platforms',
  'Proceeds Reason', 'Preserved Pricing', 'Client', 'Order Type'].join('\t');
const line = (type: string, units: number, country: string, device: string, id = APP) =>
  ['APPLE', 'US', 'onmylead-ios', 'RUS Offroad LLC', 'OnMyLead', '1.0', type, String(units), '0', '10/14/2026', '10/14/2026',
    'USD', country, 'USD', id, '0', '', '', '', '', 'Navigation', '', device, 'iOS', '', '', '', ''].join('\t');

describe('parseAppleSales', () => {
  it('sums first downloads, re-downloads and updates by day and device, for the app only', () => {
    const tsv = [
      HEAD,
      line('1F', 3, 'US', 'iPhone'),
      line('1F', 2, 'CA', 'iPhone'),
      line('1T', 1, 'US', 'iPad'),
      line('3F', 1, 'US', 'iPhone'),
      line('7F', 4, 'US', 'iPhone'),
      line('IAY', 1, 'US', 'iPhone', '6999999999'), // a Pro subscription: not a download
      line('1F', -1, 'US', 'iPhone'), // a return
    ].join('\n');
    expect(parseAppleSales(tsv, APP)).toEqual([
      { store: 'apple', day: '2026-10-14', device: 'iPad', downloads: 1, redownloads: 0, updates: 0, uninstalls: null },
      { store: 'apple', day: '2026-10-14', device: 'iPhone', downloads: 4, redownloads: 1, updates: 4, uninstalls: null },
    ]);
  });
  it('is empty for an empty report and refuses a file without the columns', () => {
    expect(parseAppleSales(`${HEAD}\n`, APP)).toEqual([]);
    expect(() => parseAppleSales('a\tb\n1\t2', APP)).toThrow(/missing columns/);
  });
});

describe('parsePlayInstalls', () => {
  const csv = [
    'Date,Package Name,Daily Device Installs,Daily Device Uninstalls,Daily Device Upgrades,Total User Installs,Daily User Installs,Daily User Uninstalls,Active Device Installs,Install events,Update events,Uninstall events',
    '2026-10-14,com.rusoffroad.onmylead.app,6,1,2,10,5,1,9,6,2,1',
    '2026-10-15,com.rusoffroad.onmylead.app,0,0,0,10,0,0,9,0,0,0',
    '2026-10-15,com.other.app,9,9,9,9,9,9,9,9,9,9',
  ].join('\r\n');
  it('reads user installs, updates and uninstalls per day', () => {
    expect(parsePlayInstalls(csv, 'com.rusoffroad.onmylead.app')).toEqual([
      { store: 'google', day: '2026-10-14', device: 'Android', downloads: 5, redownloads: 0, updates: 2, uninstalls: 1 },
      { store: 'google', day: '2026-10-15', device: 'Android', downloads: 0, redownloads: 0, updates: 0, uninstalls: 0 },
    ]);
  });
  it('decodes the UTF-16 file Google writes', () => {
    const body = new Uint8Array([0xff, 0xfe, ...Array.from(csv).flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(parsePlayInstalls(decodeReport(body), 'com.rusoffroad.onmylead.app')).toHaveLength(2);
    expect(decodeReport(new TextEncoder().encode('Date\n'))).toBe('Date\n');
  });
  it('names the month file', () => {
    expect(playInstallsObject('com.rusoffroad.onmylead.app', '202610')).toBe('stats/installs/installs_com.rusoffroad.onmylead.app_202610_overview.csv');
  });
});

describe('helpers', () => {
  it('reads both date styles', () => {
    expect(isoDay('10/4/2026')).toBe('2026-10-04');
    expect(isoDay('2026-10-04')).toBe('2026-10-04');
    expect(isoDay('Total')).toBeNull();
  });
  it('splits quoted CSV fields', () => {
    expect(csvFields('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
  });
  it('lists days inclusive', () => {
    expect(daysBetween('2026-10-30', '2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
  it('picks App Store days not yet read, newest first, never today', () => {
    const done = new Set(['2026-10-14']);
    expect(appleDaysToFetch('2026-10-16', '2026-10-13', done)).toEqual(['2026-10-15', '2026-10-13']);
    expect(appleDaysToFetch('2026-10-13', '2026-10-13', done)).toEqual([]);
    expect(appleDaysToFetch('2026-12-31', '2026-10-01', new Set(), 35, 3)).toEqual(['2026-12-30', '2026-12-29', '2026-12-28']);
  });
});
