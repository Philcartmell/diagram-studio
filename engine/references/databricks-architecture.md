# databricks-architecture

A Databricks architecture in the Databricks brand look. Products are drawn with the official Databricks icons and labelled with their product names. They sit inside Databricks boundaries (Databricks account, cloud account, planes, workspace, platform, stages, Unity Catalog, medallion layers), and flows carry numbered amber and blue steps explained in a workflow panel. Answers "how does this run on Databricks?". Read `references/databricks-style.md` first: it defines what a good Databricks diagram looks like, and this type implements it.

**Use for:** lakehouse and medallion pipelines, use-case data flows with numbered steps, deployment topologies (who runs what, where the data lives), platform reference maps, governance with Unity Catalog, AI serving.
**Not for:** an Azure architecture that happens to include Azure Databricks (use `azure-architecture` with `databricks:` icons, so it keeps the Microsoft look); processes across teams (`swimlane`).

## Body fields

The body is the same as `azure-architecture`: `children[]` of nodes and containers, `layout`, `columns`, `flows[]`, `flowTypes[]`, `steps[]`, `workflow` and `frame` work exactly as described in `references/azure-architecture.md`. Two things differ:

- **Icons resolve to Databricks first.** `"service": "unity-catalog"` is the Databricks product. Azure icons and generic participants (`users`, `client`, `database`, `internet`) still work. For a name both catalogs know, `"azure:ai-search"` picks Azure AI Search, where `"ai-search"` means Databricks AI Search.
- **The theme defaults to `databricks`:** DM Sans, navy ink, grey-blue connectors, oat panels, amber and blue step badges.

## Boundaries

| `boundary` | Draws | Label |
| --- | --- | --- |
| `databricks-account` | dashed lava edge, Databricks logo at top-left | "Databricks account" by default |
| `cloud-account` | dashed blue-violet edge | "Cloud account" by default; name it ("Your Azure subscription") |
| `plane` | thin navy outline, white | required ("Control plane", "Serverless compute plane", "Classic compute plane", "Workspace storage") |
| `workspace` | thin navy outline, white, workspace icon | "Databricks workspace" by default; name environments ("Production workspace") |
| `platform` | solid navy block, white title with the Databricks logo | "Databricks Data Intelligence Platform" by default |
| `panel` | white, borderless, heading centred | required ("Data Engineering", "Data Warehousing", "AI") |
| `stage` | grey header bar over open space | required ("Sources", "Ingest", "Transform", "Serve", "Analyse") |
| `unity-catalog` | lava outline, Unity Catalog icon | "Unity Catalog" by default |
| `bronze`, `silver`, `gold` | dashed column in the layer colour | "Bronze", "Silver", "Gold" by default |
| `group` | dashed grey border, label centred | for anything else ("Lakeflow job", "Monitoring") |

The Azure boundaries (`azure`, `region`, `virtual-network`, `subnet`, `zone`, `subscription`, `resource-group`, `on-premises`, `service`) also work, for the cloud side of a deployment. Products and boxes count toward the altitude node limit; boundaries do not.

## Picking icons

- Search the catalog: `diagram-studio databricks icons <words>`. It returns slugs, product names and categories. Former names work too: `dlt`, `delta-live-tables`, `workflows`, `vector-search`, `lakehouse-monitoring`, `repos`.
- The catalog has 71 products in 8 categories: platform and compute, data engineering, storage, analytics and BI, AI and agents, governance, sharing, developer tools.
- The label defaults to the official product name ("Apache Spark Declarative Pipelines"). Set `label` when a shorter role reads better ("Declarative pipelines", "Web application").
- The Databricks logo (`databricks`) labels the platform. Use the `platform` or `databricks-account` boundary, which carry it; a node using the logo gets a warning.
- Cloud services use cloud icons (`storage-accounts` for ADLS Gen2, `event-hubs`). Things with no icon are plain boxes (no `service`): tables, topics, files.

## How layout works

Exactly as for `azure-architecture`: every container lays out its children in a `row`, `column` or `grid` in the order you list them, products slide to line up with what they connect to, and flows are routed around icons and boundaries. Arrange like Databricks does:

