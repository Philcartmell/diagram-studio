# Databricks architecture icons

The SVG files in `svg/` are official Databricks artwork. They come from a community collection, [Databricks Architecture Icons](https://oieduardorabelo.github.io/databricks-architecture-icons/) by Eduardo Rabelo, which gathers the artwork from databricks.com and Databricks' design system and fits each file to a 48 × 48 canvas. That collection is unofficial: Databricks does not sponsor or endorse it, or this project. `catalog.json` records, for every icon, the databricks.com address of the original file.

The collection's MIT licence covers its own work (the fitting, the catalog), not the artwork. Databricks, the Databricks logo and the product names are trademarks of Databricks, Inc. Apache Spark and Apache Iceberg are trademarks of the Apache Software Foundation. Use them according to the owners' brand guidelines:

- Use an icon only to represent the product it depicts, and the Databricks logo mark only to label the Databricks platform.
- Do not recolour, crop, flip, rotate, distort or otherwise change the artwork.
- Show the product name near the icon.

Diagram Studio follows these rules: it draws each icon square and unmodified in its own colours, never recolours it in any theme, and always labels it (with the product name unless the spec gives a role label).

The files here are normalised copies: titles are removed, internal ids are namespaced so that many icons can share one SVG document, and the root's paint attributes move to a wrapping group. Shapes, colours and proportions are unchanged. `catalog.json` adds aliases, including former product names such as Delta Live Tables (from `scripts/tools/databricks-icons.curated.mjs`).

To update to a newer collection, download the zip with "Download all" on the collection's website and run, from `engine/`:

    npm run databricks-icons -- "<path to>/databricks-architecture-icons-all.zip"

The command reads the zip directly (an unzipped folder works too), rewrites `svg/` and `catalog.json`, and stops if an alias clashes or a curated alias names a product the pack no longer has. Review the `git diff` of this folder before committing: renamed or removed products change the names diagrams can use.

Check Databricks' current brand guidelines before redistributing this folder outside your organisation, for example in a public npm package.
