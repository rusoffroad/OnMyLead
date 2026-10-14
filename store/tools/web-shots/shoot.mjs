import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { tables, rpcs, session } from './fixtures.mjs';
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
  const [name, url, w = '393', h = '852', signedOut, scrollTo] = t.split('|');
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR || 3), geolocation: { latitude: 38.5881, longitude: -109.5335 }, permissions: ['geolocation'], timezoneId: 'America/Denver' });
  if (!signedOut) await ctx.addInitScript((s) => localStorage.setItem('sb-mock-auth-token', JSON.stringify(s)), session());
  await ctx.route('https://mock.supabase.co/**', async (route) => {
    const u = new URL(route.request().url()); const method = route.request().method();
    const accept = route.request().headers()['accept'] || '';
    const single = accept.includes('vnd.pgrst.object');
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = u.pathname.split('/').pop();
      if (!(fn in rpcs)) console.log('  rpc', fn);
      return route.fulfill({ json: rpcs[fn] ?? null });
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
    console.log('  other', u.pathname); return route.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror', e.message));
  await page.goto('http://localhost:8099' + url);
  await page.waitForTimeout(+(process.env.WAIT || 3500));
  if (scrollTo) { await page.getByText(scrollTo, { exact: false }).first().scrollIntoViewIfNeeded(); await page.evaluate(() => new Promise(r => setTimeout(r, 300))); const el = page.getByText(scrollTo).first(); await el.evaluate((e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(800); }
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('shot', name);
  await ctx.close();
}
await browser.close(); srv.close();
