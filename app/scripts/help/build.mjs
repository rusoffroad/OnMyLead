// Builds the Help Center (onmylead.com/help) as plain static pages inside the web export, so
// Google reads real HTML and the pages load without the app. Run after `expo export`:
//   node scripts/help/build.mjs dist
// HELP_OFFLINE=1 skips the App Store lookup and the dashboard edits (for local previews).
// Only articles for the App Store version that is live are written (see help/README.md).
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as notesRules from '../../src/core/release-notes.ts';
import { HELP, ROOT, SITE, engine, git, loadHelp, loadLiveEdits, lookupPlay, readJson, resolveRelease, withEdit } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(process.argv[2] ?? 'dist');
const offline = process.env.HELP_OFFLINE === '1';
const out = join(dist, 'help');
const esc = engine.escapeHtml;

const help = loadHelp();
if (help.errors.length) {
  for (const e of help.errors) console.error(`Help article ${e.slug}: ${e.message}`);
  process.exit(1);
}
const release = await resolveRelease(help.release, { offline });
const { edits, error: editsError } = await loadLiveEdits({ offline });
if (editsError) console.log(`Help: no dashboard edits (${editsError})`);
const editFor = new Map(edits.map((e) => [e.slug, e]));
const appConfig = readJson(join(ROOT, 'app/app.json')).expo;
const play = await lookupPlay(appConfig.android?.package ?? help.release.bundleId, { offline });
if (play.error && !offline) console.log(`Help: no Google Play version (${play.error})`);
const stores = {
  apple: { version: release.apple.checked ? release.apple.version : release.live, releasedAt: release.apple.releasedAt },
  google: { version: play.version },
};
const releaseNotes = notesRules.publishedReleases(help.releaseNotes, stores);

const cats = help.categories;
const catByKey = new Map(cats.map((c) => [c.key, c]));
const all = help.articles.map((a) => withEdit(a, editFor.get(a.slug)));
const published = all
  .filter((a) => engine.visibility(a, release.publicVersion) === 'published')
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
const bySlug = new Map(published.map((a) => [a.slug, a]));
const commit = (process.env.GITHUB_SHA ?? git(['rev-parse', 'HEAD']) ?? '').slice(0, 7);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets', 'fonts'), { recursive: true });
mkdirSync(join(out, 'category'), { recursive: true });
mkdirSync(join(out, 'img'), { recursive: true });

/* ---------- assets ---------- */
writeFileSync(join(out, 'assets', 'help.css'), readFileSync(join(here, 'help.css'), 'utf8'));
writeFileSync(join(out, 'assets', 'help.js'), readFileSync(join(here, 'help-client.js'), 'utf8'));
writeFileSync(
  join(out, 'assets', 'help-engine.js'),
  stripTypeScriptTypes(readFileSync(join(ROOT, 'app/src/core/help.ts'), 'utf8'), { mode: 'strip' }),
);
const fonts = [
  ['barlow', '500Medium/Barlow_500Medium.ttf'],
  ['barlow', '700Bold/Barlow_700Bold.ttf'],
  ['barlow-condensed', '700Bold/BarlowCondensed_700Bold.ttf'],
  ['barlow-condensed', '800ExtraBold/BarlowCondensed_800ExtraBold.ttf'],
];
for (const [pkg, file] of fonts) {
  copyFileSync(join(ROOT, 'app/node_modules/@expo-google-fonts', pkg, file), join(out, 'assets', 'fonts', file.split('/')[1]));
}
const usedImages = new Set(published.flatMap((a) => a.screenshots.map((s) => s.file)));
for (const f of usedImages) {
  if (existsSync(join(HELP, 'img', f))) copyFileSync(join(HELP, 'img', f), join(out, 'img', f));
}

/* ---------- page frame ---------- */
// The pages check the dashboard for an edit made after this build, so a fix shows at once.
const sbUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const sbKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const liveMeta = sbUrl && sbKey && !offline ? `<meta name="oml-live" content="${esc(sbUrl)}" data-key="${esc(sbKey)}">` : '';