- **Use-case flow:** a root `column` of [a `row` of `stage` boundaries, then a `unity-catalog` band]. Put the medallion layers in a row inside the Transform stage.
- **Deployment topology:** a root `row` of [users, `databricks-account` (a column of planes), `cloud-account` (a column of planes)].
- **Platform map:** a root `row` of [a Sources `stage`, the `platform` (a row of `panel`s above a `unity-catalog` panel), an Analyse `stage`].
- Number one path in story order; give a second path its own flow type.

## Writing tips

- **Executive (≤ 9 products):** one use-case flow, 4–6 steps, stages and the Unity Catalog band only. The title states the outcome ("One governed pipeline turns raw events into trusted dashboards").
- **Management (≤ 20):** a use-case flow with its medallion layers, or a deployment topology.
- **Detailed (≤ 60):** the platform map, or a topology with private networking (combine with Azure boundaries: virtual network, subnets, private endpoints).
- Product names change often at Databricks. Use the names the user gives, and the catalog's current labels otherwise.
- Never invent products, workspaces, regions or numbers the user did not give you.

Names and facts in the example below are fictitious. Copy the structure, not the facts.

## Example: executive use-case flow

```json
{
  "version": "1.0",
  "type": "databricks-architecture",
  "altitude": "executive",
  "title": "Orders reach the sales dashboard within minutes of landing",
  "body": {
    "layout": "column",
    "children": [
      {
        "id": "lanes",
        "layout": "row",
        "children": [
          { "id": "sources", "boundary": "stage", "label": "Sources", "children": [{ "id": "orders", "service": "database", "label": "Orders database" }] },
          { "id": "ingest", "boundary": "stage", "label": "Ingest", "children": [{ "id": "connect", "service": "lakeflow-connect" }] },
          {
            "id": "transform",
            "boundary": "stage",
            "label": "Transform",
            "layout": "row",
            "children": [
              { "id": "bronze", "boundary": "bronze", "children": [{ "id": "raw", "label": "Raw orders" }] },
              { "id": "gold", "boundary": "gold", "children": [{ "id": "sales", "label": "Daily sales" }] }
            ]
          },
          { "id": "serve", "boundary": "stage", "label": "Serve", "children": [{ "id": "dashboard", "service": "ai-bi-dashboards" }] }
        ]
      },
      { "id": "governance", "boundary": "unity-catalog", "children": [{ "id": "lineage", "service": "data-lineage" }] }
    ],
    "flows": [
      { "from": "orders", "to": "connect", "step": 1 },
      { "from": "connect", "to": "raw", "step": 2 },
      { "from": "raw", "to": "sales", "step": 3 },
      { "from": "sales", "to": "dashboard", "step": 4 }
    ],
    "steps": [
      { "step": 1, "text": "Lakeflow Connect reads new orders as they are written." },
      { "step": 2, "text": "They land unchanged in a bronze table." },
      { "step": 3, "text": "A pipeline aggregates them into daily sales." },
      { "step": 4, "text": "The sales dashboard reads the gold table directly." }
    ]
  }
}
```

More: `ds example databricks-architecture` prints the medallion pipeline (`--n 2` the workspace deployment topology, `--n 3` the platform reference map). `ds example azure-architecture --n 4` shows Databricks inside an Azure diagram.

## Fixing render errors

| Error | Usual fix |
| --- | --- |
| `ref.service` | Search with `diagram-studio databricks icons <words>` (or `azure icons`); the message suggests the nearest name |
| `ref.boundary-label` | Name the plane, panel or stage ("Control plane", "Data Engineering", "Ingest") |
| `ref.logo` warning | Draw the platform as a `platform` or `databricks-account` boundary; use product icons for what runs on it |
| `canvas-fit` | Split the diagram (topology and flow as two diagrams), group products, use `"layout": "grid"` in long rows, or `"canvas": { "aspect": "auto" }` |
| `edge-crossings` warning | Reorder children so connected products sit next to each other, stages in flow order |
