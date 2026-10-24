// The skill docs must stay in sync with the renderer: every complete JSON
// example in SKILL.md and references/ must validate and render clean.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, load } from './helpers.mjs';

const { prepare, isFailure } = await load('pipeline.js');
const { validateSpec } = await load('validate/spec.js');

const docs = [path.join(ROOT, 'SKILL.md'), ...fs.readdirSync(path.join(ROOT, 'references')).map((f) => path.join(ROOT, 'references', f))];

describe('docs', () => {
  it('SKILL.md stays under 300 lines and has skill frontmatter', () => {
    const text = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
    expect(text.split('\n').length).toBeLessThan(300);
    expect(text).toMatch(/^---\nname: diagram-studio\ndescription: .+\n---\n/);
  });

  it('there is a reference guide for every type plus the two shared guides', () => {
    const names = fs.readdirSync(path.join(ROOT, 'references')).sort();
    expect(names).toEqual([
      'azure-architecture.md', 'azure-style.md', 'databricks-architecture.md', 'databricks-style.md', 'layered-architecture.md', 'matrix-2x2.md', 'operating-model.md', 'roadmap.md',
      'spec-format.md', 'swimlane.md', 'value-chain.md', 'writing-for-leaders.md',
    ]);
  });

  for (const file of docs) {
    const blocks = [...fs.readFileSync(file, 'utf8').matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
    blocks.forEach((src, i) => {
      let spec;
      try {
        spec = JSON.parse(src);
      } catch {
        return; // fragments (e.g. a single node) are illustrative
      }
      if (!spec.version || !spec.type || !spec.body || !Object.keys(spec.body).length) return;
      it(`${path.basename(file)} example ${i + 1} renders clean`, async () => {
        expect(validateSpec(spec).errors).toEqual([]);
        const p = await prepare(spec);
        expect(isFailure(p)).toBe(false);
        expect(p.errors).toEqual([]);
        expect(p.warnings).toEqual([]);
      });
    });
  }
});