const ICONS = {
  flag: 'M7 21V4M7 4h10l-2 4 2 4H7',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3v5M15 3v5',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.6-3.5 3-5.5 6-5.5s5.4 2 6 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c1.6.8 2.7 2.6 3 5.2',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  shield: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  group: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.1',
};
// The category mark is a trail blaze, the painted diamond the app uses for waypoints.
const blaze = (icon, size = 52) =>
  `<span class="blaze" style="--s:${size}px" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[icon] ?? ICONS.help}"/></svg></span>`;

function page({ path, title, description, body, jsonLd = [], noindex = false, bodyClass = '' }) {
  const url = `${SITE}${path}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta name="theme-color" content="#0A1626">
${liveMeta}
<meta property="og:type" content="article">
<meta property="og:site_name" content="OnMyLead">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/showcase/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/help/assets/fonts/Barlow_500Medium.ttf" as="font" type="font/ttf" crossorigin>
<link rel="preload" href="/help/assets/fonts/BarlowCondensed_800ExtraBold.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="/help/assets/help.css">
${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
<script type="module" src="/help/assets/help.js"></script>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to Content</a>
<header class="bar">
  <a class="brand" href="/" aria-label="OnMyLead home"><img src="/showcase/logo-lockup.png" alt="OnMyLead" width="158" height="36"></a>
  <nav aria-label="Site">
    <a href="/">Home</a>
    <a href="/help" aria-current="${path.startsWith('/help') && path !== '/help/release-notes' ? 'page' : 'false'}">Help Center</a>
    <a class="nav-notes" href="/help/release-notes" aria-current="${path === '/help/release-notes' ? 'page' : 'false'}">Release Notes</a>
    <a href="/contact">Contact Us</a>
  </nav>
  <a class="btn btn-line btn-small" href="/sign-in">Sign In</a>
</header>
${release.notice ? `<p class="notice" role="note">${esc(release.notice)}</p>` : ''}
<main id="main">
${body}
</main>
<footer class="foot">
  <img src="/showcase/logo-lockup.png" alt="OnMyLead" width="140" height="32">
  <p>Made by <a href="https://rusoffroad.com">RUS Offroad</a>. © ${new Date().getFullYear()} RUS Offroad LLC.</p>
  <nav aria-label="Legal and account">
    <a href="/help">Help Center</a>
    <a href="/help/release-notes">Release Notes</a>
    <a href="/support">Help and Support</a>
    <a href="/contact">Contact Us</a>
    <a href="/terms">Terms of Use</a>
    <a href="/privacy">Privacy Policy</a>
  </nav>
</footer>
</body>
</html>
`;
}

const searchForm = (value = '', big = false) => `<form class="search${big ? ' search-big' : ''}" action="/help/search" method="get" role="search">
  <label class="sr" for="q">Search the Help Center</label>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5"/></svg>
  <input id="q" name="q" type="search" value="${esc(value)}" placeholder="Search for Help, Like “Join a Ride”" autocomplete="off" enterkeyhint="search">
  <button class="btn btn-red" type="submit">Search</button>
  <div class="suggest" hidden></div>
</form>`;

const articleLink = (a) => `<li><a href="/help/${a.slug}"><b>${esc(a.title)}</b><span>${esc(a.summary)}</span></a></li>`;
const inCategory = (key) => published.filter((a) => a.category === key);
const crumb = (items) =>
  `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items
    .map(([label, href]) => (href ? `<li><a href="${href}">${esc(label)}</a></li>` : `<li aria-current="page">${esc(label)}</li>`))
    .join('')}</ol></nav>`;
const crumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: href ? `${SITE}${href}` : undefined })),
});

const pages = []; // [path, lastmod] for the sitemap

