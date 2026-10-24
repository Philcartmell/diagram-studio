# diagram-studio

A deterministic renderer for boardroom-quality diagrams. You describe the diagram as a JSON spec; it does all the layout, styling and quality checks, and writes SVG, PNG, PDF, editable PowerPoint and draw.io.

It draws operating models, swimlanes, roadmaps, value chains, 2x2 matrices and layered architectures, plus Azure architectures in Microsoft Azure Architecture Center style with the official Azure icons, and Databricks architectures in the Databricks brand look with the official Databricks product icons. It also draws consulting-style charts (bar and column charts, waterfalls, line charts, KPI figures) with every total and difference computed from your values, exhibits that put any of these side by side on one slide, and decks: several pages rendered as one PowerPoint, PDF or draw.io file. It is the engine behind the [Diagram Studio](https://github.com/Philcartmell/diagram-studio) plugin for Claude Code, which runs a design conversation on top of it, and it works just as well on its own. The engine and the plugin share a version and are released together from that repository.

## Install

```bash
npm install -g diagram-studio        # or, without installing: npx -y diagram-studio@1 <command>
diagram-studio version
```

Node 20 or later.

## Use

```bash
diagram-studio example azure-architecture > diagram.json     # a starter spec (copy the structure, not the facts)
diagram-studio render diagram.json --all --out out           # SVG, PNG, PDF, PPTX and draw.io
diagram-studio render deck.json --pptx --pdf --out out       # several pages as one deck
diagram-studio preview out --open                            # live board that refreshes after every render
diagram-studio docs guide                                    # the spec guide; `docs` lists every topic
diagram-studio azure icons key vault                         # search the official Azure icons
diagram-studio azure import template.json --out draft.json   # draft an Azure diagram from an ARM template
diagram-studio databricks icons unity catalog                # search the Databricks product icons
```

Results are JSON on stdout, messages on stderr. Exit codes: 0 ok, 1 validation errors, 2 QA errors (each error carries a hint for fixing the spec).

| | |
| --- | --- |
| Types | `operating-model`, `swimlane`, `roadmap`, `value-chain`, `matrix-2x2`, `layered-architecture`, `azure-architecture`, `databricks-architecture` |
| Altitudes | `executive` (≤ 9 nodes), `management` (≤ 20), `detailed` (≤ 60) |
| Themes | `boardroom`, `blueprint`, `sketch`, `bold`, `minimal`, `print`, `azure`, `databricks`; brand themes with `theme create --from-brand` |
| Exports | SVG (fonts embedded), PNG, PDF (vector), PPTX (native, grouped, editable shapes), draw.io |

## Your themes, defaults and icons

Brand themes, saved defaults and extra Azure icons (such as Microsoft Entra ID, which Microsoft ships outside the Azure icon pack) live in a user folder, never in the install folder:

- Windows: `%APPDATA%\diagram-studio`
- macOS and Linux: `$XDG_CONFIG_HOME/diagram-studio`, or `~/.config/diagram-studio`

Set `DIAGRAM_STUDIO_HOME` to use another folder. `diagram-studio version` prints the one in use. Inside it, `themes/` holds `*.theme.json` files, `azure-icons/` holds extra icons named by id (`entra-id.svg`), and `defaults.json` holds the defaults saved by `theme default`.

## Licences

The code is MIT. The bundled fonts (Inter, IBM Plex Sans, Kalam, Source Sans 3, Selawik, DM Sans) are under the SIL Open Font License, and the Lucide icon subset under ISC; their licence files are in `assets/`. The Azure architecture icons are Microsoft's, used under Microsoft's icon terms: see `assets/azure-icons/NOTICE.md`. The Databricks icons are Databricks' artwork, from a community collection: see `assets/databricks-icons/NOTICE.md`.
