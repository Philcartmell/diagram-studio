# Azure architecture icons

The SVG files in `svg/` are Microsoft's official Azure architecture icons, from the "Azure icons" download on the Azure Architecture Center. They are Microsoft's property and are used under Microsoft's terms for those icons, not under this repository's licence.

Microsoft's terms, as stated in the icon pack's FAQ:

- Use an icon only to represent the Microsoft product it was designed for.
- Do not crop, flip, rotate, distort or otherwise change an icon's shape.
- Show the full name of the service near the icon, without overlapping it.

Diagram Studio follows these rules: it draws each icon square and unmodified in its own colours, never recolours it in any theme, and always labels it (with the official product name unless the spec gives a role label).

The files here are normalised copies: titles are removed and internal ids are namespaced so that many icons can share one SVG document. Shapes, colours and proportions are unchanged. `catalog.json` adds display names, aliases and ARM resource types (from `scripts/tools/azure-icons.curated.mjs`).

To update to a newer icon pack, download it from the Azure Architecture Center and run, from `engine/`:

    npm run azure-icons -- "<path to the pack>/Icons"

Microsoft publishes Entra icons separately. Put such icons in the `azure-icons` folder of your Diagram Studio user folder (`diagram-studio version` prints where), named by id (for example `entra-id.svg`); an optional `labels.json` there maps ids to `{ "label": "…", "aliases": ["…"] }`.

Check Microsoft's current terms before redistributing this folder outside your organisation, for example in a public npm package.
