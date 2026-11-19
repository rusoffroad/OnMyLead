import type { SpotKind } from '@/core/spots';

/**
 * The map pin for a place to ride (Places to Ride, 4.0; Chris 2026-11-18: "you can do better on the
 * icons on the map" and no teal). One teardrop shape in the app's own colours, its point on the
 * place, with a white picture of what you ride there:
 *
 *   Off-road park     red     a 4x4
 *   Motocross track   gold    a dirt bike
 *   OHV area          blue    an ATV
 *   Trail system      green   a pine tree (mostly Forest Service trails)
 *   Trailhead         green   a trail sign
 *   Snowmobile area   ice blue a snowflake
 *   Scenic drive      orange  a road winding to a peak
 *   Campground        brown   a tent
 *
 * Plain data, so the phone (react-native-svg, components/spot-pin.tsx) and the website (Leaflet
 * HTML, spotPinSvg below) draw the same pin. The pins sit on satellite and terrain maps, so the
 * colours are the same in every theme.
 */

/** The pin colour for each kind. */
export const SPOT_INK: Record<SpotKind, string> = {
  park: '#E5262E',
  track: '#E2B54A',
  ohv_area: '#3B86F7',
  trail_system: '#2F9E5B',
  trailhead: '#2F9E5B',
  // Activities (4.0): each in its activity's own colour family.
  snow_area: '#3E8FD6',
  scenic_drive: '#E8641C',
  campground: '#8A5A2B',
};

/** One part of a picture, in a 24 x 24 box: white, a cut-out in the pin colour, or a white line. */
export type GlyphPart = { d: string; as: 'fill' | 'hole' | 'line' };

const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

export const SPOT_GLYPHS: Record<SpotKind, GlyphPart[]> = {
  // A 4x4 from the side: body, two windows, big tyres.
  park: [
    { d: 'M3.2 13.6V11c0-.6.4-1 1-1h1.6l2-3.6c.2-.3.5-.5.9-.5h6.4c.4 0 .7.2.9.5l2.1 3.6h1.6c.6 0 1 .4 1 1v2.6h-1.3a3.3 3.3 0 0 0-6.5 0H9.1a3.3 3.3 0 0 0-6.5 0z', as: 'fill' },
    { d: 'M8.6 7.6 7.4 10h3.6V7.6zM12.4 7.6V10h3.9l-1.3-2.4z', as: 'hole' },
    { d: ring(5.9, 15.4, 2.6) + ring(17.6, 15.4, 2.6), as: 'fill' },
    { d: ring(5.9, 15.4, 1) + ring(17.6, 15.4, 1), as: 'hole' },
    { d: 'M20.6 9.2h1.6v1.4h-1.6z', as: 'fill' },
  ],
  // A dirt bike: two wheels, frame, fork, bars and a high seat.
  track: [
    { d: ring(5.4, 15.6, 3.4) + ring(18.6, 15.6, 3.4), as: 'line' },
    { d: 'M5.4 15.6 9 10.6h5.2l1.4-2.8M18.6 15.6l-3-7.8M9.6 10.6l1.8 4.4h3.4', as: 'line' },
    { d: 'M9.2 8.6c1.4-1.1 3.6-1.3 5.8-.6l-.6 1.4c-1.7-.4-3.3-.3-4.4.4z', as: 'fill' },
    { d: 'M14.4 5.8h2.8l.6 1.4h-2.6z', as: 'fill' },
  ],
  // An ATV: four-wheeler body over two wheels, handlebars up front.
  ohv_area: [
    { d: ring(5.6, 16, 3.2) + ring(18.4, 16, 3.2), as: 'fill' },
    { d: ring(5.6, 16, 1.1) + ring(18.4, 16, 1.1), as: 'hole' },
    { d: 'M3 12.4 6 9.8h4.6l1.4 2h3l1.8-2.4h3.2l1 3h-2.8a4 4 0 0 0-5.4 2.4H9.6A4 4 0 0 0 3 12.4z', as: 'fill' },
    { d: 'M14.4 9.4 13.2 6h2.2l1 2.6z', as: 'fill' },
  ],
  // A pine tree: forest trails.
  trail_system: [
    { d: 'M12 2.5 16.6 9h-2.2l3.6 5h-2.4l3.4 4.6H5l3.4-4.6H6l3.6-5H7.4z', as: 'fill' },
    { d: 'M10.8 18.6h2.4v3h-2.4z', as: 'fill' },
  ],
  // A trail sign: a post with two boards pointing opposite ways.
  trailhead: [
    { d: 'M11 3h2v18.5h-2z', as: 'fill' },
    { d: 'M5 5h12.6l2.4 2.6-2.4 2.6H5z', as: 'fill' },
    { d: 'M19 12.2H6.4L4 14.8l2.4 2.6H19z', as: 'fill' },
  ],
  // A snowflake: three bars and their tips.
  snow_area: [
    { d: 'M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5', as: 'line' },
    { d: 'M9.4 3.8 12 6l2.6-2.2M9.4 20.2 12 18l2.6 2.2', as: 'line' },
  ],
  // A road winding toward a peak.
  scenic_drive: [
    { d: 'M2.5 12 8 5l3.6 4.2L14 6.4 21.5 12z', as: 'fill' },
    { d: 'M9 21.5c0-3.5 6-3.4 6-6.4s-3.6-2.6-3.6-4', as: 'line' },
  ],
  // A tent with its door open.
  campground: [
    { d: 'M12 3.6 2.6 20.4h18.8z', as: 'fill' },
    { d: 'M12 11.4 8.6 20.4h6.8z', as: 'hole' },
  ],
};

/** The teardrop in a 40 x 50 box; its point (20, 48) is the place. */
export const PIN_PATH = 'M20 48C20 48 4 31.5 4 19.5a16 16 0 0 1 32 0C36 31.5 20 48 20 48z';
export const PIN_W = 40;
export const PIN_H = 50;
/** Where the 24-unit picture sits inside the teardrop, and how big. */
export const GLYPH_AT = { x: 5.6, y: 5.2, scale: 1.2 } as const;

/** The pin as an SVG string for the website's Leaflet maps. `scale` 1 is 40 x 50 pixels. */
export function spotPinSvg(kind: SpotKind, scale = 0.8): string {
  const ink = SPOT_INK[kind] ?? SPOT_INK.park;
  const parts = (SPOT_GLYPHS[kind] ?? SPOT_GLYPHS.park)
    .map((p) => (p.as === 'line'
      ? `<path d="${p.d}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${p.d}" fill="${p.as === 'hole' ? ink : '#fff'}"/>`))
    .join('');
  const w = Math.round(PIN_W * scale);
  const h = Math.round(PIN_H * scale);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${PIN_W} ${PIN_H}" style="overflow:visible;display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))"><path d="${PIN_PATH}" fill="${ink}" stroke="#fff" stroke-width="2.2"/><g transform="translate(${GLYPH_AT.x} ${GLYPH_AT.y}) scale(${GLYPH_AT.scale})">${parts}</g></svg>`;
}
