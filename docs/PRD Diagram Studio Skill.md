# PRD: Diagram Studio Skill

Oct 24, 2026 · @phil cartmell

## Overview

Diagram Studio is a Claude skill that turns a plain-language request ("show our target operating model") into a boardroom-quality diagram, delivered as SVG with PNG, PDF, PPTX and draw.io exports. Claude decides the content; a deterministic Node renderer guarantees the layout, spacing and styling.

**Problem.** When an LLM hand-writes SVG or Mermaid, results vary run to run: text overflows boxes, connectors cross labels, and the style reads as engineering output rather than leadership material. Business users then rebuild the picture by hand in PowerPoint.

**Goals**

- Produce consulting-grade business diagrams (operating models, value chains, swimlanes, roadmaps, matrices) that need no manual clean-up.
- Make output identical for identical input, so revisions only change what was asked.
- Separate content (a JSON spec) from presentation (a theme), so any diagram can be re-themed in one step.
- Support two audiences through one setting: executive (few elements, a headline) and detailed (full complexity).
- Export to formats business users edit: native PowerPoint shapes and draw.io, not only images.
- Let users add their own themes and brand kits without touching renderer code.

**Non-goals for v1**

- Free-form drawing or a visual editor.
- Data charts (bar, line, pie). These belong to a charting tool; the skill may embed simple numbers as labels only.
- Detailed cloud infrastructure diagrams with vendor icon sets.
- Animation or interactivity beyond a static SVG.

## Users and altitude

The primary user is a business professional (strategy, transformation, operations, consulting) who needs a diagram for a leadership pack. The secondary user is a technical lead explaining a system to non-technical stakeholders.

| User | Typical request | What good looks like |
| --- | --- | --- |
| Transformation lead | "Target operating model for finance" | One slide, layered, clear ownership |
| Strategy consultant | "Value chain with our three focus areas highlighted" | Clean chevrons, one accent, action title |
| Operations manager | "Swimlane of invoice approval across four teams" | Readable lanes, handoffs obvious |
| Technical lead | "Layered architecture for the exec review" | Few boxes, plain words, no protocol detail |

**Altitude** is a first-class spec field that changes how Claude writes the spec and how the renderer enforces it.

| Setting | Max nodes | Text per node | Required extras | Use for |
| --- | --- | --- | --- | --- |
| `executive` | 9 | Name + optional 1 line | Action title, optional "so what" callout | Board, ExCo, steering committees |
| `management` | 20 | Name + up to 3 lines | Action title | Department leadership, programme boards |
| `detailed` | 60 | Name + up to 5 lines | Legend when colour carries meaning | Working teams, design docs |

The renderer validates these limits. When a spec exceeds them, it fails with a message telling Claude to summarise (group nodes, move detail to notes) or to raise the altitude. Claude defaults to `executive` unless the user asks for detail.

**Action titles.** Every diagram has a `title` that states the finding ("Three platforms carry 80% of customer journeys"), not the topic ("Platform overview"). SKILL.md instructs Claude to write titles this way.

## Architecture

The skill is a seven-stage pipeline: Claude writes a spec, and a Node CLI validates, lays out, themes, renders, checks and exports it. Claude never writes SVG directly.

&#91;embedded content: render pipeline · 7 stages, 1 fix loop\]

Only the first stage is Claude's work. A QA failure loops back to the spec, never to the SVG.

1. **Spec.** Claude writes `diagram.json` following the schema in the next section.
2. **Validate.** The CLI checks the spec against a JSON Schema (Ajv) and the altitude limits. Errors are returned as plain sentences Claude can act on.
3. **Layout.** Each diagram type has a layout module that converts the spec into positioned boxes, connectors and labels (a "scene graph"). Template types use fixed geometry; flow types use ELK.js for routing.
4. **Theme.** Theme tokens resolve to concrete colours, fonts, strokes and radii on the scene graph.
5. **Render.** The scene graph is serialised to SVG with embedded fonts.
6. **QA.** Automated checks run on the scene graph and on a rasterised PNG; Claude then views the PNG (see Rendering and QA).
7. **Export.** The same scene graph feeds every exporter, so all formats match.

