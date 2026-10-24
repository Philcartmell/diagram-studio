// Builds assets/icons/icons.json: a curated Lucide subset as plain path data.
// Run with `npm run icons` (needs the lucide-static dev dependency).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../assets/icons');
const nodes = require('lucide-static/icon-nodes.json');
const pkg = require('lucide-static/package.json');

// Business-oriented subset. Aliases on the right map friendly names to Lucide names.
const WANTED = [
  'activity', 'alarm-clock', 'archive', 'arrow-right-left', 'award', 'badge-check', 'badge-percent',
  'banknote', 'bell', 'book-open', 'bot', 'box', 'boxes', 'brain', 'briefcase', 'building', 'building-2',
  'calculator', 'calendar', 'calendar-check', 'calendar-clock', 'chart-bar', 'chart-column', 'chart-line',
  'chart-pie', 'chart-no-axes-combined', 'check', 'circle-check', 'circle-dollar-sign', 'circle-help', 'clipboard-check',
  'clipboard-list', 'clock', 'cloud', 'code', 'cog', 'coins', 'compass', 'contact', 'cpu', 'credit-card',
  'database', 'file-text', 'files', 'filter', 'flag', 'folder', 'gauge', 'gavel', 'gift', 'git-branch',
  'globe', 'graduation-cap', 'hand-coins', 'handshake', 'hard-drive', 'headset', 'heart', 'heart-pulse',
  'home', 'house', 'id-card', 'inbox', 'key', 'landmark', 'laptop', 'layers', 'layout-dashboard', 'leaf',
  'library', 'lightbulb', 'link', 'list-checks', 'lock', 'mail', 'map', 'map-pin', 'megaphone',
  'message-square', 'messages-square', 'monitor', 'network', 'package', 'package-check', 'percent', 'phone',
  'piggy-bank', 'plane', 'plug', 'presentation', 'puzzle', 'receipt', 'recycle', 'refresh-cw', 'repeat',
  'rocket', 'route', 'scale', 'scan', 'search', 'send', 'server', 'settings', 'share-2', 'shield',
  'shield-check', 'ship', 'shopping-bag', 'shopping-cart', 'sliders-horizontal', 'smartphone', 'sparkles',
  'star', 'store', 'target', 'thumbs-up', 'ticket', 'timer', 'trending-down', 'trending-up', 'trophy',
  'truck', 'umbrella', 'unlock', 'upload', 'user', 'user-check', 'user-cog', 'user-plus', 'users',
  'users-round', 'wallet', 'warehouse', 'wifi', 'workflow', 'wrench', 'zap', 'factory', 'file-check',
  'file-spreadsheet', 'fingerprint', 'hourglass', 'circle-alert', 'triangle-alert', 'circle-x', 'ban',
  'eye', 'download', 'git-merge', 'kanban', 'milestone', 'signpost', 'goal', 'scroll-text', 'stamp',
  'tags', 'tag', 'pen-tool', 'school', 'hospital', 'car', 'train-front', 'fuel', 'sun', 'lock-keyhole',
];

const ALIASES = {
  chart: 'chart-column', 'bar-chart': 'chart-column', 'line-chart': 'chart-line', 'pie-chart': 'chart-pie',
  money: 'banknote', dollar: 'circle-dollar-sign', people: 'users', team: 'users', person: 'user',
  customer: 'user', customers: 'users', gear: 'settings', security: 'shield', risk: 'triangle-alert',
  warning: 'triangle-alert', data: 'database', idea: 'lightbulb', goal: 'goal', growth: 'trending-up',
  ai: 'sparkles', robot: 'bot', document: 'file-text', process: 'workflow', integration: 'plug',
  partner: 'handshake', bank: 'landmark', legal: 'gavel', compliance: 'shield-check', finance: 'coins',
  logistics: 'truck', supply: 'package', retail: 'store', email: 'mail', support: 'headset',
};

const f = (v) => {
  const r = Math.round(Number(v) * 1000) / 1000;
  return String(r);
};

function toPath([tag, a]) {
  switch (tag) {
    case 'path':
      return a.d;
    case 'circle': {
      const { cx, cy, r } = a;
      return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;
    }
    case 'ellipse': {
      const { cx, cy, rx, ry } = a;
      return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0`;
    }
    case 'rect': {
      const x = Number(a.x ?? 0);
      const y = Number(a.y ?? 0);
      const w = Number(a.width);
      const h = Number(a.height);
      const r = Math.min(Number(a.rx ?? a.ry ?? 0), w / 2, h / 2);
      if (!r) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
      return (
        `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}` +
        `a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}` +
        `v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}Z`
      );
    }
    case 'line':
      return `M${f(a.x1)} ${f(a.y1)}L${f(a.x2)} ${f(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const pts = String(a.points).trim().split(/[\s,]+/).map(Number);
      let d = '';
      for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${f(pts[i])} ${f(pts[i + 1])}`;
      return tag === 'polygon' ? d + 'Z' : d;
    }
    default:
      throw new Error(`Unsupported icon element <${tag}>`);
  }
}

const icons = {};
const missing = [];
for (const name of [...new Set(WANTED)].sort()) {
  const node = nodes[name];
  if (!node) {
    missing.push(name);
    continue;
  }
  icons[name] = node.map(toPath);
}
const aliases = {};
for (const [k, v] of Object.entries(ALIASES)) if (icons[v] && !icons[k]) aliases[k] = v;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, 'icons.json'),
  JSON.stringify({ source: `lucide-static@${pkg.version}`, license: 'ISC (portions MIT, Feather)', viewBox: 24, icons, aliases }, null, 0) + '\n',
);
fs.copyFileSync(require.resolve('lucide-static/LICENSE'), path.join(out, 'LICENSE-lucide.txt'));
console.log(`Wrote ${Object.keys(icons).length} icons, ${Object.keys(aliases).length} aliases.`);
if (missing.length) console.log(`Not in this Lucide version: ${missing.join(', ')}`);
