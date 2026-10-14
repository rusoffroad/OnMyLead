// Screenshots of the exported website at every phone and tablet size in
// docs/development-standards.md section 6, so a reviewer can see a layout on each device class
// without building the apps. Fails when a page doesn't load or throws; warns when a page scrolls
// sideways (a layout wider than the window).
//
// Usage: node scripts/ci/screenshots.mjs <dist dir> <out dir>
//   PLAYWRIGHT_DIR  folder whose node_modules has playwright (it isn't an app dependency)
//   CHROMIUM_PATH   optional browser to use instead of Playwright's own download
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';

const [distArg, outArg] = process.argv.slice(2);
if (!distArg || !outArg) {
  console.error('Usage: node scripts/ci/screenshots.mjs <dist dir> <out dir>');
  process.exit(2);
}
const dist = resolve(distArg);
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const require = createRequire(join(resolve(process.env.PLAYWRIGHT_DIR ?? '.'), 'noop.js'));
const { chromium } = require('playwright');

const SIZES = [
  { name: 'iphone', width: 393, height: 852, mobile: true },
  { name: 'ipad-portrait', width: 820, height: 1180, mobile: true },
  { name: 'ipad-landscape', width: 1180, height: 820, mobile: true },
  { name: 'android-phone', width: 412, height: 915, mobile: true },
  { name: 'android-tablet', width: 1280, height: 800, mobile: true },
];
// Pages anyone can open signed out. Signed-in screens need a real account and are checked on
// devices (docs/development-standards.md).
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'sign-in', path: '/sign-in' },
  { name: 'contact', path: '/contact' },
  { name: 'privacy', path: '/privacy' },
  { name: 'help', path: '/help/' },
];

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json', '.vtt': 'text/vtt',
};
// Serves dist like the production server: real files first, then folder index.html, then the
// single-page app shell.
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(dist, path);
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = existsSync(`${file}.html`) ? `${file}.html` : join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const warnings = [];
const shots = [];
for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    isMobile: size.mobile,
    hasTouch: true,
  });
  // Nothing should reach the internet from CI: block outside hosts so pages render the same every run.
  await context.route((url) => !url.href.startsWith(origin), (route) => route.abort());
  for (const p of PAGES) {
    const page = await context.newPage();
    const thrown = [];
    page.on('pageerror', (e) => thrown.push(e.message));
    const file = `${p.name}-${size.name}.png`;
    try {
      const res = await page.goto(origin + p.path, { waitUntil: 'load', timeout: 60_000 });
      if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(out, file) });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (wide > 1) warnings.push(`${p.path} at ${size.name} (${size.width}×${size.height}) scrolls sideways by ${wide}px.`);
      shots.push({ page: p.path, size: size.name, width: size.width, height: size.height, file });
    } catch (e) {
      errors.push(`${p.path} at ${size.name} didn't load: ${e.message.split('\n')[0]}`);
    }
    for (const t of thrown) errors.push(`${p.path} at ${size.name} threw: ${t.split('\n')[0]}`);
    await page.close();
  }
  await context.close();
}
await browser.close();
server.close();

writeFileSync(join(out, 'index.json'), JSON.stringify({ sizes: SIZES, pages: PAGES, shots, warnings, errors }, null, 2) + '\n');
const gh = !!process.env.GITHUB_ACTIONS;
for (const w of warnings) console.log(gh ? `::warning::${w}` : `WARNING: ${w}`);
for (const e of errors) console.log(gh ? `::error::${e}` : `ERROR: ${e}`);
console.log(`${shots.length} screenshots in ${out}.`);
if (errors.length) process.exit(1);