The scene graph is the core abstraction. Every exporter consumes it, which is what makes PPTX and draw.io output possible without re-implementing layout.

**Tech stack**

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Node 20+, TypeScript | Browser-grade SVG and text tooling; installs with npm in Claude's workspace |
| Schema validation | Ajv + JSON Schema 2020-12 | Precise, machine-readable errors |
| Auto layout | elkjs (layered algorithm) | Best orthogonal routing and port control in JS; handles swimlane partitions |
| Text measurement | opentype.js with the theme's font files | Exact glyph widths so wrapping is computed, not guessed |
| SVG building | Plain string templates or svg.js headless | No DOM dependency, deterministic output |
| Hand-drawn style | roughjs (generator API) | Powers the Sketch theme |
| PNG | @resvg/resvg-js | Fast, no browser, consistent font rendering |
| PDF | svg2pdf.js + jsPDF, or pdfkit | Vector PDF |
| PPTX | pptxgenjs | Native, editable shapes and text |
| draw.io | Generated mxGraph XML | Opens in draw.io and diagrams.net for editing |
| Tests | Vitest + snapshot SVGs + pixel diff (pixelmatch) | Catches visual regressions |

Python was considered and rejected for v1: its strongest libraries (Graphviz, `diagrams`) produce technical styling, and PPTX shape export via python-pptx would still need a separate layout engine.

## Spec format

Every diagram is one JSON document: a shared envelope plus a `body` whose shape depends on `type`. The spec carries meaning only (roles, emphasis, status); it never carries colours, coordinates or font sizes.

### Envelope (all types)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | string | yes | Schema version, `"1.0"` |
| `type` | enum | yes | One of the types in the catalogue |
| `altitude` | enum | no | `executive` (default), `management`, `detailed` |
| `theme` | string | no | Theme id, default `boardroom` |
| `themeOverrides` | object | no | Token overrides for this diagram only |
| `canvas` | object | no | `aspect`: `16:9` (default), `4:3`, `A4-landscape`, `A4-portrait`, `square`, `auto` |
| `title` | string | yes | Action title, max 90 characters |
| `subtitle` | string | no | Scope or context line |
| `callout` | object | no | `{ "text", "anchor"?: nodeId }`, the "so what" box |
| `legend` | `"auto"` \| `"none"` \| array | no | `auto` builds it from emphasis, status and tags used |
| `footer` | object | no | `{ "source"?, "note"?, "classification"? }` |
| `body` | object | yes | Type-specific, validated by that type's sub-schema |

### Shared building blocks

**Node**, used inside every body:

```json
{
  "id": "fin-planning",
  "label": "Planning & Analysis",
  "description": "Budgets, forecasts, performance packs",
  "owner": "CFO Office",
  "emphasis": "accent",
  "status": "new",
  "tags": ["shared-service"],
  "icon": "chart",
  "metric": "Forecast in 5 days"
}
```

- `id`: kebab-case, unique per diagram, required.
- `label`: required; max 40 characters at executive altitude.
- `emphasis`: `normal` (default), `accent` (the one thing to look at), `muted` (context, de-emphasised), `highlight` (secondary accent).
- `status`: `current`, `new`, `changed`, `retired`, `at-risk`. Rendered as a small badge or border style from the theme.
- `icon`: a name from the bundled icon set (Lucide subset, MIT licensed). Optional; executive themes may hide icons.

**Edge**, used by flow-based types:

```json
{ "from": "intake", "to": "approve", "label": "over £10k", "style": "solid", "kind": "handoff" }
```

- `style`: `solid`, `dashed` (optional or future), `dotted` (information only).
- `kind`: `flow` (default), `handoff` (crosses a lane, drawn more prominently), `feedback` (loop back, routed around).

### Example: operating model

