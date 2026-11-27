// The Help Center pages' only script: instant search suggestions, the search page, and fresh
// dashboard edits on article pages. Every page works without it.
import { filterRelease, formatHelpDate, renderMarkdown, searchHelp } from './help-engine.js';

let index = null;
const loadIndex = () => (index ??= fetch('/help/search-index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Suggestions under every search box. */
for (const form of document.querySelectorAll('form.search')) {
  const input = form.querySelector('input');
  const box = form.querySelector('.suggest');
  if (!input || !box || document.getElementById('results')) continue;
  let active = -1;
  const close = () => {
    box.hidden = true;
    active = -1;
    input.removeAttribute('aria-activedescendant');
  };
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'suggest-list');
  input.addEventListener('input', async () => {
    const q = input.value.trim();
    if (q.length < 2) return close();
    const hits = searchHelp(await loadIndex(), q, 6);
    if (input.value.trim() !== q) return;
    if (!hits.length) {
      box.innerHTML = `<p class="none">No guides match “${esc(q)}”. Press Search to look again, or <a href="/contact">contact us</a>.</p>`;
    } else {
      box.innerHTML = `<ul id="suggest-list" role="listbox">${hits
        .map((h, i) => `<li role="option" id="s${i}"><a href="/help/${h.slug}"><b>${esc(h.title)}</b><span>${esc(h.category)}</span></a></li>`)
        .join('')}</ul>`;
    }
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  });
  input.addEventListener('keydown', (e) => {
    const items = [...box.querySelectorAll('li')];
    if (box.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.classList.toggle('on', i === active));
      input.setAttribute('aria-activedescendant', items[active].id);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      items[active].querySelector('a').click();
    } else if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) close();
  });
}

/* The search page. */
const results = document.getElementById('results');
if (results) {
  const q = new URLSearchParams(location.search).get('q')?.trim() ?? '';
  const input = document.getElementById('q');
  if (input) input.value = q;
  if (q) {
    const hits = searchHelp(await loadIndex(), q, 30);
    document.title = `${q} | Search | OnMyLead Help`;
    results.innerHTML = hits.length
      ? `<p class="count">${hits.length} ${hits.length === 1 ? 'Guide' : 'Guides'} for “${esc(q)}”</p><ul class="list">${hits
          .map((h) => `<li><a href="/help/${h.slug}"><b>${esc(h.title)}</b><span>${esc(h.summary)}</span><small>${esc(h.category)}</small></a></li>`)
          .join('')}</ul>`
      : `<p class="empty">Nothing matches “${esc(q)}”. Try fewer or different words, browse the <a href="/help">topics</a>, or <a href="/contact">contact us</a>.</p>`;
  }
}

/* Article pages: show a dashboard edit made after this page was built (or its removal). */
const article = document.querySelector('article.article');
const live = document.querySelector('meta[name="oml-live"]');
if (article && live) {
  try {
    const url = live.getAttribute('content');
    const key = live.dataset.key;
    const res = await fetch(`${url}/rest/v1/rpc/help_live_edits`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: article.dataset.slug }),
    });
    if (res.ok) {
      const edit = (await res.json())[0] ?? null;
      const baked = article.dataset.edit;
      const auto = document.getElementById('auto-version');
      if (edit && edit.id !== baked) {
        show(edit.title, edit.summary, edit.body, String(edit.updated_at).slice(0, 10));
      } else if (!edit && baked && auto) {
        show(auto.dataset.title, auto.dataset.summary, auto.textContent.replace(/<\\\//g, '</'), auto.dataset.updated);
      }
    }
  } catch {
    // The built page stays as it is.
  }
}

function show(title, summary, body, updated) {
  const prose = article.querySelector('.prose');
  if (!prose) return;
  prose.innerHTML = renderMarkdown(filterRelease(body, article.dataset.version || null)).html;
  if (title) article.querySelector('h1').textContent = title;
  if (summary) article.querySelector('.lede').textContent = summary;
  const time = article.querySelector('.updated time');
  if (time && updated) {
    time.dateTime = updated;
    time.textContent = formatHelpDate(updated);
  }
  article.querySelector('.toc')?.remove();
}
