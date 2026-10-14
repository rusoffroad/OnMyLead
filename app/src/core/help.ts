/**
 * The Help Center engine: reads help articles (Markdown with front matter, in help/articles/),
 * decides what the public may see for the App Store version that is live, and turns Markdown
 * into HTML.
 *
 * One self-contained file with no imports, because three places run it: the build and check
 * scripts (Node, app/scripts/help/*.mjs), the static help pages in the browser (the build strips
 * the types and serves it as /help/assets/help-engine.js), and the Admin Dashboard's Help page.
 */

export type HelpScreenshot = { file: string; shows: string[] };

export type HelpMeta = {
  title: string;
  summary: string;
  category: string;
  order: number;
  /** First App Store version with this feature ("1.0"), or "web" for website-only features. */
  release: string;
  /** YYYY-MM-DD, shown as Last Updated. */
  updated: string;
  sources: string[];
  screenshots: HelpScreenshot[];
  related: string[];
  keywords: string[];
  draft: boolean;
  /** Something Chris has to confirm. The article stays off the website while this is set. */
  review: string | null;
};

export type HelpArticle = HelpMeta & { slug: string; body: string };

export type HelpCategory = { key: string; title: string; summary: string; icon?: string };

export type HelpHeading = { level: number; id: string; text: string };

/* ---------------------------------------------------------------------------------------------
 * Front matter: the small YAML subset the articles use (scalars, [inline, lists], "- " lists and
 * lists of "key: value" maps).
 * ------------------------------------------------------------------------------------------- */

type Yaml = string | number | boolean | null | Yaml[] | { [k: string]: Yaml };

function scalar(raw: string): Yaml {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner ? splitInline(inner).map(scalar) : [];
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v) && !/^\d+\.\d+\.\d+$/.test(v)) return Number(v);
  return v;
}