```json
{
  "version": "1.0",
  "type": "operating-model",
  "altitude": "executive",
  "theme": "boardroom",
  "title": "A shared finance hub frees business partners to focus on decisions",
  "subtitle": "Target finance operating model, 2027",
  "callout": { "text": "40% of transactional effort moves to the hub", "anchor": "hub" },
  "body": {
    "customers": { "label": "Business units", "items": ["Retail", "Commercial", "Wealth"] },
    "layers": [
      { "id": "partnering", "label": "Business partnering", "nodes": [
        { "id": "bp", "label": "Finance business partners", "description": "Embedded in each unit" }
      ]},
      { "id": "expertise", "label": "Centres of expertise", "nodes": [
        { "id": "fpa", "label": "FP&A" },
        { "id": "tax", "label": "Tax & Treasury" },
        { "id": "control", "label": "Financial control" }
      ]},
      { "id": "hub", "label": "Finance hub", "emphasis": "accent", "status": "new", "nodes": [
        { "id": "r2r", "label": "Record to report" },
        { "id": "p2p", "label": "Purchase to pay" },
        { "id": "o2c", "label": "Order to cash" }
      ]}
    ],
    "foundations": ["Single ERP", "Data & reporting platform", "Controls framework"],
    "governance": { "label": "Finance leadership team", "position": "right" }
  }
}
```

### Example: swimlane

```json
{
  "version": "1.0",
  "type": "swimlane",
  "altitude": "management",
  "title": "Invoices over £10k wait two days for a second approval",
  "body": {
    "orientation": "horizontal",
    "lanes": [
      { "id": "supplier", "label": "Supplier" },
      { "id": "ap", "label": "Accounts payable" },
      { "id": "budget", "label": "Budget holder" },
      { "id": "cfo", "label": "CFO office" }
    ],
    "phases": ["Receive", "Approve", "Pay"],
    "steps": [
      { "id": "submit", "lane": "supplier", "phase": "Receive", "label": "Submit invoice" },
      { "id": "match", "lane": "ap", "phase": "Receive", "label": "3-way match" },
      { "id": "approve", "lane": "budget", "phase": "Approve", "label": "Approve spend" },
      { "id": "over10k", "lane": "budget", "phase": "Approve", "label": "Over £10k?", "shape": "decision" },
      { "id": "cfo-ok", "lane": "cfo", "phase": "Approve", "label": "Second approval", "emphasis": "accent", "metric": "avg 2 days" },
      { "id": "pay", "lane": "ap", "phase": "Pay", "label": "Schedule payment" }
    ],
    "edges": [
      { "from": "submit", "to": "match", "kind": "handoff" },
      { "from": "match", "to": "approve", "kind": "handoff" },
      { "from": "approve", "to": "over10k" },
      { "from": "over10k", "to": "cfo-ok", "label": "yes", "kind": "handoff" },
      { "from": "over10k", "to": "pay", "label": "no", "kind": "handoff" },
      { "from": "cfo-ok", "to": "pay", "kind": "handoff" }
    ]
  }
}
```

Step `shape` values: `task` (default), `decision`, `start`, `end`, `document`, `system`, `wait`.

### Schema rules

- Each type ships a sub-schema at `schema/types/<type>.schema.json`, composed into the envelope with `oneOf` keyed on `type`.
- Unknown fields are rejected (`additionalProperties: false`) so typos surface immediately.
- Cross-reference checks run after schema validation: every edge endpoint, `callout.anchor` and lane reference must resolve to an existing id.
- Validation errors are rewritten into plain sentences with the JSON path, e.g. `body.steps[3].lane: "finance" is not a lane. Lanes are: supplier, ap, budget, cfo.`

## Diagram type catalogue

v1 ships six types chosen for leadership use; v2 adds six more. Each type is a self-contained module with its own sub-schema, layout function, reference guide for Claude and at least three golden test specs.

### v1 types

