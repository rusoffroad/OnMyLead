import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
// Store screenshots: serves the web export (build.sh) and answers Supabase calls from fixtures/.
// Each target is "name|path|width|height|signedOut|scrollTo|clickAt|clickText|language|appearanceJSON|clicks".
// Run everything with shots.sh.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { tables, rpcs, session, localTrails, avatarFile } from './fixtures/store/fixtures.mjs';
const [dist, out, ...targets] = process.argv.slice(2);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(dist, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(8099);
function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(eq|neq|in|is|gte|lte|gt|lt)\.(.*)$/.exec(v); if (!m) continue;
    const [, op, val] = m;
    out = out.filter((r) => {
      if (!(k in r)) return true;
      const x = r[k];
      if (op === 'eq') return String(x) === val;
      if (op === 'neq') return String(x) !== val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, '')).includes(String(x));
      if (op === 'is') return val === 'null' ? x == null : true;
      return true;
    });
  }
  return out;
}
const browser = await chromium.launch();
for (const t of targets) {
  const [name, url, w = '393', h = '852', signedOut, scrollTo, clickAt, clickText, lang, theme, clicks] = t.split('|');
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR || 2), timezoneId: 'America/Denver', geolocation: { latitude: 38.5881, longitude: -109.5335 }, permissions: ['geolocation'] });
  if (!signedOut) await ctx.addInitScript((s) => localStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session());
  await ctx.addInitScript((t) => localStorage.setItem('nav.trails.v1', JSON.stringify(t)), localTrails);
  // The language to shoot in (as if picked in You > Language); none = Match Phone (the browser is en-US).
  if (theme) await ctx.addInitScript((t) => localStorage.setItem('onmylead.appearance', t), theme);
  await ctx.addInitScript(() => { const g = navigator.geolocation; const wrap = (cb) => (p) => cb({ timestamp: p.timestamp, coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: 5, altitude: 1395, altitudeAccuracy: 5, heading: 62, speed: 11 } }); const w = g.watchPosition.bind(g), c = g.getCurrentPosition.bind(g); g.watchPosition = (a, b, o) => w(wrap(a), b, o); g.getCurrentPosition = (a, b, o) => c(wrap(a), b, o); localStorage.setItem('nav.trip.v1', JSON.stringify({ distanceM: 37200, movingS: 5580 })); localStorage.setItem('nav.panelOpen.v1', 'true'); });
  await ctx.addInitScript(() => { localStorage.setItem('tilt.calibration', JSON.stringify({ gravity: { x: 0, y: -1, z: 0 } })); });
  if (lang) await ctx.addInitScript((l) => localStorage.setItem('onmylead.language', JSON.stringify({ choice: l, updatedAt: '2026-11-03T00:00:00.000Z' })), lang);
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const u = new URL(route.request().url()); const method = route.request().method(); if (process.env.DBG && /profiles|storage/.test(u.pathname)) console.log('  req', u.pathname + u.search);
    const accept = route.request().headers()['accept'] || '';
    const single = accept.includes('vnd.pgrst.object');
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = u.pathname.split('/').pop();
      if (!(fn in rpcs)) console.log('  rpc', fn);
      return route.fulfill({ json: fn === 'my_rider_agreement' ? { version: 99 } : (rpcs[fn] ?? null) });
    }
    if (u.pathname.startsWith('/rest/v1/')) {
      const tbl = u.pathname.split('/').pop();
      if (!(tbl in tables)) console.log('  table', tbl);
      if (method !== 'GET' && method !== 'HEAD') return route.fulfill({ json: single ? {} : [] });
      const rows = filterRows(tables[tbl] ?? [], u.searchParams);
      if (single) return rows.length ? route.fulfill({ json: rows[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
      return route.fulfill({ json: rows, headers: { 'content-range': `0-${rows.length}/${rows.length}` } });
    }
    if (u.pathname.startsWith('/auth/v1/user')) return route.fulfill({ json: session().user });
    if (u.pathname.startsWith('/realtime')) return route.abort();
    if (/\/storage\/v1\/object\/public\/rider-(avatars|posts)\//.test(u.pathname)) { const f = avatarFile(u.pathname.split(/\/rider-(?:avatars|posts)\//)[1]); return f ? route.fulfill({ path: new URL('./fixtures/social/img/' + f + '.jpg', import.meta.url).pathname, contentType: 'image/jpeg' }) : route.fulfill({ status: 404, body: '' }); }
    console.log('  other', u.pathname); return route.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror', e.message)); if (process.env.DBG) page.on('console', (m) => console.log('  console', m.text().slice(0, 200)));
  await page.goto('http://localhost:8099' + url);
  await page.waitForTimeout(+(process.env.WAIT || 5000));
  if (scrollTo) { await page.getByText(scrollTo, { exact: false }).first().scrollIntoViewIfNeeded(); await page.evaluate(() => new Promise(r => setTimeout(r, 300))); const el = page.getByText(scrollTo).first(); await el.evaluate((e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(800); }
  for (const c of (clicks || '').split(',').filter(Boolean)) { if (c.startsWith('@')) await page.getByLabel(c.slice(1), { exact: false }).first().click(); else await page.getByText(c, { exact: false }).first().click(); await page.waitForTimeout(1200); }
  if (clickAt) { const [cx, cy] = clickAt.split(',').map(Number); await page.mouse.click(cx, cy); await page.waitForTimeout(1500); }
  if (clickText) { await page.getByText(clickText, { exact: true }).first().click(); await page.waitForTimeout(800); if (scrollTo) await page.getByText(scrollTo).first().evaluate((e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(500); }
  if (process.env.DBG) console.log(await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.src.slice(0, 120)).join('\n')));
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('shot', name);
  await ctx.close();
}
await browser.close(); srv.close();
