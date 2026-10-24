# Changelog

The engine (the `diagram-studio` npm package, in `engine/`) and the Claude Code plugin (`diagram-studio`, in `plugins/`) share one version and are released together. Write notes under **Unreleased** as you go; `node tools/release.mjs <version>` dates them when you release (see [RELEASING.md](RELEASING.md)).

## Unreleased

### Engine: `diagram-studio`

- **Charts** (a deliberate reversal of v1's "no data charts"): `bar-chart` (columns or bars; single, stacked, grouped or 100% stacked; negative values; category groups; difference arrows; hexagon badge figures), `waterfall` (start, changes, subtotals, end; an automatic axis break; neutral or direction colours), `line-chart` (end labels, a reference line, event markers) and `kpi` (big figures printed as written). Figures sit on the data; totals, differences, shares and waterfall subtotals are computed from the values, and a stated waterfall total that does not add up fails validation. Charts are drawn from the same shapes as diagrams, so SVG, PNG, PDF, PPTX and draw.io match.
- **`narrative`**: a heading, paragraphs and bullets with bold lead-ins, for the argument beside an exhibit.
- **`exhibit`**: one slide of panels, each any other type (charts, business diagrams, Azure and Databricks architectures), in columns, rows or a grid. Every layout can now draw as a figure into a given box; a figure that needs more room is scaled to fit, and QA fails below 70% rather than print unreadable text.
- **Decks**: `diagram-studio render deck.json` renders a list of pages (spec files, inline specs, title and section pages) as one PPTX (a slide per page, shared masters), one PDF (bookmarked by action title) and one draw.io file (a tab per page), with per-page SVG and PNG, a contact sheet and a storyline file. The deck sets the theme, canvas, classification and page numbers; every action title sits in the same place, and a page that outgrows the canvas is drawn as a figure under the standard frame. `validate` and `check` accept decks.
- Deck title and section pages take `themeOverrides` (a divider in its part's colour), and `"inverted": true` draws the title page full-bleed in the accent.
- **Series colours hold across a page and a deck**: a line or categorical bar series keeps its palette hue, matched by label, on every panel of an exhibit and every page of a deck. Series on the same page always get different hues; series that never meet may share one, so long decks do not run through the palette.
- Envelope `footnotes` (numbered notes above the source line), a `hexagon` shape, and swatch and line legend entries.
- The preview board shows a rendered deck as one card with its downloads.
- PPTX text names a font every device has: the theme's `officeFamily` when set, the theme font when Office ships it, otherwise Arial (Inter, DM Sans and the other bundled fonts are not Office fonts, and viewers such as the iOS file preview drew them as a serif). Line breaks are unchanged. Set `font.officeFamily` in a theme override to name the theme font for a team that has it installed.
- PPTX shape ids are unique across the whole presentation, not only within each slide: the iOS file preview drew shapes from earlier slides in place of later slides' shapes that shared an id.

### Plugin: `diagram-studio`

- `/diagram-studio:deck`: a deck design session. Claude agrees the storyline (one action title per page) before drawing, builds each page as any type (or reuses another session's diagram), shows the whole deck on the board, refines page by page and exports one PowerPoint, PDF or draw.io file.
- `/diagram-studio:business` now designs charts and exhibits too: new forms and preview sketches in its visual-forms guide, chart requests in its refining guide, and a rule never to compute a figure.

## 1.0.2 (2026-10-24)

### Engine: `diagram-studio`

- `subset-font` 2.9.0, with `harfbuzzjs` 1.6.4. The CLI now sets its exit code and lets Node exit on its own instead of calling `process.exit()`, which tripped a libuv assertion on Windows with Node 24 after some SVG-only renders (every Azure example) and exited non-zero although every file had been written.
- Development: a CLI test renders every example as SVG only and checks that it exits cleanly.

## 1.0.1 (2026-10-24)

### Engine: `diagram-studio`

- Installs no longer print deprecation warnings: `pdfkit` 0.20.2 replaces the unmaintained `crypto-js` and `jpeg-exif` it used to pull in. PDF output is unchanged.
- `jszip` 3.10.2 and `subset-font` 2.8.0. `subset-font` stays below 2.9.0, whose `harfbuzzjs` 1.x crashes the CLI on exit on Windows.
- `image-size` is overridden to 2.0.4, clearing its denial-of-service advisory. `pptxgenjs` lists it but never loads it.
- Development: `fast-xml-parser` 5.11.2 clears a critical advisory (used only in tests, on our own output).

## 1.0.0 (2026-10-24)

First public release.

### Plugin: `diagram-studio`

- `/diagram-studio:azure`: a design session for Azure architectures in Microsoft Azure Architecture Center style. Claude works out which kind of diagram the reader needs (solution workflow, network topology, or a hybrid), asks only what it cannot infer, shows two or three concepts on a live preview board, refines the chosen one by conversation, and exports PowerPoint, draw.io, SVG, PNG or PDF.
- The Azure skill drafts from a deployment: an ARM template (`az group export`, or Bicep built with `az bicep build`) or a resource list, curated into a story with the user.
- `/diagram-studio:databricks`: the same session for Databricks architectures in the Databricks brand look: use-case data flows with medallion layers and a Unity Catalog band, deployment topologies (Databricks account beside the customer's cloud account), platform reference maps and concepts.
- The Azure skill draws Azure Databricks the Microsoft way: a workspace holding Databricks product icons, the control plane outside the customer's subscription, VNet injection, medallion layers beside ADLS Gen2.
- `/diagram-studio:business`: the same session for operating models, swimlanes, roadmaps, value chains, 2x2 matrices and layered architectures, with concepts that differ in form or story.
- Both skills use an installed `diagram-studio` command, or run the engine through `npx` with no install step.

### Engine: `diagram-studio`

- `azure-architecture` diagrams in Microsoft Azure Architecture Center style, defined by an analysis of 14 reference architectures: the official Azure icons (637, with names, ~400 aliases and ARM types), nested boundaries (Azure, on-premises, region, subscription, resource group, virtual network, subnet with NSG shield, zone, group, service), numbered green steps with a workflow panel, flow types with their own badge shapes and a legend, and an `azure` theme.
- `azure icons` (search the catalog) and `azure import` (draft a spec from an ARM template or resource list).
- `databricks-architecture` diagrams in the Databricks brand look, defined by an analysis of 17 Databricks diagram sources (`references/databricks-style.md`): the same body as `azure-architecture`, Databricks products resolving first, and a `databricks` theme (DM Sans, navy, grey-blue connectors, oat panels, lava for the account and Unity Catalog, amber and blue numbered paths).
- The Databricks icon catalog: official artwork for 71 products in 8 categories, with former product names as aliases (Delta Live Tables, Workflows, Vector Search); `databricks icons` searches it. In Azure diagrams the icons take a `databricks:` prefix. Refresh them from the pack's "Download all" zip with `npm run databricks-icons -- <zip>`.
- Governance and isolation on Azure Databricks: a style section (Databricks terms inside the workspace, Azure terms outside, permissions on the arrows, the per-team slice pattern, and the features whose names change: Unity Gateway, model provider services, service credentials) and an example (`example azure-architecture --n 5`).
- Plain boxes side by side in one container share one size.
- draw.io text cells stay inside narrow containers (their width margin no longer pushes past the container edge).
- Boundaries for both architecture types: `databricks-account`, `cloud-account`, `plane`, `workspace`, `platform`, `panel`, `stage`, `unity-catalog`, `bronze`, `silver`, `gold`. Each theme draws them its own way (Databricks colours in the Databricks look, Microsoft's in the Azure look).
- Business diagram types: operating model, swimlane, roadmap, value chain, 2x2 matrix, layered architecture.
- Exports: SVG with embedded font subsets, PNG, vector PDF, editable PowerPoint (native grouped shapes, icons as SVG with PNG fallback, steps in the speaker notes) and draw.io.
- Layout QA with fix-it messages, altitude limits (executive, management, detailed), seven themes and brand themes.
- `preview`: a live board that refreshes after every render. The newest render fills the page, with every render in a thumbnail strip underneath (newest first, click or use the arrow keys to look back), and a new render takes over the main view. On a phone-sized screen every render stacks vertically instead. "Open full size" and the downloads sit above and below each diagram.
- Custom themes, defaults and extra icons (such as Microsoft Entra ID) live in a per-user folder, never in the install folder.