| Type id | What it shows | Layout approach | Body essentials |
| --- | --- | --- | --- |
| `operating-model` | Layers of capability top-down, customers on top, foundations below, governance at the side | Fixed template: stacked bands, nodes in equal-width grid per layer | `customers`, `layers[]`, `foundations[]`, `governance` |
| `swimlane` | Who does what across teams, handoffs | ELK layered with lane partitions; phases as column bands | `lanes[]`, `phases[]`, `steps[]`, `edges[]` |
| `roadmap` | Phases or horizons over time, workstreams as rows, milestones and gates | Fixed grid; time columns equal width (not to scale) unless `scale: "time"` | `horizons[]`, `workstreams[]`, `items[]`, `milestones[]` |
| `value-chain` | Primary activities as chevrons, support activities as bands | Fixed template; chevrons share width equally | `primary[]`, `support[]`, `outcome` |
| `matrix-2x2` | Items placed on two axes with named quadrants | Fixed template; items positioned by `x`/`y` in 0–1 or by quadrant | `xAxis`, `yAxis`, `quadrants[4]`, `items[]` |
| `layered-architecture` | System layers for a non-technical audience | Fixed template like operating model, with optional cross-cutting side bars | `layers[]`, `crossCutting[]`, `external[]` |

### v2 types

| Type id | What it shows |
| --- | --- |
| `current-vs-target` | Two panels side by side with change markers between |
| `capability-map` | Nested capability grid, heat-mapped by maturity or investment |
| `pyramid` | Tiered priorities or a strategy house |
| `flywheel` | Reinforcing cycle of 3 to 6 stages |
| `org-chart` | Reporting tree with roles, optional RACI overlay |
| `journey-map` | Customer stages with touchpoints, pain points and channel lanes |

### Layout rules every type must honour

- **Grid.** All coordinates snap to an 8-unit grid; gaps between siblings are at least 16 units.
- **Text fits.** Labels wrap to measured widths using the theme font. If text still does not fit at minimum size (11 pt equivalent), the box grows; boxes in the same row grow together so they stay equal.
- **Equal siblings.** Nodes in the same layer, lane or column share width and height.
- **Connectors.** Orthogonal routing only, starting and ending on box edges, never crossing a box or a label. Edge labels sit beside the line, never on it.
- **One accent.** At `executive` altitude, at most two nodes or groups may use `accent`. The renderer warns above that.
- **Reading order.** Left to right, top to bottom. Feedback edges route below or around the main flow.
- **Canvas fit.** The layout fills the chosen aspect ratio with consistent outer margins (theme token `space.margin`). If content cannot fit, the renderer reports which element overflows rather than shrinking text below the minimum.

### Per-type reference guides

Each type has `references/<type>.md` loaded by Claude only when that type is chosen. It contains: when to use (and when not), a field-by-field guide, writing tips for labels at each altitude, two complete example specs, and common mistakes (e.g. "more than 7 steps in one lane at executive altitude: group them").

## Theme system

A theme is a JSON file of design tokens. Layout code references token names only (`color.accent`, `space.gap`), so swapping the theme re-styles any diagram without changing its spec or geometry rules.

### Token structure

```json
{
  "id": "boardroom",
  "name": "Boardroom",
  "extends": null,
  "color": {
    "background": "#FFFFFF",
    "surface": "#F5F7FA",
    "surfaceAlt": "#E9EDF2",
    "ink": "#1B2733",
    "inkMuted": "#5B6875",
    "line": "#9AA5B1",
    "lineStrong": "#3E4C59",
    "accent": "#0B3D91",
    "accentInk": "#FFFFFF",
    "highlight": "#00A3A3",
    "categorical": ["#0B3D91", "#00A3A3", "#7A5CFA", "#E07B39", "#4C9F38", "#C2185B"],
    "status": { "new": "#4C9F38", "changed": "#E0A800", "retired": "#9AA5B1", "atRisk": "#C62828" }
  },
  "font": {
    "family": "Inter",
    "files": { "regular": "fonts/Inter-Regular.ttf", "semibold": "fonts/Inter-SemiBold.ttf" },
    "size": { "title": 28, "subtitle": 16, "group": 15, "label": 14, "body": 12, "caption": 11 },
    "weight": { "title": 600, "label": 600, "body": 400 },
    "titleCase": "sentence"
  },
  "shape": { "radius": 6, "stroke": 1.25, "strokeStrong": 2, "shadow": "none", "chevronDepth": 18 },
  "space": { "unit": 8, "gap": 16, "padding": 16, "margin": 48 },
  "connector": { "style": "orthogonal", "arrow": "triangle", "cornerRadius": 4 },
  "style": { "renderer": "clean", "showIcons": false, "accentFill": "tint" }
}
```

