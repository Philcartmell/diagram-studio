# Kinds of Databricks diagram

How to match the content to a kind of diagram, how to sketch each kind for an `AskUserQuestion` preview, and how to make concepts that differ. The engine's `diagram-studio docs databricks-style` defines the kinds; this page is about choosing between them in a session.

## Which kind fits the content

Start from the question the reader brings, not from the products the user listed.

| The reader asks… | Kind | Also worth a concept when… |
| --- | --- | --- |
| "How does this use case work?": data moving from sources to dashboards, models or apps | use-case data flow (stages, medallion layers, Unity Catalog band) | the reviewers care who runs what (deployment topology) |
| "Whose account does each part run in, and how is traffic secured?" | deployment topology (Databricks account beside the customer's cloud account) | one request path is the point (number it across the topology) |
| "Which capabilities cover our estate?" | platform reference map (navy platform block of workload panels) | the audience wants one use case, not the whole estate (use-case flow) |
| "How does RAG / MLOps / the medallion pattern work?" | concept (stages left to right, bands underneath) | the user has a real estate to show (use-case flow with their products) |
| "Where does Azure Databricks sit in our Azure estate?" | not this skill: `/diagram-studio:azure` keeps the Microsoft look with Databricks icons inside | |

The audience narrows it further:

- **Executives:** one use-case flow (`executive`, at most nine products, 4–6 steps).
- **Platform and architecture reviews:** a flow with its medallion layers, a topology, or the platform map (`management`, up to 20).
- **Engineers:** a detailed topology with private networking, or the full platform map (`detailed`, up to 60).

## What each kind needs from the user

Ask for exactly what is missing, in plain words. Never fill a gap yourself.

| Kind | Needs | Nice to have |
| --- | --- | --- |
| Use-case data flow | the sources, what ingests them, the layers or tables, what serves and who consumes | the steps in order, stage names, a second path (a model, an app) |
| Deployment topology | the cloud, what runs in the Databricks account and what in theirs (classic or serverless compute, storage) | private networking (VNet injection, Private Link), regions, workspaces per environment |
| Platform reference map | the workload areas in use and the products in each, sources and consumers | Unity Catalog's role, partners and sharing |
| Concept | the stages of the idea and what happens at each | the products that implement each stage |

## Sketches for option previews

An `AskUserQuestion` option can carry a `preview`, shown in a monospace box beside the options. Draw the user's **own** products into the sketch, shortened if needed, so they see their architecture in each kind. Keep it to about 8 lines and 65 columns. These are the patterns, shown with placeholder products.

Use-case data flow (stages, medallion layers, Unity Catalog underneath, amber steps):

```
 ▔Sources▔▔  ▔Ingest▔▔▔  ▔Transform▔▔▔▔▔▔▔▔▔▔▔▔▔▔  ▔Serve▔▔▔  ▔Analyse▔
 [Orders DB]①▶[Connect]②▶┆Bronze┆▶┆Silver┆▶┆Gold┆④▶[SQL WH]⑤▶[Dashboard]
 [Files]────▶[Auto Ldr]─▶┆ raw  ┆ ③┆clean ┆  ┆KPIs┆   │       ▶[Genie]
 ┌ Unity Catalog ─────────────────────────────────────────────────┐
 │        [Lineage]                    [Quality monitoring]       │
 └────────────────────────────────────────────────────────────────┘
```

Deployment topology (who runs what):

```
         ┌╌ Databricks account ╌╌╌╌╌╌╌╌╌┐   ┌╌ Your Azure subscription ╌┐
         ╎ ┌ Control plane ───────────┐ ╎   ╎ ┌ Classic compute plane ┐ ╎
 [Users]①┼▶│ [Web app] [UC] [Orchestr]┼②┼──▶┼▶│ [Clusters]            │ ╎
         ╎ └──────────────────────────┘ ╎   ╎ └──────────┬────────────┘ ╎
         ╎ ┌ Serverless compute plane ┐ ╎   ╎ ┌ Storage ──▼───────────┐ ╎
         ╎ │ [Serverless]─────────────┼④┼──▶┼▶│ [ADLS Gen2]           │ ╎
         └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

Platform reference map (navy platform block of white workload panels):

```
 ▔Sources▔  ██ Databricks Data Intelligence Platform ██  ▔Analyse▔
 [ERP]────▶ █ ┌Engineering┐ ┌Warehousing┐ ┌AI───────┐ █ ─▶[Power BI]
 [Events]─▶ █ │ [Connect] │ │ [SQL WH]  │ │[Serving]│ █ ─▶[Apps]
            █ └───────────┘ └───────────┘ └─────────┘ █
            █ ┌ Unity Catalog ──────────────────────┐ █
            █ └─────────────────────────────────────┘ █
```

## Making concepts diverge

Each concept should make a different thing obvious. In order of preference:

1. **A different kind.** A use-case flow (how the data moves) against a deployment topology (who runs what) against a platform map (which capabilities cover the estate).
2. **The same kind, a different story.**
   - *The path:* the batch path in one concept, the streaming or AI-serving path in another. Two paths in one diagram need `flowTypes` (amber and blue).
   - *Classic or serverless:* the same topology with classic compute in the customer's account, or with serverless compute in the Databricks account.
   - *The accent:* the new product, the governance story (Unity Catalog accented) or the at-risk dependency. Each implies a different title.
   - *Altitude:* an executive flow next to a management view, when the user is unsure how much detail the room wants.
3. **Never** a theme change alone. The `databricks` theme is the house style; `azure` (the Microsoft look) or `boardroom` are styling choices, offered after a direction is picked.

Give each concept its own action title that matches what it makes obvious. When presenting, give one line per concept: the letter, the kind, what it makes obvious, and what it gives up ("B: deployment topology. Shows customer data never leaving their subscription. Loses the order of the pipeline.").
