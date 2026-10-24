// Renders every example in every theme and reports QA results.
import fs from 'node:fs';
import path from 'node:path';
import { prepare, isFailure } from '../dist/pipeline.js';
import { renderSvg } from '../dist/render/svg.js';
import { renderPng } from '../dist/export/png.js';

const root = path.resolve('..');
const themes = (process.argv[2] ?? 'boardroom,blueprint,sketch,bold,minimal,print,azure').split(',');
const only = process.argv[3];
const outDir = path.resolve('out/matrix');
fs.mkdirSync(outDir, { recursive: true });
let bad = 0;
for (const type of fs.readdirSync(path.join(root, 'examples')).sort()) {
  if (only && !type.startsWith(only)) continue;
  for (const f of fs.readdirSync(path.join(root, 'examples', type)).filter((x) => x.endsWith('.json')).sort()) {
    const spec = JSON.parse(fs.readFileSync(path.join(root, 'examples', type, f), 'utf8'));
    for (const theme of themes) {
      const p = await prepare(spec, { theme });
      const tag = `${type}/${f.replace('.json', '')} @ ${theme}`;
      if (isFailure(p)) { bad++; console.log(`FAIL-VALIDATE ${tag}: ${p.validationErrors.map((e) => e.message).join(' | ')}`); continue; }
      const issues = [...p.errors.map((e) => `E ${e.check}: ${e.message}`), ...p.warnings.map((w) => `W ${w.check}: ${w.message}`)];
      if (issues.length) { bad++; console.log(`${tag}\n   ${issues.join('\n   ')}`); }
      if (process.env.PNG) fs.writeFileSync(path.join(outDir, `${type}-${f.replace('.json', '')}-${theme}.png`), await renderPng(p.scene, p.theme, p.fonts, { scale: 1 }));
    }
  }
}
console.log(bad ? `${bad} combination(s) with issues` : 'ALL CLEAN');
