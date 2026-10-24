---
name: diagram-studio
description: Turns a plain-language request ("show our target operating model", "swimlane of invoice approval across four teams", "2x2 of our initiatives") into a boardroom-quality business diagram — operating models, swimlanes, roadmaps, value chains, 2x2 matrices and layered architectures — or a Microsoft-reference-style Azure architecture diagram with the official Azure icons (solution workflows with numbered steps, network topologies with regions, virtual networks, subnets and private endpoints, or a draft from an ARM template), or a Databricks architecture in the Databricks brand look with the official Databricks icons (lakehouse and medallion flows, workspace deployment topologies, platform maps, Databricks inside Azure diagrams), or a consulting-style data exhibit (bar and column charts, waterfalls, line charts, KPI figures, and slides that combine any of these with text or diagrams), delivered as SVG and PNG, with optional PDF, editable PowerPoint (PPTX) and draw.io exports; several pages render as one multi-slide deck. Use it whenever someone wants a diagram, chart or exhibit for a leadership pack, board paper, steering committee, workshop or design document, or wants an existing one re-themed, revised or put in their brand. Claude writes a JSON spec; a deterministic renderer guarantees the layout, spacing and styling, and computes every total and difference in a chart. Not for pie charts, scatter plots, maps, or AWS and Google Cloud diagrams.
---

# Diagram Studio

You write **meaning** as a JSON spec; the renderer does **all** geometry, styling and quality checks. You never write SVG, coordinates, colours or font sizes.

## Setup (once per workspace)

The engine is the `diagram-studio` npm package (Node 20+). Use the `diagram-studio` command if it is installed (`npm install -g diagram-studio`); otherwise run `npx -y diagram-studio@1 <command>`. Working from a clone of the repository instead:

```bash
cd <repo>/engine && npm ci     # ~30 s; also builds scripts/dist/
```

then run `node <repo>/engine/scripts/dist/cli.js <command>`. Any of these is written `ds` below.

| Command | Purpose |
| --- | --- |
| `ds render spec.json [--png --pdf --pptx --drawio \| --all] [--out dir] [--theme id]` | Validate, lay out, check, render, export |
| `ds render deck.json --pptx --pdf` | Render several pages as one deck (`ds docs deck`) |
| `ds validate spec.json` | Schema and reference checks only |
| `ds check spec.json` | Layout QA without writing files |
| `ds types` / `ds example <type> [--n 2]` | List types / print a starter spec |
| `ds icons` | List icon names (only for themes that show icons) |
| `ds azure icons <words>` / `ds azure import <arm.json> --out spec.json` | Search the official Azure icons / draft an Azure spec from an ARM template or resource list |
| `ds databricks icons <words>` | Search the Databricks product icons (former names such as `dlt` work) |
| `ds preview <dir> [--open]` | Live board of every diagram rendered under `<dir>`; refreshes on each render (run it in the background) |
| `ds docs [topic]` | Print this guide (`guide`) or a reference (`swimlane`, `spec-format`…) from any install |
| `ds theme list \| preview <id> \| validate <file\|id> \| create --from-brand … \| default <id>` | Themes |

Results are JSON on stdout; human messages on stderr. Exit **0** ok, **1** validation errors, **2** QA errors.

## Workflow