/* ---------- home ---------- */
{
  const latest = [...published].sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title)).slice(0, 6);
  const starters = ['getting-started', 'create-a-ride', 'join-a-ride', 'ride-mode', 'location-sharing', 'free-vs-pro']
    .map((s) => bySlug.get(s))
    .filter(Boolean);
  const body = `
<section class="hero">
  <div class="topo" aria-hidden="true"></div>
  <div class="wrap">
    <h1>How Can We Help?</h1>
    <p class="lede">Step-by-step guides for every part of OnMyLead, from your first ride to the last rider home.</p>
    ${searchForm('', true)}
    ${starters.length ? `<p class="quick">Popular: ${starters.map((a) => `<a href="/help/${a.slug}">${esc(a.title)}</a>`).join('')}</p>` : ''}
  </div>
</section>
<div class="wrap">
  <section aria-labelledby="topics" class="topics">
    <h2 id="topics">Browse by Topic</h2>
    <ul class="cat-grid">
      ${cats
        .filter((c) => inCategory(c.key).length)
        .map(
          (c) => `<li><a class="cat" href="/help/category/${c.key}">${blaze(c.icon)}<span><b>${esc(c.title)}</b><span>${esc(c.summary)}</span><small>${inCategory(c.key).length} ${inCategory(c.key).length === 1 ? 'Guide' : 'Guides'}</small></span></a></li>`,
        )
        .join('')}
    </ul>
  </section>
  ${releaseNotes.length ? `<section aria-labelledby="whats-new" class="whats-new">
    <h2 id="whats-new">What's New in ${esc(releaseNotes[0].version)}</h2>
    <p>${esc(releaseNotes[0].intro)}</p>
    <a class="btn btn-line btn-small" href="/help/release-notes">See All Release Notes</a>
  </section>` : ''}
  <section aria-labelledby="recent" class="recent">
    <h2 id="recent">Recently Updated</h2>
    <ul class="list">${latest.map(articleLink).join('')}</ul>
  </section>
  <section class="still">
    <h2>Still Stuck?</h2>
    <p>Tell us what happened and we'll get back to you by email.</p>
    <a class="btn btn-blue" href="/contact">Contact Us</a>
  </section>
</div>`;
  writeFileSync(
    join(out, 'index.html'),
    page({
      path: '/help',
      title: 'OnMyLead Help Center',
      description: 'Guides for the OnMyLead group ride app: create and join rides, the live group map, location sharing, routes, offline maps, riding groups, Pro and your account.',
      body,
      bodyClass: 'home',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'OnMyLead Help Center',
          url: `${SITE}/help`,
          potentialAction: { '@type': 'SearchAction', target: `${SITE}/help/search?q={q}`, 'query-input': 'required name=q' },
        },
      ],
    }),
  );
  pages.push(['/help', published.map((a) => a.updated).sort().pop()]);
}

/* ---------- categories ---------- */
const sideNav = (current, currentSlug) => `<nav class="side" aria-label="Help topics">
  ${cats
    .filter((c) => inCategory(c.key).length)
    .map(
      (c) => `<details${c.key === current ? ' open' : ''}><summary>${esc(c.title)}</summary><ul>${inCategory(c.key)
        .map((a) => `<li><a href="/help/${a.slug}"${a.slug === currentSlug ? ' aria-current="page"' : ''}>${esc(a.title)}</a></li>`)
        .join('')}</ul></details>`,
    )
    .join('')}
</nav>`;

for (const c of cats) {
  const list = inCategory(c.key);
  if (!list.length) continue;
  const items = [['Help Center', '/help'], [c.title, null]];
  const body = `<div class="wrap with-side">
  ${sideNav(c.key)}
  <div class="content">
    ${crumb(items)}
    <header class="cat-head">${blaze(c.icon, 64)}<div><h1>${esc(c.title)}</h1><p class="lede">${esc(c.summary)}</p></div></header>
    <ul class="list">${list.map(articleLink).join('')}</ul>
  </div>
</div>`;
  writeFileSync(
    join(out, 'category', `${c.key}.html`),
    page({ path: `/help/category/${c.key}`, title: `${c.title} | OnMyLead Help`, description: c.summary, body, jsonLd: [crumbLd(items)] }),
  );
  pages.push([`/help/category/${c.key}`, list.map((a) => a.updated).sort().pop()]);
}