- `extends` lets a theme inherit from another and override only what changes.
- `style.renderer`: `clean` (precise vectors) or `sketch` (rough.js strokes and fills).
- `style.accentFill`: `solid` (accent background, white text) or `tint` (12% accent fill, accent border).
- Every theme must pass WCAG AA contrast (4.5:1) for `ink` on `surface` and `accentInk` on `accent`; the theme validator enforces this.

### Built-in themes (v1)

| Theme | Character | Palette | Font | Best for |
| --- | --- | --- | --- | --- |
| `boardroom` (default) | Restrained, consulting-style | Navy, slate, one teal highlight | Inter | Board and ExCo packs |
| `blueprint` | Technical, precise | White lines on deep blue, faint grid background | IBM Plex Sans | Architecture for mixed audiences |
| `sketch` | Hand-drawn, informal | Warm off-white, charcoal, marker accents | Kalam or Caveat for labels | Workshops, early ideas |
| `bold` | High contrast, keynote | Near-black background, vivid accent | Inter | Town halls, keynotes |
| `minimal` | Mostly grey, line-led | Greys, single accent | Source Sans 3 | Reports and documents |
| `print` | Greyscale-safe | Patterns and weights instead of hue | Inter | Printing, accessibility |

All bundled fonts must be open licensed (SIL OFL) so they can be embedded in SVG and PDF.

### Extending themes

Users can add themes three ways:

1. **Drop-in file.** Place `my-brand.theme.json` in `themes/custom/`. The CLI discovers it on the next run.
2. **Brand kit from Claude.** The user gives brand colours (hex codes or a screenshot) and a font name; Claude runs `diagram-studio theme create --from-brand` which generates a full token set (tints, shades, contrast-safe ink colours, a categorical palette) and saves it.
3. **Per-diagram overrides.** `themeOverrides` in a spec changes tokens for one diagram, e.g. `{ "color": { "accent": "#D4001A" } }`.

Commands: `theme list`, `theme preview <id>` (renders one sample of every type in that theme to a contact sheet PNG), `theme validate <file>`.

## Rendering and QA

No diagram reaches the user until it passes automated checks and Claude has looked at the rendered PNG. Most quality problems in generated diagrams are geometric, so they are caught in code before any visual review.

### Render requirements

- Output is a single self-contained SVG: fonts embedded as base64 WOFF2 subsets (only glyphs used), no external references.
- Every element carries a stable `id` and `data-role` (`node`, `edge`, `label`, `lane`, `title`) so exporters and tests can find it.
- SVG includes `<title>` and `<desc>` from the spec's title and subtitle for accessibility.
- Identical spec + theme + version produce byte-identical SVG (no timestamps, random ids or floating-point drift; round coordinates to 0.5).

### Automated checks (`diagram-studio check`)

| Check | Severity | Rule |
| --- | --- | --- |
| Text overflow | error | Every label's measured bounds sit inside its box with padding |
| Overlap | error | No two boxes overlap unless one contains the other |
| Connector crossing box | error | No edge segment passes through a box it does not connect |
| Label collision | error | Edge labels do not overlap boxes, other labels or lines |
| Off-canvas | error | Nothing outside the canvas minus margin |
| Minimum text size | error | No text below `font.size.caption` after scaling to target output |
| Contrast | error | Text vs its background at least 4.5:1 |
| Accent count | warning | More than 2 accented elements at executive altitude |
| Density | warning | Node count over the altitude limit, or whitespace ratio under 25% |
| Edge crossings | warning | More than 2 connector crossings |
| Alignment | warning | Sibling centres misaligned by more than 1 unit |

Checks return JSON (`{ "errors": [], "warnings": [] }`, each with element id and a fix hint) so Claude can repair the spec and re-run.

### Visual self-review

After checks pass, the CLI writes `preview.png` at 2x. SKILL.md instructs Claude to view it and answer a fixed checklist before delivering:

1. Does the title state a finding, and does the picture prove it at a glance?
2. Is the eye drawn first to the accented element?
3. Is anything cramped, orphaned or visually unbalanced?
4. Would a senior executive understand it without a voice-over?