1. **Clarify only when needed.** Ask at most one question, and only if the audience or the diagram type is genuinely unclear. Otherwise take the altitude from the audience using the table below (`executive` when unknown) and the `boardroom` theme (or the saved default — see Themes). When you must assume a detail the user did not state (say, which workstream owns an item), choose the natural reading and mention it in one line when you deliver.
2. **Pick the type** with the table below.
3. **Load references.** Read `references/<type>.md` for the chosen type. Read `references/writing-for-leaders.md` the first time in a session, and `references/spec-format.md` if you need an envelope field you are unsure of.
4. **Write the spec**, starting with the action title (see below). Save it as `diagram.json` in a working folder. Put the theme in the spec (`"theme": "sketch"`) rather than on the command line, so the saved spec re-renders the same way.
5. **Render**: `ds render diagram.json --png --out <dir>` (add `--pptx`, `--pdf`, `--drawio` if asked). If it exits 1 or 2, read each error's `message` and `hint`, **edit the spec**, and render again. Repeat until clean. On exit 2, `preview.png` shows the failing layout for diagnosis; no deliverables are written (older files from an earlier render may remain; the output notes list them). For quick nudge-and-retry loops (moving 2x2 items, trying an orientation) use `ds check diagram.json`, which runs the same QA without writing files.
6. **Look at `<dir>/preview.png`** (always written, 2x, for your review) and answer the self-review checklist. If any answer is no, edit the spec and re-render. At most three review iterations; then deliver with a one-line note on what could still improve.
7. **Deliver** the SVG and PNG, plus any formats asked for. Pass on any `notes` from the render output (for example the PPTX font note). `<slug>.diagram.json` beside the outputs is a copy of the spec as rendered, for later revisions.
8. **Revise surgically.** For follow-ups ("make finance the accent", "switch to sketch", "add a CFO lane") edit only the relevant fields of the spec (your `diagram.json`, or the `<slug>.diagram.json` copy if the working file is gone) and re-render. Never rebuild from scratch, never edit an output file.

**Never hand-write SVG or edit rendered files. Never invent facts, numbers, owners, dates or metrics the user did not give you.** If a diagram needs a number you do not have, leave it out or ask. The example specs in `references/` and `ds example` contain illustrative names, figures and dates: copy their structure, never their facts. Statuses (`new`, `at-risk`…) are claims too; use them only when the user said so.

## Pick the type

| The user wants to show… | Type | Typical words |
| --- | --- | --- |
| How we are organised to deliver: layers of capability, who serves whom | `operating-model` | operating model, TOM, target state, shared services, centres of excellence |
| Who does what across teams, handoffs, approvals | `swimlane` | process, workflow, approval, handoffs, end-to-end, as-is / to-be process |
| What happens when: phases, workstreams, milestones, gates | `roadmap` | roadmap, plan, timeline, phasing, now/next/later, waves |
| How value is created end to end, with focus areas | `value-chain` | value chain, Porter, end to end, where we make money, primary activities |
| Where to focus: items placed on two dimensions | `matrix-2x2` | 2x2, prioritise, impact vs effort, portfolio, risk heatmap, quadrant |
| How a system fits together, for non-technical readers | `layered-architecture` | architecture, platform, layers, stack, systems landscape |
| How it runs on Azure: services, networks, numbered flows | `azure-architecture` | Azure, AKS, App Service, VNet, subnet, private endpoint, hub-spoke, reference architecture, ARM template, Azure Databricks |
| How it runs on Databricks: lakehouse flows, workspace deployment, platform map | `databricks-architecture` | Databricks, lakehouse, medallion, bronze/silver/gold, Unity Catalog, Lakeflow, control plane, workspace |
| How big, and how it splits: stacks, before and after, rankings, shares | `bar-chart` | bar or column chart, stacked, breakdown, by region, comparison, ranking, share |
| What moved the number from A to B | `waterfall` | waterfall, bridge, walk, variance, drivers |
| How it moved over time | `line-chart` | trend, over time, index, time series, actual vs plan |
| The headline numbers | `kpi` | KPIs, key figures, headline numbers |
| The words beside an exhibit | `narrative` | benefits and risks, implications, what it means |
| One slide combining any of the above: a chart with its argument, small multiples, an architecture with its cost case | `exhibit` | exhibit, chart with commentary, side by side, small multiples |

Several pages for one meeting are a **deck**: one spec per page plus a `deck.json` (read `references/deck.md`). Any type, an exhibit included, can be a deck page.

