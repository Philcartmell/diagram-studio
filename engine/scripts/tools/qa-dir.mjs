// QA every spec in a folder across themes: node tools/qa-dir.mjs <dir> [themes] [--png]
import fs from 'node:fs';
import path from 'node:path';
import { isFailure, prepare } from '../dist/pipeline.js';
import { renderPng } from '../dist/export/png.js';

const dir = path.resolve(process.argv[2]);
const themes = (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'boardroom,sketch').split(',');
const png = process.argv.includes('--png');
const out = path.resolve('out/qa');
fs.mkdirSync(out, { recursive: true });
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const t of themes) {
    const p = await prepare(spec, { theme: t });
    if (isFailure(p)) {
      bad++;
      console.log(`${f} @ ${t} VALIDATION:`, p.validationErrors.map((e) => e.message).join(' | '));
      continue;
    }
    const issues = [...p.errors.map((e) => `E ${e.check}: ${e.message}`), ...p.warnings.map((e) => `W ${e.check}: ${e.message}`)];
    if (issues.length) bad++;
    console.log(`${f} @ ${t} ${p.scene.width}x${p.scene.height}${issues.length ? '\n   ' + issues.slice(0, 6).join('\n   ') : ' clean'}`);
    if (png) fs.writeFileSync(path.join(out, `${f.replace('.json', '')}-${t}.png`), await renderPng(p.scene, p.theme, p.fonts, { scale: 1 }));
  }
}
console.log(bad ? `${bad} with issues` : 'ALL CLEAN');
