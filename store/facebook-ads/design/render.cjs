const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const here = __dirname;
  const b = await chromium.launch();
  for (const f of ['feed', 'story']) {
    const h = f === 'story' ? 1920 : 1350;
    const p = await b.newPage({ viewport: { width: 1080, height: h }, deviceScaleFactor: 1 });
    for (const v of ['a', 'b', 'c']) {
      await p.goto('file://' + path.join(here, 'ad.html') + `?v=${v}&f=${f}`);
      await p.waitForTimeout(900);
      await p.screenshot({ path: path.join(here, '..', `onmylead-ad-${v}-${f}.png`) });
    }
    await p.close();
  }
  await b.close();
})();