For `azure-architecture`, also read `references/azure-style.md` once per session: it defines what a good Azure diagram looks like (two kinds: solution workflow and network topology), and the self-review checklist there replaces the one below. Given an ARM template or resource list, start from `ds azure import`, then add the story. For `databricks-architecture`, read `references/databricks-style.md` the same way. An Azure architecture that includes Azure Databricks stays `azure-architecture` and uses `databricks:` icons; a Databricks-centred picture is `databricks-architecture`.

Not supported: pie and donut charts, scatter plots, maps and data tables, free-form drawing, AWS or Google Cloud diagrams, org charts and journey maps (planned for v2 — say so, and offer the nearest supported type only if it genuinely fits).

## Numbers

Charts take the figures the user gave, as given. **Never compute a figure yourself**: give the segment values and let the chart add totals (`totals`), work out differences (`deltas`), shares (`"mode": "percent"`) and waterfall subtotals; a stated waterfall total that does not add up is a validation error. Never round, convert or extrapolate a number to make a chart look better, and never fill a missing value: use `null` and say so. Put the unit in the subtitle or `unit`, and the source in `footer.source`.

## Altitude

`altitude` decides how much detail the diagram may carry. The renderer enforces it.

| Altitude | Max nodes | Label | Description | Use for |
| --- | --- | --- | --- | --- |
| `executive` (default) | 9 | ≤ 40 chars | ≤ 70 chars, about one line | Board, ExCo, steering committees |
| `management` | 20 | ≤ 60 chars | ≤ 160 chars | Department leadership, programme boards |
| `detailed` | 60 | ≤ 80 chars | ≤ 300 chars | Working teams, design docs (legend required when colour carries meaning) |

When a spec exceeds the limits, **summarise first** (group nodes, move detail into descriptions or the speaker notes). Raise the altitude only if the audience really is a working team.

## Action titles

Every `title` states the finding, not the topic, in sentence case, under 90 characters.

- ✗ "Finance operating model" → ✓ "A shared finance hub frees business partners to focus on decisions"
- ✗ "Invoice approval process" → ✓ "Invoices over £10k wait two days for a second approval"

Use the `subtitle` for scope ("Target finance operating model, 2027"). Use `callout` for the one "so what" sentence. With an `anchor` it sits in a side column level with that element (best for swimlanes and 2x2s); without one it is a full-width bar under the diagram (often better for operating models, layered architectures and roadmaps, where a side column squeezes the content). Either form costs space; if a dense diagram stops fitting, drop the callout and put the point in the title.

## Spec essentials

```json
{
  "version": "1.0",
  "type": "operating-model",
  "altitude": "executive",
  "title": "Action title that states the finding",
  "subtitle": "Scope or context",
  "callout": { "text": "The so-what in one sentence", "anchor": "some-id" },
  "body": { }
}
```

- Every `id` is kebab-case and unique across the diagram. Labels are short noun phrases in sentence case.
- `emphasis`: `accent` (the one thing to look at; at most 2 accented elements at executive, counting groups such as layers or quadrants), `highlight` (a second colour for secondary emphasis — teal in boardroom), `muted` (context). Default `normal`. When a user says "highlight X" they usually mean the accent, not `highlight`.
- `status`: `new`, `changed`, `retired`, `at-risk` (shown as labelled badges; listed in the legend only at detailed altitude). Do not set `current` unless contrasting with change.
- `canvas.aspect`: `16:9` (default), `4:3`, `A4-landscape`, `A4-portrait`, `square`, `auto` (grows to fit).
- Optional: `legend` (`auto` default, `none`, or explicit entries), `footer` (`source`, `note`, `classification`), `theme`, `themeOverrides`.

Full field guide: `references/spec-format.md`. Starter specs: `ds example <type>`.

## Fixing render errors

Errors name the element and give a fix. Edit the **spec**, never the output.

