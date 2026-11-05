// Draws your own dot (components/rider-puck.tsx, the 2.1 "Chevron Puck" in YOU_INK) as PNGs for
// the apps' native Mapbox location puck (components/mapbox-map.tsx). Mapbox moves and turns the
// native puck itself, in step with the map, which a React marker can't do smoothly.
// Run from app/: node scripts/puck/make-images.mjs   (uses the preinstalled Playwright Chromium)
// Keep the drawing in step with puckSvg in rider-puck.tsx if that changes.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const COLOR = '#19C2FF';
const D = 33; // core/dot-size DOT_D.medium (Mapbox scales the images for the other sizes)
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t).toString(16).padStart(2, '0')).join('');

function svg(kind) {
  const box = Math.ceil(D * 5.4);
  const c = box / 2;
  const r = D / 2;
  const deep = mix(COLOR, '#061223', 0.55);
  const rim = Math.max(2, r * 0.17);
  const moving = kind === 'moving';
  const reach = r * (moving ? 5 : 3.2);
  const arrow = kind !== 'still';
  const beam = arrow
    ? `<path d="M${c} ${c} L${c - r * 1.9} ${c - reach} A${reach} ${reach} 0 0 1 ${c + r * 1.9} ${c - reach} Z" fill="url(#b)"/>`
    : '';
  const mark = arrow
    ? `<path d="M${c} ${c - r * 0.56} L${c + r * 0.44} ${c + r * 0.4} L${c} ${c + r * 0.17} L${c - r * 0.44} ${c + r * 0.4} Z" fill="#fff"/>`
    : `<circle cx="${c}" cy="${c}" r="${r * 0.28}" fill="#fff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">`
    + `<defs><radialGradient id="d" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${COLOR}"/><stop offset="1" stop-color="${deep}"/></radialGradient>`
    + `<radialGradient id="b" cx="${c}" cy="${c}" r="${reach}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${COLOR}" stop-opacity="${moving ? 0.55 : 0.4}"/><stop offset="1" stop-color="${COLOR}" stop-opacity="0"/></radialGradient></defs>`
    + beam
    + `<circle cx="${c}" cy="${c}" r="${r + 6}" fill="none" stroke="${COLOR}" stroke-opacity=".35" stroke-width="2"/>`
    + `<circle cx="${c}" cy="${c}" r="${r + 1.5}" fill="#000" fill-opacity=".45"/>`
    + `<circle cx="${c}" cy="${c}" r="${r - rim / 2}" fill="url(#d)" stroke="#fff" stroke-width="${rim}"/>`
    + mark
    + '</svg>';
}

const browser = await chromium.launch();
for (const scale of [1, 2, 3]) {
  const page = await browser.newPage({ deviceScaleFactor: scale });
  for (const kind of ['moving', 'stopped']) {
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(kind)}</body></html>`);
    const png = await page.locator('svg').screenshot({ omitBackground: true });
    writeFileSync(`assets/images/puck/you-${kind}${scale === 1 ? '' : `@${scale}x`}.png`, png);
  }
  // A clear square for the puck's top layer: the whole dot turns with the arrow (it is round).
  await page.setContent('<html><body style="margin:0;background:transparent"><div style="width:2px;height:2px"></div></body></html>');
  writeFileSync(`assets/images/puck/clear${scale === 1 ? '' : `@${scale}x`}.png`, await page.locator('div').screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();