If any answer is no, Claude edits the spec (never the SVG) and re-renders. Maximum three iterations, then deliver with a one-line note on what could still improve.

### Test suite

- At least 3 golden specs per type, rendered in every built-in theme, stored as snapshot SVGs.
- Pixel-diff regression tests on the PNGs (threshold 0.1%).
- Stress specs: longest allowed labels, maximum node counts, single node, non-Latin text (accents, CJK fallback).
- Every golden render must pass `check` with zero errors and zero warnings.

## Export formats

SVG is the master output; every other format is generated from the same scene graph, so all exports match. Editable PowerPoint is the highest-value export for business users and is in scope for v1.

| Format | Flag | Library | Editable? | Notes |
| --- | --- | --- | --- | --- |
| SVG | `--svg` (default) | Native | In vector tools | Fonts embedded; master copy |
| PNG | `--png` | @resvg/resvg-js | No | `--scale` of 1, 2 or 3 (default 2); transparent background option |
| PDF | `--pdf` | svg2pdf.js + jsPDF | No (vector) | Page size follows canvas aspect; fonts embedded |
| PPTX | `--pptx` | pptxgenjs | Yes, native shapes | One slide, 16:9; title in slide title placeholder; each node a grouped shape + text box; connectors as elbow connectors where supported, else line shapes |
| draw.io | `--drawio` | Generated mxGraph XML | Yes | Styles mapped from theme tokens; lanes as draw.io pools |
| Spec | always | — | Yes | `diagram.json` saved beside outputs so the diagram can be revised later |

**PPTX specifics**

- Use theme fonts by name; fall back to Calibri if the user's machine lacks them, and note this in the output message.
- Group each node's shape and text so it moves as one unit.
- Put the `callout` and `footer` in separate text boxes; put the spec's `subtitle` in the slide notes as well.
- Optional `--pptx-template <file.potx>` places the diagram into a corporate master's content area (v2).

**Output naming.** `<slug-of-title>.<ext>`, written to the chosen output directory. The CLI prints a JSON summary of files written, sizes and any warnings.

## Skill packaging

The deliverable is a Claude skill folder containing SKILL.md, per-type references, themes, schemas and a Node CLI. Claude loads SKILL.md first, then only the reference file for the chosen diagram type.

### Folder structure

```
diagram-studio/
├── SKILL.md                     # Entry point: workflow, rules, type picker
├── references/
│   ├── spec-format.md           # Envelope + shared blocks, condensed
│   ├── writing-for-leaders.md   # Action titles, altitude, label style
│   ├── operating-model.md
│   ├── swimlane.md
│   ├── roadmap.md
│   ├── value-chain.md
│   ├── matrix-2x2.md
│   └── layered-architecture.md
├── themes/
│   ├── boardroom.theme.json
│   ├── blueprint.theme.json
│   ├── sketch.theme.json
│   ├── bold.theme.json
│   ├── minimal.theme.json
│   ├── print.theme.json
│   └── custom/                  # User themes, discovered automatically
├── schema/
│   ├── diagram.schema.json
│   ├── theme.schema.json
│   └── types/*.schema.json
├── assets/
│   ├── fonts/                   # OFL fonts referenced by themes
│   └── icons/                   # Lucide subset as SVG symbols
├── examples/                    # Golden specs, one folder per type
├── scripts/
│   ├── package.json
│   ├── src/
│   │   ├── cli.ts
│   │   ├── validate/
│   │   ├── layout/<type>.ts     # One module per type
│   │   ├── scene/               # Scene graph types + helpers
│   │   ├── theme/
│   │   ├── render/svg.ts
│   │   ├── check/
│   │   └── export/{png,pdf,pptx,drawio}.ts
│   └── dist/                    # Prebuilt JS so no compile step at run time
└── tests/
```

Ship `dist/` prebuilt and keep dependencies pure JS or with prebuilt binaries (resvg-js has them), so the first run is `npm ci` and nothing else.

### CLI