| Error | Usual fix |
| --- | --- |
| `altitude.nodes` / `altitude.label` / `altitude.description` | Group or shorten; move detail to `description` or notes; raise altitude only for working audiences |
| `canvas-fit` | Follow the message: e.g. many lanes → `"orientation": "vertical"`; fewer or shorter items; `"legend": "none"`; drop the subtitle or callout; for big processes or 60-node models `"canvas": { "aspect": "auto" }`. Changing one element (a callout, a subtitle) changes the space left for the rest, so re-check after any edit |
| `canvas-fit` on `<item>--label` (2x2) | The message names what blocks the label: nudge the item's `x`/`y` by ~0.05 away from it, or shorten the label |
| `text-overflow` | Shorten the label or description |
| `overlap`, `off-canvas` | After a `canvas-fit` error these are knock-on effects: fix that first. Otherwise reduce content in the row or set canvas `auto` |
| `ref.*` (e.g. "is not a lane") | Fix the id; the message lists valid ids |
| warnings (`accent-count`, `edge-crossings`, `density`, `title.topic`) | Treat as must-fix for executive packs |

## Self-review checklist (view preview.png)

1. Does the title state a finding, and does the picture prove it at a glance?
2. Is the eye drawn first to the accented element?
3. Is anything cramped, orphaned or visually unbalanced?
4. Would a senior executive understand it without a voice-over?

If any answer is no, change the spec (re-word, re-group, move the accent, change altitude or canvas) and re-render.

## Themes

Built-in: `boardroom` (default, consulting navy), `blueprint` (light on deep blue, grid), `sketch` (hand-drawn, workshops), `bold` (dark keynote), `minimal` (line-led, documents), `print` (greyscale-safe), `azure` (Microsoft reference-architecture look; the default for `azure-architecture`, and usable for any type), `databricks` (Databricks brand look, DM Sans; the default for `databricks-architecture`). Switch with `"theme": "sketch"` or `--theme sketch`; geometry stays put, only styling changes (in the architecture types, service cells follow each theme's type size).

- **One-off tweak:** `"themeOverrides": { "color": { "accent": "#D4001A" } }` (validated for contrast).
- **Brand kit:** when the user gives brand colours (hex codes, or a screenshot — read the hex values from it yourself) and optionally a font name:
  `ds theme create --from-brand --id acme --name "Acme" --colors "#D4001A,#1A1A1A" --font "Acme Sans"`
  `--font` is optional (Inter is used without it); add `--font-regular a.ttf --font-semibold b.ttf` if they supply font files. The command makes a full contrast-safe token set in the user folder's `themes/` (`ds version` prints the user folder) and prints notes you should pass on: the colour roles, any colour it darkened for contrast, and font fallbacks. The **first colour is the accent** (the one thing to look at); the **second is `highlight`** — it only appears on elements you mark `"emphasis": "highlight"`, so give one secondary element that emphasis if the user expects to see both brand colours. Then set `"theme": "acme"` in the spec and show `ds theme preview acme`.
- **Defaults:** `ds theme default acme --altitude executive` saves `defaults.json` in the user folder, used when a spec sets no theme or altitude.
- Drop-in theme files in the user folder's `themes/*.theme.json` are discovered automatically; `extends` lets them override only what changes. Validate with `ds theme validate <file>`.

## Exports

| Format | Flag | Notes |
| --- | --- | --- |
| SVG | always | Master copy, fonts embedded, deterministic |
| PNG | `--png` | `--scale 1\|2\|3` (default 2), `--transparent` |
| PDF | `--pdf` | Vector, fonts embedded; A4 aspects print on A4 |
| PPTX | `--pptx` | One 16:9 slide (a deck: a slide per page) of native, grouped, editable shapes, charts included; title in the title placeholder; subtitle and so-what in the notes; swimlane arrows are real connectors |
| draw.io | `--drawio` | Opens in diagrams.net; lanes are swimlane containers |

Files are named `<slug-of-title>.<ext>` in `--out` (default: the spec's folder), plus `preview.png` and `<slug>.diagram.json`.
