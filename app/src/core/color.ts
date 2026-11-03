// Colour maths for themes: contrast (WCAG 2.x) and how a colour looks to colour blind riders.
// Pure functions so the theme tests can prove every theme stays readable and every status stays
// distinguishable, instead of trusting an eyeball check.

export type RGB = [number, number, number];

/** '#RGB', '#RRGGBB' or '#RRGGBBAA' to 0-255 channels (alpha ignored). */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}/.test(h)) throw new Error(`Not a hex colour: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Halfway (or `t` of the way) from colour a to colour b. */
export function mix(a: string, b: string, t = 0.5): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB);
}

/** 'rgba(r,g,b,a)' for a hex colour, for glass panels and tints. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l: number) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. Body text needs 4.5, large text and icons 3. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type Vision = 'protan' | 'deutan' | 'tritan';

// Machado, Oliveira and Fernandes (2009), full-severity matrices in linear RGB.
const MATRICES: Record<Vision, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** How a colour looks to a rider with full red-weak, green-weak or blue-weak vision. */
export function simulate(hex: string, vision: Vision): string {
  const lin = hexToRgb(hex).map(toLinear);
  const m = MATRICES[vision];
  const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return rgbToHex(out.map((l) => toSrgb(Math.min(1, Math.max(0, l)))) as RGB);
}

function toLab(hex: string): RGB {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Perceptual distance (CIE76 delta E). Around 2 is barely visible; 20+ is clearly different. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
