/** The preview board page: one self-contained HTML document, no external requests. */

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

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
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
header h1 { font-size: 15px; font-weight: 600; margin: 0; }
header .dir { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.live.on i { background: var(--ok); }
button.toggle { font: inherit; font-size: 12px; border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; padding: 20px; }
.layout.with-brief { grid-template-columns: minmax(0, 1fr) 320px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; align-content: start; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.card.featured { grid-column: 1 / -1; }
.card .head { display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.badge { flex: none; display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 6px; background: var(--accent); color: var(--panel); font-weight: 700; font-size: 13px; }
.card .title { font-weight: 600; flex: 1; min-width: 0; }
.card .folder { color: var(--muted); font-size: 12px; font-weight: 400; display: block; }
.card .when { color: var(--muted); font-size: 12px; white-space: nowrap; }
.card a.view { display: block; background: #fff; }
.card img { display: block; width: 100%; height: auto; }
.card.featured img { width: auto; max-width: 100%; max-height: 78vh; margin: 0 auto; }
.card .foot { display: flex; flex-wrap: wrap; gap: 6px 12px; padding: 8px 14px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line); }
.card .foot a { color: var(--accent); text-decoration: none; }
.stale { background: var(--warn-bg); color: var(--warn-ink); font-size: 12px; padding: 6px 14px; }
.empty { grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 80px 20px; border: 1px dashed var(--line); border-radius: 10px; }
aside { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; align-self: start; position: sticky; top: 72px; max-height: calc(100vh - 92px); overflow: auto; }
aside h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 8px; }
aside .md h3 { font-size: 14px; margin: 14px 0 4px; }
aside .md p, aside .md li { margin: 4px 0; }
aside .md ul { padding-left: 18px; margin: 4px 0; }
@media (max-width: 900px) { .layout.with-brief { grid-template-columns: minmax(0, 1fr); } aside { position: static; max-height: none; } .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
</head>
<body>
<header>
  <h1>${escape(name)}</h1>
  <span class="dir" id="dir"></span>
  <button class="toggle" id="toggle-brief" hidden>Hide brief</button>
  <span class="live" id="live"><i></i><span>connecting</span></span>
</header>
<div class="layout" id="layout">
  <main class="grid" id="grid"></main>
  <aside id="brief" hidden><h2>Brief</h2><div class="md" id="brief-body"></div></aside>
</div>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let state = { cards: [] };
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

function card(c) {
  const leaf = c.folder.split('/').pop() || '';
  const letter = /^([a-z])-/i.exec(leaf);
  const badge = c.featured ? '<span class="badge">&#9733;</span>' : letter ? '<span class="badge">' + esc(letter[1].toUpperCase()) + '</span>' : '';
  const meta = [c.type, c.theme].filter(Boolean).map(esc).join(' · ');
  const files = c.files.map((f) => '<a href="' + f.url + '" download>' + esc(f.name.split('.').pop().toUpperCase()) + '</a>').join('');
  return '<section class="card' + (c.featured ? ' featured' : '') + '">' +
    '<div class="head">' + badge + '<div class="title">' + esc(c.title || leaf || 'Diagram') +
    '<span class="folder">' + esc(c.folder || '.') + (meta ? ' · ' + meta : '') + '</span></div>' +
    '<span class="when" data-t="' + c.updated + '">' + ago(c.updated) + '</span></div>' +
    (c.stale ? '<div class="stale">The last render failed its checks. This is the previous good render.</div>' : '') +
    '<a class="view" href="' + c.svg + '" target="_blank" rel="noopener"><img src="' + c.svg + '" alt="' + esc(c.title || leaf) + '"></a>' +
    '<div class="foot"><span>Open full size</span>' + files + '</div></section>';
}

function draw() {
  $('dir').textContent = state.dir || '';
  $('grid').innerHTML = state.cards.length
    ? state.cards.map(card).join('')
    : '<div class="empty">Waiting for the first render.<br>Diagrams rendered into this folder appear here automatically.</div>';
  const hasBrief = !!(state.brief && state.brief.trim());
  $('toggle-brief').hidden = !hasBrief;
  $('toggle-brief').textContent = briefHidden ? 'Show brief' : 'Hide brief';
  const show = hasBrief && !briefHidden;
  $('brief').hidden = !show;
  $('layout').classList.toggle('with-brief', show);
  if (hasBrief) $('brief-body').innerHTML = markdown(state.brief);
}

async function load() {
  try { state = await (await fetch('/api/state', { cache: 'no-store' })).json(); draw(); } catch {}
}

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
