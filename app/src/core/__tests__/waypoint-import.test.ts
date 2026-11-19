import { describe, expect, it } from 'vitest';
import { detectFormat, guessSymbol, keyValueDesc, markDuplicates, parseWaypointFile } from '../waypoint-import';

const gpx = (body: string) => `<?xml version="1.0"?><gpx version="1.1" creator="x" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
const kml = (body: string) => `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`;

describe('parseWaypointFile', () => {
  it('reads GPX waypoints and counts tracks', () => {
    const r = parseWaypointFile(gpx(`
      <wpt lat="38.57" lon="-109.55"><name>Upper Camp</name><desc>Flat spot</desc></wpt>
      <wpt lat="38.6" lon="-109.6"><name><![CDATA[Gas & Go]]></name></wpt>
      <wpt lat="38.7" lon="-109.7"/>
      <trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>`));
    expect(r.format).toBe('gpx');
    expect(r.lines).toBe(1);
    expect(r.pins.map((p) => [p.name, p.symbol])).toEqual([['Upper Camp', 'camp'], ['Gas & Go', 'fuel'], ['Imported Waypoint', 'spot']]);
    expect(r.pins[0]).toMatchObject({ lat: 38.57, lng: -109.55, note: 'Flat spot' });
  });

  it('reads KML points and skips lines', () => {
    const r = parseWaypointFile(kml(`
      <Folder><Placemark><name>Washout</name><description>&lt;b&gt;go slow&lt;/b&gt;</description>
        <Point><coordinates>-109.5,38.5,1500</coordinates></Point></Placemark></Folder>
      <Placemark><name>Line</name><LineString><coordinates>-109,38 -110,39</coordinates></LineString></Placemark>`));
    expect(r.format).toBe('kml');
    expect(r.lines).toBe(1);
    expect(r.pins).toEqual([{ name: 'Washout', note: 'go slow', lat: 38.5, lng: -109.5, symbol: 'hazard' }]);
  });

  it('reads GeoJSON points', () => {
    const r = parseWaypointFile(JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-109.1, 38.1] }, properties: { title: 'Overlook' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
      ],
    }));
    expect(r.format).toBe('geojson');
    expect(r.pins).toEqual([{ name: 'Overlook', note: null, lat: 38.1, lng: -109.1, symbol: 'view' }]);
    expect(r.lines).toBe(1);
  });

  it('drops bad coordinates and explains empty files', () => {
    expect(() => parseWaypointFile(gpx('<wpt lat="999" lon="0"/><wpt lat="0" lon="0"/>'))).toThrow(/no waypoints/);
    expect(() => parseWaypointFile(gpx('<trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>'))).toThrow(/Draw a Route/);
    expect(() => parseWaypointFile('hello')).toThrow(/not a GPX, KML or KMZ/);
    expect(() => parseWaypointFile('{"type":"FeatureCollection", broken')).toThrow(/could not be read/);
  });
});

describe('key=value descriptions (the shape onX exports)', () => {
  const wpt = (name: string, notes: string, icon: string) =>
    `<wpt lat="39.1" lon="-106.2"><name>${name}</name><desc>name=${name}\nnotes=${notes}\nid=00000000-0000-4000-8000-000000000000\ncolor=rgba(132, 212, 0, 1)\nicon=${icon}</desc>` +
    `<extensions><onx:color>rgba(132, 212, 0, 1)</onx:color><onx:icon>${icon}</onx:icon></extensions></wpt>`;
  const file = (body: string) =>
    `<gpx xmlns:onx="https://wwww.onxmaps.com/" xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="x"><metadata/>${body}</gpx>`;

  it('keeps the rider\'s notes, not the raw lines', () => {
    const r = parseWaypointFile(file(wpt('Bear Creek', '', 'Location') + wpt('Night Two', 'Flat, room for 4 rigs\nNo fires', 'Campsite')));
    expect(r.pins).toEqual([
      { name: 'Bear Creek', note: null, lat: 39.1, lng: -106.2, symbol: 'spot' },
      { name: 'Night Two', note: 'Flat, room for 4 rigs No fires', lat: 39.1, lng: -106.2, symbol: 'camp' },
    ]);
  });

  it('uses the icon when the name says nothing', () => {
    expect(parseWaypointFile(file(wpt('Stop 3', '', 'Fuel'))).pins[0].symbol).toBe('fuel');
    expect(keyValueDesc('Just a normal note')).toBeNull();
  });
});

describe('detectFormat', () => {
  it('goes by the text, not the name', () => {
    expect(detectFormat(gpx(''))).toBe('gpx');
    expect(detectFormat(kml(''))).toBe('kml');
    expect(detectFormat('{"type":"Feature","geometry":null}')).toBe('geojson');
    expect(detectFormat('{"a":1}')).toBeNull();
  });
});

describe('guessSymbol', () => {
  it('picks from names and icon names, hazards first', () => {
    expect(guessSymbol('Camp - washout ahead')).toBe('hazard');
    expect(guessSymbol('Trailhead_Parking')).toBe('trailhead');
    expect(guessSymbol('#icon-campground')).toBe('camp');
    expect(guessSymbol('Cattle Guard')).toBe('gate');
    expect(guessSymbol('Bob')).toBe('spot');
  });
});

describe('markDuplicates', () => {
  it('skips pins the rider has and repeats inside the file', () => {
    const pins = [
      { name: 'Camp', note: null, lat: 38, lng: -109, symbol: 'camp' as const },
      { name: 'camp ', note: null, lat: 38.0001, lng: -109, symbol: 'camp' as const },
      { name: 'Camp', note: null, lat: 38.1, lng: -109, symbol: 'camp' as const },
      { name: 'Lot', note: null, lat: 38.2, lng: -109, symbol: 'parking' as const },
    ];
    expect(markDuplicates(pins, [{ name: 'Lot', lat: 38.2, lng: -109 }])).toEqual([false, true, false, true]);
  });
});
