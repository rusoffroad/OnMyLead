import { describe, expect, it } from 'vitest';
import {
  AREAS, areaLabel, buildCsv, buildSheetText, buildTotals, centsToInput, csvCell, exportFileBase, formatDollars,
  isPlausibleVin, parseAmount, parseDollars, parseVpic, vehicleRange, vehicleTitle, type GarageItem, type GarageVehicle,
} from '../garage';

const rzr: GarageVehicle = {
  kind: 'sxs_utv', nickname: 'Dusty', year: 2022, make: 'Polaris', model: 'RZR Pro R', trim: 'Ultimate',
  vin: '3NSR4UGZ1NF123456', purchase_price_cents: 3_499_900, engine_hours: 212, odometer_miles: 1840.5,
  tank_gallons: 10, extra_fuel_gallons: 3.5, mpg: 12,
};

const item = (area: string, name: string, cost: number | null, extra: Partial<GarageItem> = {}): GarageItem => ({
  area, name, brand: null, cost_cents: cost, installed_on: null, notes: null, ...extra,
});

describe('areas', () => {
  it('has the eleven build areas with labels', () => {
    expect(AREAS).toHaveLength(11);
    expect(AREAS.map((a) => a.label)).toEqual([
      'Wheels & Tires', 'Suspension', 'Protection', 'Roof & Cab', 'Lighting', 'Audio & Comms',
      'Electronics', 'Storage & Mounts', 'Recovery', 'Performance', 'Other',
    ]);
    expect(areaLabel('audio_comms')).toBe('Audio & Comms');
    expect(areaLabel('nonsense')).toBe('Other');
  });
});

describe('money', () => {
  it('parses dollars to cents', () => {
    expect(parseDollars('')).toEqual({ ok: true, cents: null });
    expect(parseDollars('  ')).toEqual({ ok: true, cents: null });
    expect(parseDollars('450')).toEqual({ ok: true, cents: 45_000 });
    expect(parseDollars('$1,299.99')).toEqual({ ok: true, cents: 129_999 });
    expect(parseDollars('12.5')).toEqual({ ok: true, cents: 1_250 });
    expect(parseDollars('12.')).toEqual({ ok: true, cents: 1_200 });
    expect(parseDollars('.99')).toEqual({ ok: true, cents: 99 });
    expect(parseDollars('0')).toEqual({ ok: true, cents: 0 });
  });

  it('rejects junk, negatives and fractions of a cent', () => {
    for (const bad of ['abc', '-5', '1.234', '1.2.3', '$', '12 dollars', '1e5']) {
      expect(parseDollars(bad).ok, bad).toBe(false);
    }
  });

  it('formats cents and round-trips through the input', () => {
    expect(formatDollars(0)).toBe('$0.00');
    expect(formatDollars(5)).toBe('$0.05');
    expect(formatDollars(129_999)).toBe('$1,299.99');
    expect(formatDollars(123_456_789)).toBe('$1,234,567.89');
    expect(formatDollars(null)).toBe('$0.00');
    expect(formatDollars(null, { blank: '' })).toBe('');
    expect(centsToInput(1_250)).toBe('12.50');
    expect(centsToInput(null)).toBe('');
    const r = parseDollars(centsToInput(129_999));
    expect(r.ok && r.cents).toBe(129_999);
  });

  it('parses optional amounts', () => {
    expect(parseAmount('')).toEqual({ ok: true, value: null });
    expect(parseAmount('9.5')).toEqual({ ok: true, value: 9.5 });
    expect(parseAmount('1,200')).toEqual({ ok: true, value: 1200 });
    expect(parseAmount('-3').ok).toBe(false);
    expect(parseAmount('x').ok).toBe(false);
  });
});

describe('build totals', () => {
  it('groups by area in canonical order with subtotals and a grand total', () => {
    const items = [
      item('lighting', 'Light bar', 45_000),
      item('wheels_tires', 'Beadlocks', 160_000),
      item('lighting', 'Rock lights', 12_000),
      item('wheels_tires', 'Tires', 120_000),
      item('recovery', 'Tow strap', null),
      item('bogus_area', 'Mystery part', 1_000),
    ];
    const t = buildTotals(items);
    expect(t.groups.map((g) => g.area)).toEqual(['wheels_tires', 'lighting', 'recovery', 'other']);
    expect(t.groups.map((g) => g.subtotalCents)).toEqual([280_000, 57_000, 0, 1_000]);
    expect(t.groups[0].items.map((i) => i.name)).toEqual(['Beadlocks', 'Tires']);
    expect(t.totalCents).toBe(338_000);
    expect(t.itemCount).toBe(6);
  });

  it('is empty for no items', () => {
    expect(buildTotals([])).toEqual({ groups: [], totalCents: 0, itemCount: 0 });
  });
});