function splitInline(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseYaml(text: string): Record<string, Yaml> {
  const lines = text.split('\n');
  const root: Record<string, Yaml> = {};
  let i = 0;
  const indentOf = (l: string) => l.length - l.trimStart().length;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`Front matter line ${i + 1} isn't "key: value": ${line}`);
    const [, key, rest] = m;
    i++;
    if (rest.trim() !== '') {
      root[key] = scalar(rest);
      continue;
    }
    // A block list under the key.
    const items: Yaml[] = [];
    while (i < lines.length && (lines[i].trim() === '' || /^\s+-\s|^-\s/.test(lines[i]) || indentOf(lines[i]) > 0)) {
      const l = lines[i];
      if (!l.trim()) {
        i++;
        continue;
      }
      const item = /^(\s*)-\s+(.*)$/.exec(l);
      if (!item) throw new Error(`Front matter line ${i + 1} should start with "- ": ${l}`);
      const itemIndent = item[1].length;
      const first = item[2];
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(first);
      i++;
      if (!kv) {
        items.push(scalar(first));
        continue;
      }
      const obj: Record<string, Yaml> = { [kv[1]]: scalar(kv[2]) };
      while (i < lines.length && lines[i].trim() && indentOf(lines[i]) > itemIndent && !/^\s*-\s/.test(lines[i])) {
        const more = /^\s+([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
        if (!more) throw new Error(`Front matter line ${i + 1} isn't "key: value": ${lines[i]}`);
        obj[more[1]] = scalar(more[2]);
        i++;
      }
      items.push(obj);
    }
    root[key] = items;
  }
  return root;
}

const str = (v: Yaml | undefined): string => (v === null || v === undefined ? '' : String(v));
const list = (v: Yaml | undefined): string[] =>
  Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : v === undefined || v === null || v === '' ? [] : [str(v)];

/** Splits "---\nfront matter\n---\nbody". Throws with a readable message when it's malformed. */
export function parseArticle(slug: string, text: string): HelpArticle {
  const src = text.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
  if (!m) throw new Error(`${slug}: missing the --- front matter block at the top`);
  const y = parseYaml(m[1]);
  const shots = Array.isArray(y.screenshots) ? y.screenshots : [];
  return {
    slug,
    title: str(y.title),
    summary: str(y.summary),
    category: str(y.category),
    order: typeof y.order === 'number' ? y.order : 999,
    release: str(y.release),
    updated: str(y.updated),
    sources: list(y.sources),
    screenshots: shots.map((s) =>
      s && typeof s === 'object' && !Array.isArray(s)
        ? { file: str(s.file), shows: list(s.shows) }
        : { file: str(s as Yaml), shows: [] },
    ),
    related: list(y.related),
    keywords: list(y.keywords),
    draft: y.draft === true,
    review: y.review ? str(y.review) : null,
    body: m[2].trim() + '\n',
  };
}

/** A stable short fingerprint of an article's text, so a manual edit knows what it was based on. */
export function contentHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* ---------------------------------------------------------------------------------------------
 * Release awareness
 * ------------------------------------------------------------------------------------------- */

/** Compares "1.0" with "1.0.1" or "1.10". Returns <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export const isVersion = (v: string) => /^\d+(\.\d+){0,2}$/.test(v);

export type HelpVisibility = 'published' | 'upcoming' | 'draft' | 'needs-review';

/**
 * Whether the public may see an article. `publicVersion` is the App Store version riders can
 * download (or the version waiting for Apple's first approval, before launch).
 */
export function visibility(a: Pick<HelpMeta, 'release' | 'draft' | 'review'>, publicVersion: string | null): HelpVisibility {
  if (a.draft) return 'draft';
  if (a.review) return 'needs-review';
  if (a.release === 'web') return 'published';
  if (!publicVersion || !isVersion(a.release)) return 'upcoming';
  return compareVersions(a.release, publicVersion) <= 0 ? 'published' : 'upcoming';
}

/**
 * Keeps or drops the release blocks in an article body:
 *   :::release 1.1   shown once 1.1 is live
 *   :::until 1.1     shown until 1.1 is live
 * With publicVersion null (nothing live yet) every release block is hidden and every until block shown.
 */
export function filterRelease(md: string, publicVersion: string | null): string {
  const out: string[] = [];
  // Every open ::: block, release blocks and callouts alike, so a ":::" closes the right one.
  const stack: { gate: boolean; show: boolean }[] = [];
  const visible = () => stack.every((b) => b.show);
  for (const line of md.split('\n')) {
    const t = line.trim();
    const gate = /^:::(release|until)\s+(\S+)$/.exec(t);
    if (gate) {
      const live = publicVersion !== null && isVersion(gate[2]) && compareVersions(gate[2], publicVersion) <= 0;
      stack.push({ gate: true, show: gate[1] === 'release' ? live : !live });
      continue;
    }
    if (/^:::\w/.test(t)) {
      if (visible()) out.push(line);
      stack.push({ gate: false, show: true });
      continue;
    }
    if (t === ':::' && stack.length) {
      const closed = stack.pop()!;
      if (!closed.gate && visible()) out.push(line);
      continue;
    }
    if (visible()) out.push(line);
  }
  return out.join('\n');
}

/** Every release named in an article (front matter and blocks), for the checks. */
export function releasesNamed(a: HelpArticle): string[] {
  const out = new Set<string>();
  if (a.release !== 'web') out.add(a.release);
  for (const m of a.body.matchAll(/^:::(?:release|until)\s+(\S+)/gm)) out.add(m[1]);
  return [...out];
}

/* ---------------------------------------------------------------------------------------------
 * Markdown to HTML
 * ------------------------------------------------------------------------------------------- */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export type RenderResult = { html: string; headings: HelpHeading[]; links: string[]; images: string[] };

const CALLOUT_LABEL: Record<string, string> = { tip: 'Tip', note: 'Note', warning: 'Important' };

function safeUrl(url: string): string {
  const u = url.trim();
  if (/^(https?:|mailto:|\/|#)/i.test(u)) return u;
  return '#';
}

function inline(text: string, links: string[], images: string[]): string {
  // Code spans first, so nothing inside them is formatted.
  const codes: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
    images.push(src);
    return `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy">`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    links.push(href.replace(/&amp;/g, '&'));
    const url = safeUrl(href.replace(/&amp;/g, '&'));
    const external = /^https?:/i.test(url) && !/^https?:\/\/(www\.)?onmylead\.com/i.test(url);
    return `<a href="${escapeHtml(url)}"${external ? ' rel="noopener" target="_blank"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
}

type ListItem = { text: string[]; children: string[] };

/**
 * Renders the Markdown the articles use: ## to #### headings, paragraphs, - and 1. lists (one
 * level of nesting), > quotes, tables, ``` code, ---, images, links, bold, italic, code, and
 * :::tip / :::note / :::warning callouts. Raw HTML is escaped, never passed through.
 */
export function renderMarkdown(md: string): RenderResult {
  const links: string[] = [];
  const images: string[] = [];
  const headings: HelpHeading[] = [];
  const used = new Map<string, number>();
  const html = renderBlocks(md.replace(/\r\n/g, '\n').split('\n'), { links, images, headings, used });
  return { html, headings, links, images };
}

type Ctx = { links: string[]; images: string[]; headings: HelpHeading[]; used: Map<string, number> };

function renderBlocks(lines: string[], ctx: Ctx): string {
  const out: string[] = [];
  let i = 0;
  const isBlank = (l: string) => !l.trim();
  const isList = (l: string) => /^\s*([-*]|\d+\.)\s+/.test(l);
  const startsBlock = (l: string) =>
    /^#{2,4}\s/.test(l) || /^```/.test(l) || /^>\s?/.test(l) || /^:::/.test(l.trim()) || /^\|/.test(l) || /^---+\s*$/.test(l) || isList(l);

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const h = /^(#{2,4})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2], ctx.links, ctx.images);
      let id = slugify(h[2]) || 'section';
      const n = ctx.used.get(id) ?? 0;
      ctx.used.set(id, n + 1);
      if (n) id = `${id}-${n + 1}`;
      ctx.headings.push({ level, id, text: h[2].replace(/\*\*/g, '') });
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const callout = /^:::(tip|note|warning)\s*(.*)$/.exec(line.trim());
    if (callout) {
      const inner: string[] = [];
      let depth = 1;
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (/^:::\w/.test(t)) depth++;
        if (t === ':::' && --depth === 0) break;
        inner.push(lines[i++]);
      }
      i++;
      const label = callout[2] || CALLOUT_LABEL[callout[1]];
      out.push(
        `<aside class="callout callout-${callout[1]}"><p class="callout-label">${escapeHtml(label)}</p>${renderBlocks(inner, ctx)}</aside>`,
      );
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) inner.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderBlocks(inner, ctx)}</blockquote>`);
      continue;
    }
    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
        i++;
      }
      const hasHead = rows.length > 1 && rows[1].every((c) => /^:?-{2,}:?$/.test(c));
      const head = hasHead ? rows[0] : null;
      const body = hasHead ? rows.slice(2) : rows;
      const cell = (tag: string, c: string) => `<${tag}>${inline(c, ctx.links, ctx.images)}</${tag}>`;
      out.push(
        '<div class="table-wrap"><table>' +
          (head ? `<thead><tr>${head.map((c) => cell('th', c)).join('')}</tr></thead>` : '') +
          `<tbody>${body.map((r) => `<tr>${r.map((c) => cell('td', c)).join('')}</tr>`).join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (isList(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const baseIndent = line.length - line.trimStart().length;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) {
          // A blank line ends the list unless the next line continues it.
          const next = lines[i + 1];
          if (next !== undefined && (isList(next) || /^\s{2,}\S/.test(next))) {
            i++;
            continue;
          }
          break;
        }
        const indent = l.length - l.trimStart().length;
        const m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(l);
        if (m && indent <= baseIndent + 1) {
          if (/^\s*\d+\./.test(l) !== ordered) break;
          items.push({ text: [m[1]], children: [] });
        } else if (items.length && indent > baseIndent) {
          const last = items[items.length - 1];
          if (isList(l) || last.children.length) last.children.push(l.slice(Math.min(indent, baseIndent + 2)));
          else last.text.push(l.trim());
        } else if (items.length && !startsBlock(l)) {
          items[items.length - 1].text.push(l.trim());
        } else break;
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag}>${items
          .map((it) => `<li>${inline(it.text.join(' '), ctx.links, ctx.images)}${it.children.length ? renderBlocks(it.children, ctx) : ''}</li>`)
          .join('')}</${tag}>`,
      );
      continue;
    }
    // Paragraph (or a lone image, which becomes a figure).
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !(para.length && startsBlock(lines[i]))) para.push(lines[i++].trim());
    const text = para.join(' ');
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(text);
    if (img) {
      ctx.images.push(img[2]);
      out.push(
        `<figure class="shot"><img src="${escapeHtml(safeUrl(img[2]))}" alt="${escapeHtml(img[1])}" loading="lazy">${img[1] ? `<figcaption>${escapeHtml(img[1])}</figcaption>` : ''}</figure>`,
      );
    } else out.push(`<p>${inline(text, ctx.links, ctx.images)}</p>`);
  }
  return out.join('\n');
}

/** The words of an article without Markdown, for the search index and descriptions. */
export function plainText(md: string): string {
  return md
    .replace(/^:::.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]/g, ' ')
    .replace(/^\s*(\d+\.|-)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------------------------------------------------------------------------------------
 * Sources: which articles describe a changed file
 * ------------------------------------------------------------------------------------------- */

/** A source glob ("app/src/app/garage/**", "app/src/*.ts") as a RegExp over repo-relative paths. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matchesAny = (file: string, globs: string[]) => globs.some((g) => globToRegExp(g).test(file));

/* ---------------------------------------------------------------------------------------------
 * Search
 * ------------------------------------------------------------------------------------------- */

export type HelpSearchDoc = { slug: string; title: string; summary: string; category: string; keywords: string[]; headings: string[]; text: string };

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

/** Scores every document for a query; best first. Title and keyword hits count most. */
export function searchHelp(docs: HelpSearchDoc[], query: string, limit = 20): (HelpSearchDoc & { score: number })[] {
  const terms = words(query);
  if (!terms.length) return [];
  const scored = docs.map((d) => {
    const title = words(d.title).join(' ');
    const fields: [string, number][] = [
      [title, 10],
      [d.keywords.join(' ').toLowerCase(), 7],
      [words(d.headings.join(' ')).join(' '), 5],
      [words(d.summary).join(' '), 4],
      [words(d.text).join(' '), 1],
    ];
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      let hit = 0;
      for (const [field, weight] of fields) {
        if (field.includes(t)) hit += weight * (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(field) ? 1.5 : 1);
      }
      if (hit) matched++;
      score += hit;
    }
    if (title.includes(terms.join(' '))) score += 20;
    // Every word has to appear somewhere for a multi-word search to count.
    return { ...d, score: matched === terms.length ? score : 0 };
  });
  return scored.filter((d) => d.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** "2026-10-14" -> "October 14, 2026". */
export function formatHelpDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}