/* ---------- articles ---------- */
const searchDocs = [];
for (const a of published) {
  const md = engine.filterRelease(a.body, release.publicVersion);
  const r = engine.renderMarkdown(md);
  // A link to an article that isn't public yet (upcoming or waiting for review) becomes plain text.
  r.html = r.html.replace(/<a href="\/help\/([a-z0-9-]+)(#[^"]*)?">([\s\S]*?)<\/a>/g, (m, slug, _hash, label) =>
    bySlug.has(slug) || slug === 'search' || slug === 'category' || slug === 'release-notes' ? m : label);
  const c = catByKey.get(a.category);
  const items = [['Help Center', '/help'], [c?.title ?? 'Help', `/help/category/${a.category}`], [a.title, null]];
  const related = a.related.map((s) => bySlug.get(s)).filter(Boolean);
  const toc = r.headings.filter((h) => h.level === 2);
  const isFaq = a.slug === 'faq';
  const jsonLd = [
    crumbLd(items),
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: a.title,
      description: a.summary,
      dateModified: a.updated,
      inLanguage: 'en-US',
      mainEntityOfPage: `${SITE}/help/${a.slug}`,
      author: { '@type': 'Organization', name: 'RUS Offroad', url: 'https://rusoffroad.com' },
      publisher: { '@type': 'Organization', name: 'OnMyLead', logo: { '@type': 'ImageObject', url: `${SITE}/showcase/logo-lockup.png` } },
      about: { '@type': 'SoftwareApplication', name: 'OnMyLead', operatingSystem: 'iOS', applicationCategory: 'NavigationApplication' },
    },
  ];
  if (isFaq) {
    // Every "## Question?" heading and the text under it.
    const qa = [];
    const parts = md.split(/^##\s+/m).slice(1);
    for (const p of parts) {
      const [q, ...rest] = p.split('\n');
      if (q.trim().endsWith('?')) qa.push({ '@type': 'Question', name: q.trim(), acceptedAnswer: { '@type': 'Answer', text: engine.plainText(rest.join('\n')) } });
    }
    if (qa.length) jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa });
  }
  const pro = /This is a Pro feature/.test(md);
  const tags = [
    a.release === 'web' ? '<span class="tag tag-web">On the Website</span>' : '<span class="tag">iPhone App</span>',
    pro ? '<a class="tag tag-pro" href="/help/free-vs-pro">Pro</a>' : '',
  ].join('');
  const body = `<div class="wrap with-side">
  ${sideNav(a.category, a.slug)}
  <article class="content article" data-slug="${a.slug}" data-edit="${a.edited?.id ?? ''}" data-version="${esc(release.publicVersion ?? '')}">
    ${crumb(items)}
    <h1>${esc(a.title)}</h1>
    <p class="lede">${esc(a.summary)}</p>
    <p class="meta">${tags}<span class="updated">Last Updated <time datetime="${a.updated}">${engine.formatHelpDate(a.updated)}</time></span></p>
    ${toc.length > 2 ? `<nav class="toc" aria-label="On This Page"><p>On This Page</p><ol>${toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></nav>` : ''}
    <div class="prose">${r.html}</div>
    ${a.edited ? `<script type="text/markdown" id="auto-version" data-title="${esc(help.articles.find((x) => x.slug === a.slug).title)}" data-summary="${esc(help.articles.find((x) => x.slug === a.slug).summary)}" data-updated="${help.articles.find((x) => x.slug === a.slug).updated}">${engine.filterRelease(help.articles.find((x) => x.slug === a.slug).body, release.publicVersion).replace(/<\//g, '<\\/')}</script>` : ''}
    ${related.length ? `<section class="related"><h2>Related Articles</h2><ul class="list">${related.map(articleLink).join('')}</ul></section>` : ''}
    <aside class="helped"><p>Didn't find what you needed?</p><a class="btn btn-line btn-small" href="/contact">Contact Us</a></aside>
  </article>
</div>`;
  writeFileSync(
    join(out, `${a.slug}.html`),
    page({ path: `/help/${a.slug}`, title: `${a.title} | OnMyLead Help`, description: a.summary, body, jsonLd }),
  );
  pages.push([`/help/${a.slug}`, a.updated]);
  searchDocs.push({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    category: c?.title ?? '',
    keywords: a.keywords,
    headings: r.headings.map((h) => h.text),
    text: engine.plainText(md).slice(0, 4000),
  });
}

/* ---------- release notes ---------- */
// Every version a store has released, newest first, drawn as stops along a trail
// (help/release-notes.json; rules in app/src/core/release-notes.ts).
{
  const anchor = (v) => `v${v.replace(/\./g, '-')}`;
  const storeLine = (r, store) => {
    const s = notesRules.storeState(r, store, help.releaseNotes, stores);
    const name = store === 'apple' ? 'App Store' : 'Google Play';
    const devices = store === 'apple' ? 'iPhone and iPad' : 'Android';
    if (s.state === 'released')
      return `<li class="store on"><b>${devices}</b><span>${name}${s.date ? `, <time datetime="${s.date}">${engine.formatHelpDate(s.date)}</time>` : ''}</span></li>`;
    if (s.state === 'later') return `<li class="store"><b>${devices}</b><span>Included in <a href="#${anchor(s.version)}">${esc(s.version)}</a></span></li>`;
    return `<li class="store"><b>${devices}</b><span>Coming to the ${name}</span></li>`;
  };
  const stops = releaseNotes
    .map(
      (r, i) => `<li class="stop${i === 0 ? ' latest' : ''}" id="${anchor(r.version)}">
      <span class="pin" aria-hidden="true"></span>
      <header class="stop-head">
        <h2><span class="ver">${esc(r.version)}</span><span class="stop-title">${esc(r.title)}</span></h2>
        ${i === 0 ? '<span class="tag tag-latest">Latest</span>' : ''}
      </header>
      <ul class="stores" aria-label="Where to get ${esc(r.version)}">${storeLine(r, 'apple')}${storeLine(r, 'google')}</ul>
      <p class="stop-intro">${esc(r.intro)}</p>
      ${notesRules
        .groupNotes(r)
        .map(
          (g) => `<section class="kind kind-${g.kind}" aria-label="${g.title} in ${esc(r.version)}"><h3>${g.title}</h3><ul>${g.notes
            .map((n) => `<li>${esc(n.text)}${n.devices ? ` <span class="tag">${notesRules.DEVICE_LABELS[n.devices]}</span>` : ''}</li>`)
            .join('')}</ul></section>`,
        )
        .join('')}
    </li>`,
    )
    .join('');
  const items = [['Help Center', '/help'], ['Release Notes', null]];
  const body = `<div class="wrap notes-page">
  ${crumb(items)}
  <header class="notes-head">
    <h1>Release Notes</h1>
    <p class="lede">What changed in each version of OnMyLead for iPhone, iPad and Android, newest first. Update the app from the App Store or Google Play to get the latest.</p>
  </header>
  ${stops ? `<ol class="trail">${stops}</ol>` : '<p class="empty">The first version\'s notes appear here once it is in the App Store or on Google Play.</p>'}
  <p class="trail-end">Found a problem in the latest version? <a href="/contact">Tell us about it</a>.</p>
</div>`;
  const newest = releaseNotes[0];
  writeFileSync(
    join(out, 'release-notes.html'),
    page({
      path: '/help/release-notes',
      title: 'Release Notes | OnMyLead Help',
      description: newest
        ? `What's new in every OnMyLead update. Latest: ${newest.version}, ${newest.title}.`
        : "What's new in every OnMyLead update for iPhone, iPad and Android.",
      body,
      bodyClass: 'notes',
      jsonLd: [crumbLd(items)],
    }),
  );
  const lastDate = releaseNotes
    .flatMap((r) => ['apple', 'google'].map((s) => notesRules.storeState(r, s, help.releaseNotes, stores)))
    .map((s) => (s.state === 'released' ? s.date : null))
    .filter(Boolean)
    .sort()
    .pop();
  pages.push(['/help/release-notes', lastDate ?? null]);
}

