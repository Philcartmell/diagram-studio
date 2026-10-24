// Validation: schema, cross-references and altitude limits, with plain-sentence errors.
import { describe, expect, it } from 'vitest';
import { examples, load } from './helpers.mjs';

const { validateSpec } = await load('validate/spec.js');
const { validateThemeFile } = await load('validate/theme.js');
const { listThemes } = await load('theme/load.js');

const swimlane = () => structuredClone(examples().find((e) => e.name === '01-invoice-approval').spec);
const om = () => structuredClone(examples().find((e) => e.name === '01-finance-hub').spec);
const messages = (r) => r.errors.map((e) => e.message).join('\n');

describe('validation', () => {
  it('accepts every bundled example', () => {
    for (const ex of examples()) {
      const r = validateSpec(ex.spec);
      expect(r.errors, `${ex.type}/${ex.name}`).toEqual([]);
      expect(r.warnings, `${ex.type}/${ex.name}`).toEqual([]);
    }
  });

  it('every built-in theme passes the theme validator', () => {
    for (const t of listThemes().filter((x) => x.builtIn)) expect(validateThemeFile(t.file).errors, t.id).toEqual([]);
  });

  it('reports a bad lane reference as a plain sentence listing the lanes', () => {
    const s = swimlane();
    s.body.steps[3].lane = 'finance';
    expect(messages(validateSpec(s))).toContain('body.steps[3].lane: "finance" is not a lane. Lanes are: supplier, ap, budget, cfo.');
  });

  it('suggests the intended field for a typo and lists allowed fields', () => {
    const s = swimlane();
    s.body.steps[0].lable = s.body.steps[0].label;
    delete s.body.steps[0].label;
    const m = messages(validateSpec(s));
    expect(m).toContain('body.steps[0]: unknown field "lable". Did you mean "label"?');
    expect(m).toContain('body.steps[0]: missing required field "label".');
  });

  it('explains enum mistakes with the allowed values', () => {
    const s = swimlane();
    s.body.steps[3].shape = 'diamond';
    expect(messages(validateSpec(s))).toMatch(/body\.steps\[3\]\.shape: "diamond" is not allowed\..*Use one of: task, decision/);
  });

  it('rejects unknown diagram types and suggests the closest one', () => {
    const s = swimlane();
    s.type = 'swimlanes';
    expect(messages(validateSpec(s))).toMatch(/type: "swimlanes" is not allowed\. Did you mean "swimlane"\?/);
  });

  it('checks ids are kebab-case and unique', () => {
    const s = om();
    s.body.layers[0].nodes[0].id = 'FinanceBP';
    expect(messages(validateSpec(s))).toContain('must be kebab-case');
    const t = om();
    t.body.layers[1].nodes[1].id = 'fpa';
    expect(messages(validateSpec(t))).toMatch(/id "fpa" is already used/);
  });

  it('resolves edge endpoints and callout anchors, with did-you-mean help', () => {
    const s = swimlane();
    s.body.edges[0].to = 'mach';
    s.callout = { text: 'x', anchor: 'pai' };
    const m = messages(validateSpec(s));
    expect(m).toContain('body.edges[0].to: "mach" is not a step. Did you mean "match"?');
    expect(m).toContain('callout.anchor: "pai" does not match any id in the diagram. Did you mean "pay"?');
  });

  it('enforces the executive node limit and suggests grouping or a higher altitude', () => {
    const s = om();
    s.body.layers[1].nodes.push(...['a', 'b', 'c'].map((x) => ({ id: `extra-${x}`, label: `Extra ${x}` })));
    const m = messages(validateSpec(s));
    expect(m).toMatch(/has 10 nodes; the limit is 9/);
    expect(m).toMatch(/group related nodes/);
    expect(m).toMatch(/"altitude": "management"/);
  });

  it('enforces description length per altitude', () => {
    const s = om();
    s.body.layers[0].nodes[0].description = 'A very long description that goes on and on about embedded finance business partners';
    expect(messages(validateSpec(s))).toMatch(/description: is \d+ characters; executive diagrams allow 70/);
  });

  it('requires a legend on detailed diagrams where colour carries meaning', () => {
    const s = structuredClone(examples().find((e) => e.name === '03-it-services').spec);
    s.legend = 'none';
    expect(messages(validateSpec(s))).toMatch(/legend: detailed diagrams need a legend/);
  });

  it('warns when the title reads like a topic', () => {
    const s = om();
    s.title = 'Finance operating model';
    expect(validateSpec(s).warnings.map((w) => w.message).join()).toMatch(/reads like a topic/);
  });

  it('requires dates for a time-scaled roadmap and matrix items to be placed', () => {
    const r = structuredClone(examples().find((e) => e.name === '01-finance-transformation').spec);
    r.body.scale = 'time';
    expect(messages(validateSpec(r))).toMatch(/needs "start" and "end" dates when "scale" is "time"/);
    const m = structuredClone(examples().find((e) => e.name === '01-initiative-priorities').spec);
    delete m.body.items[0].x;
    expect(messages(validateSpec(m))).toMatch(/has only one of "x" and "y"/);
  });

  it('rejects unknown icons with a suggestion and bad theme ids', () => {
    const s = om();
    s.body.layers[0].nodes[0].icon = 'usres';
    s.theme = 'boardrom';
    const m = messages(validateSpec(s));
    expect(m).toMatch(/"usres" is not in the icon set\. Did you mean "users"\?/);
    expect(m).toMatch(/theme: "boardrom" is not installed\. Did you mean "boardroom"\?/);
  });

  it('validates theme overrides against the theme schema and contrast rules', () => {
    const s = om();
    s.themeOverrides = { color: { accent: '#FFEE00' } };
    expect(messages(validateSpec(s))).toMatch(/themeOverrides\.color\.accentInk: contrast with accent is [\d.]+:1/);
    const ok = om();
    ok.themeOverrides = { color: { accent: '#D4001A' } };
    expect(validateSpec(ok).errors).toEqual([]);
  });
});
