# Changelog

The engine (the `diagram-studio` npm package, in `engine/`) and the Claude Code plugin (`diagram-studio`, in `plugins/`) share one version and are released together. Write notes under **Unreleased** as you go; `node tools/release.mjs <version>` dates them when you release (see [RELEASING.md](RELEASING.md)).

## Unreleased

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