/* ---------- search, 404, redirects ---------- */
if (releaseNotes.length)
  searchDocs.push({
    slug: 'release-notes',
    title: 'Release Notes',
    summary: `What's new in every OnMyLead update. Latest: ${releaseNotes[0].version}.`,
    category: 'Help Center',
    keywords: ['release notes', "what's new", 'changelog', 'update', 'version', ...releaseNotes.map((r) => r.version)],
    headings: releaseNotes.map((r) => `${r.version} ${r.title}`),
    text: releaseNotes.flatMap((r) => [r.intro, ...r.notes.map((n) => n.text)]).join(' ').slice(0, 4000),
  });
writeFileSync(join(out, 'search-index.json'), JSON.stringify(searchDocs));
writeFileSync(
  join(out, 'search.html'),
  page({
    path: '/help/search',
    title: 'Search | OnMyLead Help',
    description: 'Search the OnMyLead Help Center.',
    noindex: true,
    body: `<div class="wrap narrow">${crumb([['Help Center', '/help'], ['Search', null]])}<h1>Search the Help Center</h1>${searchForm()}<div id="results" class="results" aria-live="polite"><p class="empty">Type a few words, like “offline maps” or “cancel a ride”.</p></div></div>`,
  }),
);
writeFileSync(
  join(out, '404.html'),
  page({
    path: '/help/404',
    title: 'Page Not Found | OnMyLead Help',
    description: 'This help page has moved or no longer exists.',
    noindex: true,
    body: `<div class="wrap narrow"><h1>We Couldn't Find That Page</h1><p class="lede">It may have moved, or the feature it described has changed. Try searching instead.</p>${searchForm()}<p><a href="/help">Back to the Help Center</a></p></div>`,
  }),
);
for (const [from, to] of Object.entries(help.redirects)) {
  if (bySlug.has(from)) continue;
  writeFileSync(
    join(out, `${from}.html`),
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Moved</title><meta http-equiv="refresh" content="0; url=/help/${to}"><link rel="canonical" href="${SITE}/help/${to}"><meta name="robots" content="noindex"></head><body><a href="/help/${to}">This page moved.</a></body></html>`,
  );
}

/* ---------- what the website is showing, for the Admin Dashboard ---------- */
writeFileSync(
  join(out, 'status.json'),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      commit,
      publicVersion: release.publicVersion,
      live: release.live,
      prelaunch: release.prelaunch,
      appleChecked: release.apple.checked,
      appleError: release.apple.error,
      published: published.map((a) => ({ slug: a.slug, updated: a.updated, edit: a.edited?.id ?? null })),
      googlePlay: play.version,
      releaseNotes: releaseNotes.map((r) => r.version),
      editsError,
    },
    null,
    1,
  ),
);

/* ---------- sitemap and robots for the whole site ---------- */
const today = new Date().toISOString().slice(0, 10);
const sitePages = [['/', today], ['/support', today], ['/contact', today], ['/privacy', today], ['/terms', today], ['/ride/new', today], ...pages];
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitePages
    .map(([p, d]) => `  <url><loc>${SITE}${p === '/' ? '' : p}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(
  join(dist, 'robots.txt'),
  `User-agent: *\nDisallow: /admin\nDisallow: /f/\nDisallow: /auth-callback\nDisallow: /reset-password\nDisallow: /help/search\n\nSitemap: ${SITE}/sitemap.xml\n`,
);

const upcoming = all.filter((a) => engine.visibility(a, release.publicVersion) !== 'published').map((a) => a.slug);
console.log(
  `Help Center: ${published.length} articles published for ${release.prelaunch ? `prelaunch ${release.publicVersion}` : `App Store ${release.live}`}` +
    `${upcoming.length ? `; held back: ${upcoming.join(', ')}` : ''}${edits.length ? `; ${edits.length} dashboard edits` : ''}.`,
);