describe('naming and fuel', () => {
  it('titles a vehicle', () => {
    expect(vehicleTitle(rzr)).toBe('Dusty (2022 Polaris RZR Pro R Ultimate)');
    expect(vehicleTitle({ ...rzr, nickname: null })).toBe('2022 Polaris RZR Pro R Ultimate');
    expect(vehicleTitle({ nickname: ' ', year: null, make: null, model: null, trim: null })).toBe('My machine');
    expect(exportFileBase(rzr)).toBe('dusty-2022-polaris-rzr-pro-r-ultimate-build');
  });

  it('uses the shared fuel range math and needs tank + mpg', () => {
    const r = vehicleRange(rzr)!;
    expect(r.fullRangeMiles).toBe(162);
    expect(r.safeTurnaroundMiles).toBe(54);
    expect(r.safeTripMiles).toBe(108);
    expect(vehicleRange({ tank_gallons: 10, extra_fuel_gallons: null, mpg: 12 })!.fullRangeMiles).toBe(120);
    expect(vehicleRange({ tank_gallons: null, extra_fuel_gallons: 5, mpg: 12 })).toBeNull();
    expect(vehicleRange({ tank_gallons: 10, extra_fuel_gallons: 5, mpg: null })).toBeNull();
  });
});

describe('csv export', () => {
  it('escapes cells', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(' padded ')).toBe('" padded "');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('@sum')).toBe("'@sum");
  });

  it('exports every item sorted by area plus a total row', () => {
    const csv = buildCsv(rzr, [
      item('lighting', 'Light bar, 40"', 45_000, { brand: 'Baja Designs', installed_on: '2026-05-01', notes: 'Wired to\nswitch 3' }),
      item('wheels_tires', 'Beadlocks', 160_000, { brand: 'Method' }),
      item('recovery', 'Strap', null),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Vehicle,Area,Item,Brand,Cost (USD),Installed,Notes');
    expect(lines[1]).toBe('Dusty (2022 Polaris RZR Pro R Ultimate),Wheels & Tires,Beadlocks,Method,1600.00,,');
    expect(lines[2]).toBe('Dusty (2022 Polaris RZR Pro R Ultimate),Lighting,"Light bar, 40""",Baja Designs,450.00,2026-05-01,"Wired to\nswitch 3"');
    expect(lines[3]).toBe('Dusty (2022 Polaris RZR Pro R Ultimate),Recovery,Strap,,,,');
    expect(lines[4]).toBe('Dusty (2022 Polaris RZR Pro R Ultimate),Total,,,2050.00,,');
    expect(lines[5]).toBe('');
  });
});

describe('build sheet text', () => {
  it('lists areas, subtotals, fuel range and totals', () => {
    const text = buildSheetText(rzr, [
      item('wheels_tires', 'Beadlocks', 160_000, { brand: 'Method', installed_on: '2026-04-02' }),
      item('wheels_tires', 'Tires', 120_000),
      item('lighting', 'Light bar', 45_000, { notes: 'Switch 3' }),
    ]);
    expect(text).toContain('Dusty (2022 Polaris RZR Pro R Ultimate)');
    expect(text).toContain('SXS/UTV | VIN 3NSR4UGZ1NF123456 | 1840.5 mi | 212 hrs');
    expect(text).toContain('Fuel: 10 gal tank + 3.5 gal extra at 12 mpg');
    expect(text).toContain('Range: 162 mi full, 54 mi safe turnaround, 108 mi safe trip');
    expect(text).toContain('WHEELS & TIRES - $2,800.00\n  - Beadlocks (Method), $1,600.00, installed 2026-04-02\n  - Tires, $1,200.00');
    expect(text).toContain('LIGHTING - $450.00\n  - Light bar, $450.00\n      Switch 3');
    expect(text.indexOf('WHEELS')).toBeLessThan(text.indexOf('LIGHTING'));
    expect(text).toContain('Build total: $3,250.00 across 3 items');
    expect(text).toContain('Purchase price: $34,999.00');
    expect(text).toContain('All in: $38,249.00');
  });

  it('handles an empty build without fuel numbers', () => {
    const text = buildSheetText({ ...rzr, mpg: null, purchase_price_cents: null }, []);
    expect(text).toContain('No parts or extras listed yet.');
    expect(text).toContain('Build total: $0.00 across 0 items');
    expect(text).not.toContain('Range:');
    expect(text).not.toContain('All in');
  });
});

describe('vin decode', () => {
  it('checks VIN shape', () => {
    expect(isPlausibleVin('3NSR4UGZ1NF123456')).toBe(true);
    expect(isPlausibleVin('3NSR4UGZ1NF12345')).toBe(false);
    expect(isPlausibleVin('3NSR4UGZ1NFI23456')).toBe(false);
  });

  it('reads year/make/model/trim from vPIC', () => {
    const json = { Results: [{ ModelYear: '2022', Make: 'POLARIS', Model: 'RZR Pro R', Trim: '', Series: 'Ultimate' }] };
    expect(parseVpic(json)).toEqual({ year: 2022, make: 'Polaris', model: 'RZR Pro R', trim: 'Ultimate' });
    expect(parseVpic({ Results: [{ ModelYear: '2020', Make: 'BMW', Model: 'X5', Trim: 'xDrive40i' }] })!.make).toBe('BMW');
    expect(parseVpic({ Results: [{ ModelYear: '', Make: '', Model: '' }] })).toBeNull();
    expect(parseVpic(null)).toBeNull();
    expect(parseVpic({})).toBeNull();
  });
});
