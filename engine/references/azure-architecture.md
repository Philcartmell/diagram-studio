# azure-architecture

An Azure architecture in Microsoft reference-architecture style. Services are drawn with the official Azure icons and labelled with their product names. They sit inside nested boundaries (Azure, region, virtual network, subnet, availability zone, group), and flows carry numbered green step badges explained in a workflow panel. Answers "how does this run on Azure?". Read `references/azure-style.md` first: it defines what a good Azure diagram looks like, and this type implements it.

**Use for:** solution workflows with numbered steps ("how a document flows through the pipeline"), network and infrastructure topologies (hub-spoke, private endpoints, zone-redundant baselines, multi-region), and drafts from a deployed estate (ARM template or resource list).
**Not for:** non-Azure clouds; business-level system pictures without vendor icons (`layered-architecture`); processes across teams (`swimlane`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `children[]` | yes | 1–24 items: **nodes** (services) and **containers** (boundaries or invisible layout groups), in reading order |
| `layout` | no | How the top level is arranged: `row` (default, left to right), `column`, `grid` |
| `columns` | no | Column count for `grid` (default: about √n) |
| `flows[]` | no | `{ from, to, label?, step?, type?, style?, arrows? }` between node or boundary ids |
| `flowTypes[]` | no | 1–6 `{ id, label, style? }`. Each type gets its own colour, badge shape (circle, square, triangle, diamond…) and legend entry. Use it when you trace several flows (inbound and egress, read and write) |
| `steps[]` | no | `{ step, text }`: the workflow narrative, one sentence per number. Drawn as a panel and copied into the PPTX speaker notes |
| `workflow` | no | Where the steps panel goes: `auto` (default: right when it fits, else below), `right`, `bottom`, `none` |
| `frame` | no | `slide` (default: action title above) or `figure` (no title or subtitle in the image, as in the Architecture Center; the title still names the files) |

**Node** (an item without `children`): `{ id, service?, label?, description?, icon?, emphasis?, status?, step? }`.

- `service`: an Azure icon id or alias (`aks`, `key-vault`, `app-service`, `private-endpoint`…), or a generic participant (`internet`, `on-premises`, `client`, `device`, `third-party`, `admin`…) drawn as a neutral glyph. The label defaults to the official name ("Azure Kubernetes Service").
- `label`: override the name when the role reads better ("AKS cluster", "Web app", "Analyze activity"). Keep the product recognisable.
- `description`: a second, smaller line for the role or instance ("System of record", "Zone-redundant, 3 instances").
- No `service` (and no Lucide `icon`) draws a plain labelled box: use it for things with no icon ("Job 1", "Service pods").

**Container** (an item with `children`): `{ id, boundary?, label?, description?, service?, layout?, columns?, nsg?, step?, emphasis?, children[] }`.

| `boundary` | Draws | Label |
| --- | --- | --- |
| `azure` | dashed Azure-blue edge of the cloud | "Azure" by default, bold |
| `on-premises` | dashed dark-grey edge | "On-premises" by default, bold |
| `region` | pale grey panel, no border | required ("East US 2", "Region A"), bold |
| `subscription` | thin grey border, subscription icon | "Subscription" by default |
| `resource-group` | dashed grey border, resource group icon | "Resource group" by default |
| `virtual-network` | dashed Azure-blue border, virtual network icon | "Virtual network" by default, bold |
| `subnet` | light panel, grey border, subnet icon; `"nsg": true` adds the NSG shield on its corner | "Subnet" by default |
| `zone` | amber outline | required ("Zone 1") |
| `group` | dashed grey border, label centred on top | for stages, tiers, "Monitoring", "Shared resources" |
| `service` | grey panel headed by a service's icon (set `service`) | for a resource that contains others: AKS cluster, Foundry account, App Service plan |

Without `boundary`, a container is an **invisible layout group**: it arranges its children (for example a column of PaaS services beside a virtual network) but draws nothing.

`description` on a boundary is a small line under its label: the address space, a SKU, "Customer-hosted".

Services and boxes count toward the altitude node limit; boundaries do not.

## How layout works

You arrange, the renderer measures and aligns. Every container lays out its children in a `row`, `column` or `grid` in the order you list them. Boundaries in a row stretch to the same height (and in a column, to the same width). Each service then slides within its slot to line up with what it connects to, so most flows run straight. Flows are routed orthogonally around icons and labels, and they avoid boundaries that contain neither end. Step badges and flow labels go beside their lines.

The canvas grows in standard steps (1280 × 720 up to 3840 × 2160 for 16:9) until the architecture fits. The render notes say so, because labels then print smaller on a slide. With `"canvas": { "aspect": "auto" }` it fits the content exactly.

Arrange like Microsoft does:

- **Left to right:** users and clients, then edge services (Front Door, Application Gateway, firewall), then workloads, then data. The top level is usually a `row`.
- **Network diagrams:** a region holds a row of [virtual network, invisible column of PaaS services]. The virtual network holds a row of subnets, with the private endpoint subnet last, next to the PaaS column. List the PaaS services in the same order as their private endpoints and they line up row for row.
- **Multi-region:** an invisible `column` of two `region` boundaries with identical structure, global services (Front Door) to their left, and a `group` of shared resources to their right.
- **Supporting services** (Monitor, Log Analytics, Application Insights, Key Vault when it is not the point) go in a `group` such as "Monitoring", under or beside the main row, usually without flows.
- **Solution workflows:** a `row` of `group` stages ("Ingestion", "Processing", "Serve"), each a `column` (or a `grid`) of services. Number the flows in story order.

## Picking icons

- Search the catalog: `diagram-studio azure icons <words>` (product names, aliases such as `aks` or `kv`, or ARM types such as `Microsoft.Web/sites`). It returns ids, official labels and aliases.
- The catalog is the official Azure icon pack (637 icons). Ids are the icon names in kebab case (`kubernetes-services`, `key-vaults`, `front-door-and-cdn-profiles`), and about 400 aliases cover everyday names (`aks`, `app-service`, `function-app`, `cosmos-db`, `vnet`, `nsg`, `pe`, `log-analytics`, `front-door`).
- **Microsoft Entra ID has no icon in the pack;** Microsoft ships Entra icons separately. Save the official SVG as `entra-id.svg` in the `azure-icons` folder of the user folder (`diagram-studio version` prints where) and `"service": "entra-id"` works. Any SVG dropped into that folder becomes an icon with that id (optional labels in `labels.json` beside them).
- Use an Azure icon only for that product. Non-Azure things get a generic participant (`internet`, `on-premises`, `client`, `third-party`…) or a plain box.

## From a deployed estate (ARM)

`diagram-studio azure import <file> --out diagram.json` drafts a spec from:

- an ARM template: `az group export --name <rg> > template.json`, or any authored template, including parameters and variables;
- a resource list: `az resource list --resource-group <rg> > resources.json`, or Azure Resource Graph output (`{ "data": [...] }`).

The draft groups resources by region and virtual network and places each resource in the subnet it references (VMs through their network interfaces). Private endpoint subnets go last, with their services lined up beside them. The draft draws only the flows ARM states outright: private endpoint to target, gateway to backend, connections, peerings, and private DNS links. It folds NICs, disks, NSGs (as the subnet shield), App Service plans, SQL logical servers and configuration sub-resources, and collapses four or more of one service in one place into a single node. The JSON report lists what was skipped and why, and every resource type without an icon (drawn as a box).

Then curate it, because a deployment has no story:

1. Write the action title (what the architecture achieves) and pick the altitude for the audience.
2. Add the data flows that matter, and number the story with `step` and `steps`.
3. Group monitoring and identity, and remove what the audience does not need (a jump box, diagnostics).
4. Relabel resources by role where it helps ("Orders API"), keeping the instance name in `description`.

## Writing tips

- **Executive (≤ 9 services, 64-unit icons):** the solution workflow only, 4–7 numbered steps, at most one or two boundaries. The title states the outcome ("Orders reach the warehouse within a minute of checkout").
- **Management (≤ 20):** a workflow with its key network controls (virtual network, private endpoints), or a network baseline without every subnet.
- **Detailed (≤ 60):** full topology: subnets with `nsg`, private endpoints, zones, hub and spoke, several flow types with a legend.
- Number steps in reading order and give every number a sentence in `steps`. Use `1a`/`1b` for parallel branches.
- Keep lines black unless `flowTypes` explains a colour. Use `"style": "dotted", "arrows": "none", "label": "Linked"` for DNS zone links and `"arrows": "both"` for peering.
- Never invent services, SKUs, IP ranges or numbers the user did not give or the deployment does not contain.

Names and facts in the examples below are illustrative. Copy the structure, not the facts.

## Example: executive solution workflow

```json
{
  "version": "1.0",
  "type": "azure-architecture",
  "altitude": "executive",
  "title": "Orders reach the warehouse system within a minute of checkout",
  "subtitle": "Event-driven order processing on Azure",
  "body": {
    "layout": "row",
    "children": [
      { "id": "shop", "service": "app-service", "label": "Online shop" },
      { "id": "bus", "service": "service-bus", "description": "Orders queue" },
      { "id": "fn", "service": "function-app", "label": "Order processor" },
      { "id": "db", "service": "cosmos-db", "description": "Order history" },
      { "id": "wms", "service": "on-premises", "label": "Warehouse system" }
    ],
    "flows": [
      { "from": "shop", "to": "bus", "step": 1 },
      { "from": "bus", "to": "fn", "step": 2 },
      { "from": "fn", "to": "db", "step": 3 },
      { "from": "fn", "to": "wms", "step": 4 }
    ],
    "steps": [
      { "step": 1, "text": "The shop posts each confirmed order to a Service Bus queue." },
      { "step": 2, "text": "Azure Functions picks up each order as it arrives." },
      { "step": 3, "text": "The function records the order and its status in Azure Cosmos DB." },
      { "step": 4, "text": "The function sends the pick list to the on-premises warehouse system." }
    ]
  }
}
```

## Example: management network view

```json
{
  "version": "1.0",
  "type": "azure-architecture",
  "altitude": "management",
  "title": "The API reaches its data only through private endpoints",
  "subtitle": "Single-region API baseline",
  "body": {
    "layout": "row",
    "children": [
      { "id": "clients", "service": "client", "label": "Client apps" },
      {
        "id": "region",
        "boundary": "region",
        "label": "West Europe",
        "layout": "row",
        "children": [
          {
            "id": "vnet",
            "boundary": "virtual-network",
            "label": "Workload virtual network",
            "layout": "row",
            "children": [
              { "id": "snet-apim", "boundary": "subnet", "label": "API subnet", "nsg": true, "children": [{ "id": "apim", "service": "api-management" }] },
              { "id": "snet-app", "boundary": "subnet", "label": "App subnet", "nsg": true, "children": [{ "id": "api", "service": "container-app", "label": "Orders API" }] },
              {
                "id": "snet-pe",
                "boundary": "subnet",
                "label": "Private endpoint subnet",
                "layout": "column",
                "children": [
                  { "id": "pe-sql", "service": "private-endpoint", "label": "SQL private endpoint" },
                  { "id": "pe-kv", "service": "private-endpoint", "label": "Key Vault private endpoint" }
                ]
              }
            ]
          },
          {
            "id": "paas",
            "layout": "column",
            "children": [
              { "id": "sql", "service": "sql-database" },
              { "id": "kv", "service": "key-vault" }
            ]
          }
        ]
      }
    ],
    "flows": [
      { "from": "clients", "to": "apim", "label": "HTTPS" },
      { "from": "apim", "to": "api" },
      { "from": "api", "to": "pe-sql" },
      { "from": "api", "to": "pe-kv" },
      { "from": "pe-sql", "to": "sql" },
      { "from": "pe-kv", "to": "kv" }
    ]
  }
}
```

More: `ds example azure-architecture` prints the document-classification workflow (`--n 2` the zone-redundant web app baseline, `--n 3` the multi-region AKS topology with three flow types).

## Fixing render errors

| Error | Usual fix |
| --- | --- |
| `ref.service` | Search with `diagram-studio azure icons <words>`; the message suggests the nearest id |
| `ref.service-missing` (e.g. Entra ID) | Add the official SVG to `azure-icons/` in the user folder (`diagram-studio version` prints where), or show what you mean with another service (`managed-identities`, `users`) |
| `ref.flow-nesting` | A flow cannot connect a boundary to something inside it. Connect the services, or connect the boundary to something outside |
| `ref.flow` on an invisible group | Give the container a `boundary` (for example `group`), or connect its services |
| `canvas-fit` | Split the diagram (one per region or per story), group services, use `"layout": "grid"` in long rows, or `"canvas": { "aspect": "auto" }` |
| `label-collision` on a flow label | Shorten the label, or reorder services so the line is longer |
| `edge-crossings` warning | Reorder children so connected services sit next to each other (private endpoint subnet last, PaaS services in the same order as their endpoints) |
