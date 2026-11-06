/**
 * Your own dot's looks (Map Settings > Your Dot > Dot Style), drawn as SVG text so one drawing
 * serves every map: the apps' native Mapbox puck (PNG images made by scripts/puck/make-images.mjs),
 * React Native's SvgXml on the flat maps and the website's Mapbox map, and Leaflet's HTML markers.
 * Self-contained on purpose (no app imports) so the image script can load it with Node.
 *
 * Every style is drawn dead centre in a square `ownDotBox(d)` wide, so a marker anchored at its
 * middle keeps the disc on the coordinate. `angle` is on screen, degrees clockwise from straight
 * up; null means no direction is known (no beam, a round centre instead of the arrow).
 */

export type DotStyle = 'flag' | 'dome' | 'ring' | 'arrow' | 'orange' | 'classic';

/**
 * In the order the picker shows them. Red, White and Blue is the default from 2.1 build 10 (Chris,
 * 2026-11-05); earlier 2.1 test builds defaulted to Safety Orange. A rider who picked a style keeps it.
 */
export const DOT_STYLES: readonly DotStyle[] = ['flag', 'orange', 'dome', 'ring', 'arrow', 'classic'];
export const DEFAULT_DOT_STYLE: DotStyle = 'flag';

export const DOT_STYLE_NAME: Record<DotStyle, string> = {
  flag: 'Red, White and Blue',
  dome: 'Hi-Viz Dome',
  ring: 'Reflective Ring',
  arrow: 'Floating Arrowhead',
  orange: 'Safety Orange',
  classic: 'Classic',
};

/** A saved value back to a style; anything unknown is the default. */
export function parseDotStyle(v: string | null | undefined): DotStyle {
  return (DOT_STYLES as readonly string[]).includes(v ?? '') ? (v as DotStyle) : DEFAULT_DOT_STYLE;
}

/** The style's main color (the beam and halo), e.g. for an outline around a preview. */
export const DOT_STYLE_INK: Record<DotStyle, string> = {
  flag: '#E5233B',
  dome: '#D7FF1E',
  ring: '#D7FF1E',
  arrow: '#D7FF1E',
  orange: '#FF6A13',
  classic: '#19C2FF',
};

/** How big the square around your dot is: room for the beam ahead of it. */
export function ownDotBox(d: number): number {
  return Math.ceil(d * 5.4);
}

const n = (x: number) => Math.round(x * 100) / 100;

function hex(h: string): number[] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function mix(a: string, b: string, t: number): string {
  const B = hex(b);
  return '#' + hex(a).map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('');
}

/**
 * Your dot as an SVG document. `id` keeps gradient names apart when several dots share a page
 * (the website); any short letters-and-digits string will do.
 */