| Command | Purpose |
| --- | --- |
| `diagram-studio render <spec.json> [--png --pdf --pptx --drawio] [--out dir] [--theme id]` | Validate, lay out, check, render and export |
| `diagram-studio validate <spec.json>` | Schema and reference checks only |
| `diagram-studio check <spec.json>` | Layout QA without writing outputs |
| `diagram-studio types` | List types with one-line descriptions |
| `diagram-studio example <type>` | Print a starter spec for a type |
| `diagram-studio theme list / preview / validate / create` | Theme management |

All commands print machine-readable JSON to stdout and human messages to stderr. Exit code 0 on success, 1 on validation errors, 2 on QA errors.

### SKILL.md behaviour

SKILL.md is kept under 300 lines and tells Claude to:

1. **Clarify only when needed.** Ask at most one question, and only if the audience or diagram type is genuinely unclear. Otherwise assume `executive` and the `boardroom` theme (or the user's saved default).
2. **Pick the type** using a decision table (e.g. "who does what across teams" → swimlane; "how we're organised to deliver" → operating model; "what happens when" → roadmap; "where to focus" → 2x2).
3. **Load the type's reference**, then write the spec, starting with the action title.
4. **Run `render`**, fix any errors by editing the spec, and repeat until clean.
5. **View `preview.png`** and apply the self-review checklist.
6. **Deliver** SVG plus PNG by default, and any other formats the user asked for, with the spec file so later changes are cheap.
7. **Revise surgically.** For follow-ups ("make finance the accent", "switch to sketch"), edit only the relevant spec fields and re-render.
8. **Never hand-write SVG**, and never invent facts, numbers or owners the user did not provide.

The user's default theme and altitude can be stored in `themes/custom/defaults.json` (`{ "theme": "my-brand", "altitude": "executive" }`).

## Milestones and acceptance

Build in five milestones, each ending with something Claude Code can demo end to end. Do not start a milestone until the previous one's exit criteria pass.

1. **Foundation.** Repo scaffold, TypeScript build, envelope schema, scene graph types, `boardroom` theme, SVG renderer, text measurement with opentype.js. Exit: a hard-coded scene renders to SVG and PNG with correctly wrapped text.
2. **First two types.** `operating-model` (fixed template) and `swimlane` (ELK). Validation with friendly errors, `check` command with all error-level rules. Exit: both example specs in this PRD render with zero check errors.
3. **Remaining v1 types and themes.** `roadmap`, `value-chain`, `matrix-2x2`, `layered-architecture`; all six themes including `sketch` via rough.js; `theme preview` contact sheet. Exit: 6 types × 6 themes render clean.
4. **Exports.** PDF, PPTX (native, grouped, editable), draw.io. Exit: PPTX opens in PowerPoint and Keynote with editable text; draw.io file opens in diagrams.net with lanes intact.
5. **Skill layer.** SKILL.md, references, examples, `theme create --from-brand`, defaults file, golden and pixel-diff tests. Exit: the acceptance tests below pass.

### Acceptance tests

- [ ] Given "Draw our target finance operating model with a shared hub highlighted", Claude produces a valid spec, a clean render and SVG + PNG in one turn without user correction.
- [ ] The same spec re-rendered produces byte-identical SVG.
- [ ] Switching `theme` from `boardroom` to `sketch` changes styling only; node positions stay within 8 units.
- [ ] A 60-character label at executive altitude fails validation with a message that suggests a shorter label or a higher altitude.
- [ ] A swimlane with 4 lanes and 12 steps renders with no connector crossing a box and at most 2 edge crossings.
- [ ] The PPTX export lets a user click any node and edit its text in PowerPoint.
- [ ] A user-supplied brand (two hex codes + a font name) becomes a valid theme that passes contrast checks.
- [ ] `npm ci` plus first render completes in under 60 seconds in a clean Claude workspace; subsequent renders under 3 seconds.

### Open questions

- Should the PPTX exporter support corporate `.potx` masters in v1 or wait for v2?
- Which icon set licence and size is acceptable (Lucide subset proposed, about 150 icons)?
- Should `roadmap` support true time scale in v1, or only equal-width horizons?
- Is Mermaid or D2 import worth adding later, so existing diagrams can be re-styled through the themes?
- Where should user defaults live when the skill is shared across a team (per user or per organisation)?
