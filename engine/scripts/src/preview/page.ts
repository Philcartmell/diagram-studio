/** The preview board page: one self-contained HTML document, no external requests. */

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/**
 * On a wide screen the selected render fills the page and every render sits in a
 * thumbnail strip along the bottom, newest on the left. A new render takes over the
 * main view; clicking a thumbnail (or the arrow keys) looks back until the next
 * render. On a phone-sized screen the strip gives way to a vertical list of every
 * render, newest at the top.
 */
export function boardHtml(name: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(name)} · Diagram Studio</title>
<style>
:root {
  --bg: #f4f5f7; --panel: #ffffff; --ink: #1c2330; --muted: #5f6b7a; --line: #dde1e7;
  --accent: #1f4e8c; --warn-bg: #fff4e5; --warn-ink: #8a4b00; --ok: #2e7d4f;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #14171c; --panel: #1d2128; --ink: #e6e9ee; --muted: #9aa4b2; --line: #2c323b;
    --accent: #7fb0ff; --warn-bg: #3a2a12; --warn-ink: #ffc777; --ok: #6fcf97; }
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
header { display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid var(--line); background: var(--panel); }
header h1 { font-size: 15px; font-weight: 600; margin: 0; }
header .dir { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.live.on i { background: var(--ok); }
button.toggle { font: inherit; font-size: 12px; border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.stage { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 16px 20px; min-height: 0; }
.stage.with-brief { grid-template-columns: minmax(0, 1fr) 320px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.card .head { display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.badge { flex: none; display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 6px; background: var(--accent); color: var(--panel); font-weight: 700; font-size: 12px; }
.card .title { font-weight: 600; flex: 1; min-width: 0; }
.card .folder { color: var(--muted); font-size: 12px; font-weight: 400; display: block; }
.when { color: var(--muted); font-size: 12px; white-space: nowrap; }
.card .links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 12px; font-size: 12px; }
.card .links a { color: var(--accent); text-decoration: none; white-space: nowrap; }
.card .view { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: #fff; padding: 8px; }
.card .view img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
.card .foot { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 8px 14px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line); }
.card .foot a { color: var(--accent); text-decoration: none; }
.stale { background: var(--warn-bg); color: var(--warn-ink); font-size: 12px; padding: 6px 14px; }
.empty { display: grid; place-items: center; text-align: center; color: var(--muted); padding: 40px 20px; border: 1px dashed var(--line); border-radius: 10px; }
.list { display: none; }
aside { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; overflow: auto; min-height: 0; }
aside h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 8px; }
aside .md h3 { font-size: 14px; margin: 14px 0 4px; }
aside .md p, aside .md li { margin: 4px 0; }
aside .md ul { padding-left: 18px; margin: 4px 0; }
nav.strip { display: flex; gap: 12px; overflow-x: auto; padding: 12px 20px 14px; border-top: 1px solid var(--line); background: var(--panel); }
nav.strip:empty { display: none; }
.thumb { flex: none; width: 200px; font: inherit; color: inherit; text-align: left; background: var(--bg); border: 2px solid var(--line); border-radius: 8px; padding: 0; cursor: pointer; overflow: hidden; }
.thumb:hover { border-color: var(--muted); }
.thumb.selected { border-color: var(--accent); }
.thumb:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.thumb .frame { height: 112px; display: flex; align-items: center; justify-content: center; background: #fff; }
.thumb .frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
.thumb .cap { display: flex; align-items: center; gap: 6px; padding: 6px 8px; font-size: 12px; }
.thumb .cap .badge { min-width: 18px; height: 18px; font-size: 11px; padding: 0 4px; }
.thumb .cap .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.thumb.stale .frame { box-shadow: inset 0 -4px 0 var(--warn-ink); }
/* Phone-sized: no detail view or strip, just every render stacked, newest first. */
@media (max-width: 700px) {
  html, body { height: auto; }
  body { display: block; }
  header { position: sticky; top: 0; z-index: 2; padding: 10px 14px; }
  header .dir { display: none; }
  .stage, .stage.with-brief { display: flex; flex-direction: column; padding: 12px; }
  #detail, nav.strip { display: none; }
  .list { display: flex; flex-direction: column; gap: 12px; }
  .list .view { padding: 4px; }
  .list .view img { width: 100%; height: auto; max-height: none; }
  aside { overflow: visible; }
}
</style>
</head>
<body>
<header>
  <h1>${escape(name)}</h1>
  <span class="dir" id="dir"></span>
  <button class="toggle" id="toggle-brief" hidden>Hide brief</button>
  <span class="live" id="live"><i></i><span>connecting</span></span>
</header>
<div class="stage" id="stage">
  <main class="card" id="detail"></main>
  <div class="list" id="list"></div>
  <aside id="brief" hidden><h2>Brief</h2><div class="md" id="brief-body"></div></aside>
</div>
<nav class="strip" id="strip" aria-label="Renders, newest first"></nav>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const phone = window.matchMedia('(max-width: 700px)');
let state = { cards: [] };
let selected = null;
let newestSeen = 0;
let briefHidden = false;
try { briefHidden = localStorage.getItem('ds-brief-hidden') === '1'; } catch {}

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  return new Date(ms).toLocaleTimeString();
}

function inline(s) {
  return esc(s).replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>').replace(/\`(.+?)\`/g, '<code>$1</code>');
}

function markdown(src) {
  const out = [];
  let list = false;
  for (const raw of src.split(/\\r?\\n/)) {
    const line = raw.trimEnd();
    const item = /^\\s*[-*] (.*)/.exec(line);
    if (item) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(item[1]) + '</li>'); continue; }
    if (list) { out.push('</ul>'); list = false; }
    const h = /^#{1,6} (.*)/.exec(line);
    if (h) out.push('<h3>' + inline(h[1]) + '</h3>');
    else if (line) out.push('<p>' + inline(line) + '</p>');
  }
  if (list) out.push('</ul>');
  return out.join('');
}

function leafOf(c) { return c.folder.split('/').pop() || ''; }

/** The working design gets a star, concepts their letter (a-layers is A). */
function badge(c) {
  const letter = /^([a-z])-/i.exec(leafOf(c));
  return c.featured ? '<span class="badge" title="Working design">&#9733;</span>' : letter ? '<span class="badge">' + esc(letter[1].toUpperCase()) + '</span>' : '';
}

/** One render in full: heading, failed-check warning, the diagram, downloads. */
function cardBody(c) {
  const meta = [c.type, c.theme].filter(Boolean).map(esc).join(' · ');
  const files = c.files.map((f) => '<a href="' + f.url + '" download>' + esc(f.name.split('.').pop().toUpperCase()) + '</a>').join('');
  const links = '<a href="' + c.svg + '" target="_blank" rel="noopener">Open full size</a>' + files;
  return '<div class="head">' + badge(c) + '<div class="title">' + esc(c.title || leafOf(c) || 'Diagram') +
    '<span class="folder">' + esc(c.folder || '.') + (meta ? ' · ' + meta : '') + '</span></div>' +
    '<span class="links">' + links + '</span>' +
    '<span class="when" data-t="' + c.touched + '">' + ago(c.touched) + '</span></div>' +
    (c.stale ? '<div class="stale">The last render failed its checks. This is the previous good render.</div>' : '') +
    '<a class="view" href="' + c.svg + '" target="_blank" rel="noopener"><img src="' + c.svg + '" alt="' + esc(c.title || leafOf(c)) + '"></a>' +
    '<div class="foot">' + links + '</div>';
}

const EMPTY = '<div class="empty">Waiting for the first render.<br>Diagrams rendered into this folder appear here automatically.</div>';

function thumb(c) {
  const on = c.folder === selected;
  return '<button class="thumb' + (on ? ' selected' : '') + (c.stale ? ' stale' : '') + '" data-folder="' + esc(c.folder) + '"' +
    (on ? ' aria-current="true"' : '') + ' title="' + esc((c.title || leafOf(c)) + ' (' + (c.folder || '.') + ')') + '">' +
    '<div class="frame"><img src="' + c.svg + '" alt="" loading="lazy"></div>' +
    '<div class="cap">' + badge(c) + '<span class="t">' + esc(c.title || leafOf(c) || 'Diagram') + '</span>' +
    '<span class="when" data-t="' + c.touched + '">' + ago(c.touched) + '</span></div></button>';
}

function draw() {
  $('dir').textContent = state.dir || '';
  const current = state.cards.find((c) => c.folder === selected);
  if (phone.matches) {
    $('list').innerHTML = state.cards.length ? state.cards.map((c) => '<section class="card">' + cardBody(c) + '</section>').join('') : EMPTY;
  } else {
    $('detail').innerHTML = current ? cardBody(current) : EMPTY;
    $('strip').innerHTML = state.cards.map(thumb).join('');
    const on = $('strip').querySelector('.selected');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const hasBrief = !!(state.brief && state.brief.trim());
  $('toggle-brief').hidden = !hasBrief;
  $('toggle-brief').textContent = briefHidden ? 'Show brief' : 'Hide brief';
  const show = hasBrief && !briefHidden;
  $('brief').hidden = !show;
  $('stage').classList.toggle('with-brief', show);
  if (hasBrief) $('brief-body').innerHTML = markdown(state.brief);
}

/** Follow a new render: anything newer than this page has seen takes over the main view (or the top of the list). */
function apply(next) {
  state = next;
  const newest = state.cards[0];
  let arrived = false;
  if (newest && newest.touched > newestSeen) {
    arrived = newestSeen > 0;
    selected = newest.folder;
    newestSeen = newest.touched;
  }
  if (!state.cards.some((c) => c.folder === selected)) selected = newest ? newest.folder : null;
  draw();
  if (arrived && phone.matches) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function select(folder) {
  if (!folder || folder === selected) return;
  selected = folder;
  draw();
}

async function load() {
  try { apply(await (await fetch('/api/state', { cache: 'no-store' })).json()); } catch {}
}

$('strip').onclick = (e) => {
  const t = e.target.closest('.thumb');
  if (t) select(t.dataset.folder);
};
document.addEventListener('keydown', (e) => {
  if (phone.matches || e.altKey || e.ctrlKey || e.metaKey || /input|textarea/i.test(e.target.tagName)) return;
  const i = state.cards.findIndex((c) => c.folder === selected);
  const go = (j) => { const c = state.cards[Math.max(0, Math.min(state.cards.length - 1, j))]; if (c) { e.preventDefault(); select(c.folder); } };
  if (e.key === 'ArrowLeft') go(i - 1);
  else if (e.key === 'ArrowRight') go(i + 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(state.cards.length - 1);
});
phone.addEventListener('change', draw);
$('toggle-brief').onclick = () => {
  briefHidden = !briefHidden;
  try { localStorage.setItem('ds-brief-hidden', briefHidden ? '1' : '0'); } catch {}
  draw();
};
setInterval(() => document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = ago(Number(n.dataset.t)); }), 10000);

const es = new EventSource('/events');
const live = $('live');
es.onopen = () => { live.classList.add('on'); live.lastChild.textContent = 'live'; load(); };
es.onerror = () => { live.classList.remove('on'); live.lastChild.textContent = 'reconnecting'; };
es.onmessage = load;
load();
</script>
</body>
</html>
`;
}
