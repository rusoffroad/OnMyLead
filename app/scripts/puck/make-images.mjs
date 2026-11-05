// Draws your own dot in every Dot Style (core/own-dot-art.ts) as PNGs for
// the apps' native Mapbox location puck (components/mapbox-map.tsx). Mapbox moves and turns the
// native puck itself, in step with the map, which a React marker can't do smoothly.
// Run from app/: node --experimental-strip-types scripts/puck/make-images.mjs   (uses the preinstalled Playwright Chromium)
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const { DOT_STYLES, ownDotSvg } = await import('../../src/core/own-dot-art.ts');
const D = 33; // core/dot-size DOT_D.medium (Mapbox scales the images for the other sizes)

const browser = await chromium.launch();
for (const scale of [1, 2, 3]) {
  const page = await browser.newPage({ deviceScaleFactor: scale });
  for (const style of DOT_STYLES) {
    for (const kind of ['moving', 'stopped', 'still']) {
      // Drawn pointing up: Mapbox turns the whole image to the course (moving) or compass (stopped).
      // 'still' has no arrow or beam, for a stopped phone with no compass reading.
      await page.setContent(`<html><body style="margin:0;background:transparent">${ownDotSvg(style, D, kind === 'still' ? null : 0, kind === 'moving')}</body></html>`);
      const png = await page.locator('svg').screenshot({ omitBackground: true });
      writeFileSync(`assets/images/puck/you-${style}-${kind}${scale === 1 ? '' : `@${scale}x`}.png`, png);
    }
  }
  // A clear square for the puck's top layer: the whole dot turns with the arrow (it is round).
  await page.setContent('<html><body style="margin:0;background:transparent"><div style="width:2px;height:2px"></div></body></html>');
  writeFileSync(`assets/images/puck/clear${scale === 1 ? '' : `@${scale}x`}.png`, await page.locator('div').screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();