export function ownDotSvg(style: DotStyle, d: number, angle: number | null, moving: boolean, id = 'o'): string {
  const box = ownDotBox(d);
  const c = n(box / 2);
  const r = d / 2;
  const ink = DOT_STYLE_INK[style];
  const reach = r * (moving ? 5 : 3.2);
  const a = Math.round(angle ?? 0);
  const turn = (body: string) => (angle == null ? body : `<g transform="rotate(${a} ${c} ${c})">${body}</g>`);
  const P = (x: number, y: number) => `${n(c + x * r)} ${n(c + y * r)}`;

  const beamDef = `<radialGradient id="${id}b" cx="${c}" cy="${c}" r="${n(reach)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${ink}" stop-opacity="${moving ? 0.6 : 0.42}"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></radialGradient>`;
  const spread = style === 'classic' ? 1.9 : 1.8;
  const beam = angle == null ? '' : turn(`<path d="M${c} ${c} L${n(c - r * spread)} ${n(c - reach)} A${n(reach)} ${n(reach)} 0 0 1 ${n(c + r * spread)} ${n(c - reach)} Z" fill="url(#${id}b)"/>`);
  const shadowDef = `<radialGradient id="${id}s" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
  const shadow = `<ellipse cx="${n(c + r * 0.12)}" cy="${n(c + r * 0.32)}" rx="${n(r * 1.32)}" ry="${n(r * 1.2)}" fill="url(#${id}s)"/>`;
  /** The chevron, `s` its size against the disc; a round centre when no direction is known. */
  const chevron = (s: number, fill: string, extra = '') =>
    angle == null
      ? `<circle cx="${c}" cy="${c}" r="${n(r * 0.26)}" fill="${fill}"${extra}/>`
      : turn(`<path d="M${P(0, -0.56 * s)} L${P(0.42 * s, 0.38 * s)} L${P(0, 0.16 * s)} L${P(-0.42 * s, 0.38 * s)} Z" fill="${fill}" stroke-linejoin="round"${extra}/>`);

  let defs = beamDef;
  let body = '';
  if (style === 'dome' || style === 'orange') {
    const dome = style === 'dome'
      ? ['#F6FFB0', '#D7FF1E', '#6E8F00']
      : ['#FFC08A', '#FF6A13', '#8A2E00'];
    defs += shadowDef
      + `<radialGradient id="${id}d" cx="38%" cy="30%" r="76%"><stop offset="0" stop-color="${dome[0]}"/><stop offset=".36" stop-color="${dome[1]}"/><stop offset="1" stop-color="${dome[2]}"/></radialGradient>`
      + `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#C3CBD5"/><stop offset="1" stop-color="#F2F5F8"/></linearGradient>`
      + `<linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2F36"/><stop offset="1" stop-color="#05070A"/></linearGradient>`;
    body = shadow
      + `<circle cx="${c}" cy="${c}" r="${n(r)}" fill="url(#${id}r)"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r * (style === 'dome' ? 0.84 : 0.82))}" fill="url(#${id}d)"/>`
      + `<ellipse cx="${n(c - r * 0.21)}" cy="${n(c - r * 0.39)}" rx="${n(r * 0.41)}" ry="${n(r * 0.19)}" fill="#fff" fill-opacity="${style === 'dome' ? 0.55 : 0.45}"/>`
      + (style === 'dome'
        ? chevron(1, `url(#${id}a)`, ` stroke="#000" stroke-opacity=".3" stroke-width="${n(r * 0.04)}"`)
        : chevron(0.98, '#FFFFFF'));
  } else if (style === 'flag') {
    // Red, White and Blue: a white reflective rim, a red band, a thin white ring and a glossy navy
    // dome with a white chevron (a white star when no direction is known). The white rim and navy
    // centre keep it readable on any map and without telling red from blue.
    defs += shadowDef
      + `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#C3CBD5"/><stop offset="1" stop-color="#F2F5F8"/></linearGradient>`
      + `<radialGradient id="${id}e" cx="38%" cy="30%" r="76%"><stop offset="0" stop-color="#FF8A96"/><stop offset=".4" stop-color="#E5233B"/><stop offset="1" stop-color="#7A0A18"/></radialGradient>`
      + `<radialGradient id="${id}d" cx="38%" cy="30%" r="76%"><stop offset="0" stop-color="#5F86E8"/><stop offset=".4" stop-color="#1B3FA0"/><stop offset="1" stop-color="#07153F"/></radialGradient>`;
    const star = Array.from({ length: 10 }, (_, i) => {
      const k = (i % 2 ? 0.13 : 0.32);
      const t = (Math.PI / 5) * i;
      return `${i ? 'L' : 'M'}${P(Math.sin(t) * k, -Math.cos(t) * k)}`;
    }).join(' ') + ' Z';
    body = shadow
      + `<circle cx="${c}" cy="${c}" r="${n(r)}" fill="url(#${id}r)"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r * 0.86)}" fill="url(#${id}e)"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r * 0.66)}" fill="#FFFFFF"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r * 0.6)}" fill="url(#${id}d)"/>`
      + `<ellipse cx="${n(c - r * 0.2)}" cy="${n(c - r * 0.42)}" rx="${n(r * 0.4)}" ry="${n(r * 0.17)}" fill="#fff" fill-opacity=".4"/>`
      + (angle == null ? `<path d="${star}" fill="#FFFFFF"/>` : chevron(0.9, '#FFFFFF'));
  } else if (style === 'ring') {
    defs += shadowDef
      + `<radialGradient id="${id}d" cx="36%" cy="28%" r="80%"><stop offset="0" stop-color="#8BE6FF"/><stop offset=".45" stop-color="#19A8E6"/><stop offset="1" stop-color="#063B5C"/></radialGradient>`
      + `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4FF9A"/><stop offset=".5" stop-color="#D7FF1E"/><stop offset="1" stop-color="#8FB000"/></linearGradient>`;
    body = shadow
      + `<circle cx="${c}" cy="${c}" r="${n(r)}" fill="url(#${id}r)"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r * 0.97)}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="${n(r * 0.06)}" stroke-dasharray="${n(r * 0.18)} ${n(r * 0.14)}"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r * 0.74)}" fill="#0A1A26"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r * 0.69)}" fill="url(#${id}d)"/>`
      + `<path d="M${P(-0.55, -0.12)} A${n(r * 0.62)} ${n(r * 0.62)} 0 0 1 ${P(0.3, -0.58)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="${n(r * 0.09)}" stroke-linecap="round"/>`
      + chevron(0.82, '#FFFFFF');
  } else if (style === 'arrow') {
    defs += `<radialGradient id="${id}h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#D7FF1E" stop-opacity=".95"/><stop offset=".7" stop-color="#D7FF1E" stop-opacity=".8"/><stop offset="1" stop-color="#D7FF1E" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E3E9F0"/></linearGradient>`
      + `<linearGradient id="${id}k" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9FAAB8"/><stop offset="1" stop-color="#6C7887"/></linearGradient>`;
    const w = 0.72;
    const edge = `stroke="#0B1220" stroke-width="${n(r * 0.07)}" stroke-linejoin="round"`;
    body = `<circle cx="${c}" cy="${c}" r="${n(r * 1.05)}" fill="url(#${id}h)"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r * 0.92)}" fill="none" stroke="#0B1220" stroke-opacity=".55" stroke-width="${n(r * 0.08)}"/>`
      + (angle == null
        ? `<circle cx="${c}" cy="${c}" r="${n(r * 0.42)}" fill="url(#${id}l)" ${edge}/>`
        : turn(`<path d="M${P(0, -0.66)} L${P(w, 0.74)} L${P(0, 0.38)} L${P(-w, 0.74)} Z" fill="#000" fill-opacity=".45"/>`
          + `<path d="M${P(0, -0.82)} L${P(0, 0.22)} L${P(-w, 0.58)} Z" fill="url(#${id}l)" ${edge}/>`
          + `<path d="M${P(0, -0.82)} L${P(w, 0.58)} L${P(0, 0.22)} Z" fill="url(#${id}k)" ${edge}/>`));
  } else {
    // Classic: the 2.1 Chevron Puck in glacier cyan.
    const rim = Math.max(2, r * 0.17);
    defs += `<radialGradient id="${id}d" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${ink}"/><stop offset="1" stop-color="${mix(ink, '#061223', 0.55)}"/></radialGradient>`;
    body = `<circle cx="${c}" cy="${c}" r="${n(r + 6)}" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="2"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r + 1.5)}" fill="#000" fill-opacity=".45"/>`
      + `<circle cx="${c}" cy="${c}" r="${n(r - rim / 2)}" fill="url(#${id}d)" stroke="#FFFFFF" stroke-width="${n(rim)}"/>`
      + (angle == null
        ? `<circle cx="${c}" cy="${c}" r="${n(r * 0.28)}" fill="#FFFFFF"/>`
        : turn(`<path d="M${P(0, -0.56)} L${P(0.44, 0.4)} L${P(0, 0.17)} L${P(-0.44, 0.4)} Z" fill="#FFFFFF"/>`));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}"><defs>${defs}</defs>${beam}${body}</svg>`;
}
