# Changelog

The engine (the `diagram-studio` npm package, in `engine/`) and the Claude Code plugin (`diagram-studio`, in `plugins/`) share one version and are released together. Write notes under **Unreleased** as you go; `node tools/release.mjs <version>` dates them when you release (see [RELEASING.md](RELEASING.md)).

## Unreleased

First public release.

### Plugin: `diagram-studio`

- `/diagram-studio:azure`: a design session for Azure architectures in Microsoft Azure Architecture Center style. Claude works out which kind of diagram the reader needs (solution workflow, network topology, or a hybrid), asks only what it cannot infer, shows two or three concepts on a live preview board, refines the chosen one by conversation, and exports PowerPoint, draw.io, SVG, PNG or PDF.
- The Azure skill drafts from a deployment: an ARM template (`az group export`, or Bicep built with `az bicep build`) or a resource list, curated into a story with the user.
- `/diagram-studio:business`: the same session for operating models, swimlanes, roadmaps, value chains, 2x2 matrices and layered architectures, with concepts that differ in form or story.
- Both skills use an installed `diagram-studio` command, or run the engine through `npx` with no install step.

### Engine: `diagram-studio`

- `azure-architecture` diagrams in Microsoft Azure Architecture Center style, defined by an analysis of 14 reference architectures: the official Azure icons (637, with names, ~400 aliases and ARM types), nested boundaries (Azure, on-premises, region, subscription, resource group, virtual network, subnet with NSG shield, zone, group, service), numbered green steps with a workflow panel, flow types with their own badge shapes and a legend, and an `azure` theme.
- `azure icons` (search the catalog) and `azure import` (draft a spec from an ARM template or resource list).
- Business diagram types: operating model, swimlane, roadmap, value chain, 2x2 matrix, layered architecture.
- Exports: SVG with embedded font subsets, PNG, vector PDF, editable PowerPoint (native grouped shapes, icons as SVG with PNG fallback, steps in the speaker notes) and draw.io.
- Layout QA with fix-it messages, altitude limits (executive, management, detailed), seven themes and brand themes.
- `preview`: a live board that refreshes after every render.
- Custom themes, defaults and extra icons (such as Microsoft Entra ID) live in a per-user folder, never in the install folder.
