# What a good Azure diagram looks like

The house style of the Microsoft Azure Architecture Center, written down so every Azure diagram this skill draws looks like it belongs there. It comes from a shape-by-shape analysis of 14 Microsoft reference architectures (18 diagram pages, Visio): AKS multi-region hub-spoke, AKS on Azure Local, AKS with Application Gateway for Containers (two pages), App Service Environment high availability, document classification with Durable Functions, the Microsoft Foundry chat baseline (three pages), cache-aside with Azure Managed Redis, write-through caching, event-driven cache updates, an asset-management workload on Azure Red Hat OpenShift, mainframe batch re-engineering (two pages), an ERP analytics workload and multilayered VM protection. Measurements below are what those files actually contain.

`azure-architecture` implements this style; `references/azure-architecture.md` says how to write the spec. Read this guide once per session before drawing Azure diagrams, and use it to judge the result.

## Two kinds of Azure diagram

Every reference diagram is one of two kinds, or a deliberate mix of both. Decide which one the reader needs before choosing anything else.

| | Solution workflow | Network and infrastructure topology |
| --- | --- | --- |
| Answers | "How does it work, step by step?" | "Where does it run, and how is traffic contained?" |
| Reference examples | Document classification, cache-aside, write-through, event-driven cache, batch re-engineering, conversational insights | AKS hub-spoke, App Service Environment, an asset-management workload, an ERP analytics workload, AKS on Azure Local, AGC multitenant |
| Boundaries | Few and logical: stages or tiers ("Ingestion", "Application tier", "Monitoring") as grey dashed groups | Many and physical: Azure, region, virtual network, subnet, availability zone |
| Numbered steps | Always: green numbered badges, explained in a workflow list | Rare; when used (Foundry baseline), one badge style per traffic flow |
| Flows | 6–12 arrows following the story left to right | Arrows show traffic paths; private endpoint links, peering and DNS links drawn as lines |
| Icons | 6–15 | 15–45 |

A **hybrid** (the Foundry "network flows" page) draws the full network topology and overlays two or three numbered flows, each with its own badge shape and a legend. Use it when the story is "this request crosses these network controls".

## Canvas and type

- **White canvas, landscape.** Pages run 11–23 inches wide with an aspect between 1.4:1 and 2:1. Tall portrait pages are the exception (AGC multitenant).
- **No title inside the image.** The Architecture Center puts the title and the explanation in the article. In a slide, the action title sits above the diagram. For a document, draw it as a figure with no title.
- **Segoe UI throughout.** 10–11 pt for icon labels (the most common sizes in every file), 12–14 pt for boundary labels, 16–18 pt bold for the outermost boundaries, and 8–9 pt for small notes. Labels are black (`#000000`). Grey is for secondary text only.
- **No Microsoft logo.** The reference files carry the Microsoft Azure logo on their template background page. It is Microsoft's brand mark, never part of the architecture. Leave it out.

## Icons

- **Official Azure icons only, at one size.** Icons are about 0.5 in (48 px) in nearly every diagram, ranging from 0.4 to 0.7 in. Use one size per diagram. Larger icons (0.6–0.7 in) appear only in diagrams with fewer than ten services.
- **A label under every icon**, centred, with the product's full name in sentence case: "Azure Key Vault", "Application Gateway", "Azure Cosmos DB". A second, smaller line may give the role ("Distributed cache", "System of record", "Vector index") or the instance name. The icon terms require the full service name near each icon, and the label must not overlap the icon.
- **Never crop, flip, rotate, distort or recolour an icon,** and never use an Azure icon for something it was not designed for (Microsoft's terms). Draw non-Azure participants (users, client apps, the internet, on-premises datacenters, partner SaaS) with the generic Users icon or a plain neutral glyph, not a borrowed Azure icon.
- **Current names.** Use today's product names: Microsoft Entra ID (not Azure Active Directory), Microsoft Foundry (not Azure AI Foundry or AI Studio), Azure AI Search (not Cognitive Search), Azure Managed Redis or Azure Cache for Redis.
- **Repeated instances** are drawn as repeated icons (three App Service instances, one per zone) or as one icon whose label says how many ("Virtual machines (6)").

## Boundaries: the nesting grammar

Boundaries say where things run. They nest in a fixed order: Azure contains regions, regions contain virtual networks, virtual networks contain subnets, and subnets contain zones and services. Each kind has its own look, so readers can tell them apart without reading the labels.

| Boundary | Line | Fill | Label | Seen in |
| --- | --- | --- | --- | --- |
| Azure (cloud edge) | Azure blue (`#0078D4`/`#4472C4`), dashed, 1.5 pt | none | "Azure", bold, top-left or top-right | Batch, AKS on Azure Local |
| On-premises / customer-hosted | dark grey (`#3C3C41`), dashed, 1.5 pt | none, or a grey panel | bold, top | AKS on Azure Local, an ERP workload |
| Region | none | pale grey (`#F2F2F2`) or a 10% tint | bold, top-left ("Region A") | AKS multi-region, an ERP workload |
| Virtual network | Azure blue, dashed or dotted, 1–1.5 pt | none (or very light blue) | virtual network icon (`<···>`) and name, top-left; the icon sometimes sits at the bottom-right corner | all network diagrams |
| Subnet | grey (`#BFBFBF`) or black, thin (0.25–0.75 pt), solid or dashed | very light grey (`#F8F8F8`), or white on a grey region | subnet icon and name, top-left; NSG shield on the top-right corner, straddling the border | Foundry, Maximo, ASE, multilayered protection |
| Availability zone | amber outline | none | "Zone 1", "Zone 2", "Zone 3" | Foundry |
| Logical group / tier / stage | grey (`#7F7F7F`–`#A6A6A6`), dashed, 0.5–1.5 pt | none or a light tint | regular weight, centred at the top ("Ingestion", "Monitoring") | document classification, Foundry, batch |
| Service container (AKS cluster, Foundry account, App Service plan) | thin grey | light grey panel | the service icon and name, top-left | AGC multitenant, Foundry, AKS on Azure Local |

Rules that hold across the files:

- **Three or four levels deep at most** (Region > Virtual network > Subnet > Zone). Deeper nesting is replaced with a group or a second diagram.
- **The network security group is a decoration, not a box:** a small shield on the subnet's corner, sometimes with "Network security group" written beside it.
- **Boundaries side by side share a height,** and boundaries in a column share a width. Subnets in a virtual network form a tidy row or grid.
- **Global services sit outside every region:** Front Door, Traffic Manager, DNS, Microsoft Entra ID.

## Flows and connectors

- **Orthogonal lines,** 1–1.5 pt, black or near-black (`#3A414A`), with a filled arrowhead at the target. Two-way flows have an arrowhead at each end. (The one diagram with diagonal arrows, multilayered VM protection, is the least legible of the set.)
- **Solid for the main path; dashed or dotted for the rest:** management access, asynchronous or optional paths, and the dotted "Linked" line from private DNS zones to a virtual network.
- **Colour only when a legend explains it.** The AGC diagram colours its traffic types: HTTPS black, diagnostics grey-blue, DNS green, private connection light blue and virtual network link amber. The cache diagrams use green for reads and blue for writes. Otherwise lines stay black.
- **Lines attach to the icon, not its label.** They meet the icon's side at mid-height. A line leaving downward starts below the label.
- **Lines never cross a label and avoid unrelated boundaries.** Crossings get a small jump. A connector label is 9–10 pt and sits beside its line ("HTTPS", "Linked", "Metrics and logs").
- **Private endpoints** sit in their own subnet. A short line runs from each endpoint to its PaaS service outside the virtual network, and the service sits on the same row as its endpoint.

## Numbered steps

The green numbered circle is the signature of a Microsoft workflow diagram.

- **Badge:** a filled circle in Microsoft green (`#107C10`) with a white bold number (10–14 pt). Its diameter is about two thirds of an icon (0.31–0.39 in for 0.5 in icons).
- **Placement:** beside the arrow it numbers, close to the arrow's start, or at the corner of the component the step happens in. Never on top of the line or the icon. A badge at a boundary's top-right corner numbers a whole tier (batch re-engineering).
- **Order:** numbered in reading order. Parallel branches use letters (1a, 1b). Each number appears once on the diagram.
- **Explained in a workflow list.** Every number has a sentence in a numbered "Workflow" list: below the diagram in the article, beside it on a slide, or in the speaker notes. A number without an explanation is noise.
- **Several flows, several badge styles.** When the diagram traces more than one flow, each flow gets its own badge shape and colour, plus a legend line: a green circle for inbound, a blue square for app-to-PaaS, a dark triangle for the agent flow (Foundry baseline). The cache diagrams use a green diamond for reads and a blue square for writes.

## Layout

- **Flow runs left to right.** Users and clients enter on the left, edge services (Front Door, Application Gateway, firewall) come next, workloads sit in the middle and data stores on the right.
- **Supporting services are grouped, not wired.** Monitoring (Azure Monitor, Log Analytics, Application Insights), identity (Microsoft Entra ID, managed identities) and Key Vault often sit in a labelled group at the bottom or side without connectors. A line to every service from Log Analytics would bury the story.
- **Multi-region diagrams stack the regions vertically and mirror them,** with shared or global resources in a column beside them.
- **Everything on a grid.** Icons in a row share a baseline, spacing is even, and services line up with what they connect to, so most lines are straight.
- **Generous whitespace.** Nothing touches a boundary edge, labels never collide, and a crowded diagram is split rather than squeezed.

## The definition: a good Azure diagram

1. It is clearly one of the two kinds (solution workflow or network topology), or a deliberate hybrid with a legend.
2. Every service is the official icon at one consistent size, labelled under the icon with its current full product name.
3. Boundaries nest in the standard order (Azure > region > virtual network > subnet > zone), each kind with its standard line and fill, and no more than four levels deep.
4. Traffic flows left to right, on orthogonal lines that attach to icons, avoid labels and carry an arrowhead at the target.
5. Lines are black. Colour and dash patterns carry meaning only when a legend explains them.
6. Numbered green steps sit beside their flows, run in reading order, and are each explained in a workflow list.
7. With several flows, each flow has its own badge shape and colour, plus a legend.
8. Private endpoints, NSG shields and DNS links appear where the network story needs them, in their standard positions.
9. Monitoring, identity and secrets services are grouped, not wired to everything.
10. Icons sit on a grid, services line up with what they connect to, and boundaries in a row share a height.
11. Nothing overlaps: no label on a line, no badge on an icon, no line through an unrelated boundary.
12. There are no logos or invented details. Every service, name and number comes from the brief or the deployment.

## Common mistakes

- **Mixing the two kinds by accident:** a workflow drowned in subnets, or a network diagram with steps but no workflow list.
- **Icons used for things they are not** (a SQL icon for "a database" that is not Azure SQL; the Entra icon for any login). Use a generic glyph instead.
- **Old names:** Azure Active Directory, Cognitive Search, Azure AI Foundry, Azure Cache for Redis Enterprise.
- **Lines from Log Analytics to every service.** Group monitoring instead.
- **Colour without a legend,** or a legend that lists colours nobody uses.
- **Diagonal arrows, arrows into labels, badges on lines.**
- **Mixed icon sizes,** or text squeezed to 7 pt to fit. Split the diagram instead.

## How Diagram Studio applies this style

| Convention | In the `azure-architecture` spec |
| --- | --- |
| Official icons, full names, one size | `"service": "<icon id or alias>"`: the label defaults to the official name. Icons are 48 units (64 at executive altitude), never recoloured |
| Role line under a label | `"description"` on a node |
| Boundary kinds | `"boundary"`: `azure`, `on-premises`, `region`, `subscription`, `resource-group`, `virtual-network`, `subnet`, `zone`, `group`, `service` |
| NSG shield on the subnet corner | `"nsg": true` on a subnet |
| Left-to-right flow, grid alignment | `"layout": "row" \| "column" \| "grid"` on any container. Services slide to line up with what they connect to |
| Main path solid, the rest dashed or dotted | `"style"` on a flow or flow type |
| Green numbered steps beside the flow | `"step": 1` (or `"1a"`) on a flow, a node or a boundary |
| Workflow list | `"steps": [{ "step": 1, "text": "…" }]`, drawn as a panel and copied into the speaker notes |
| Several flows, distinct badges, legend | `"flowTypes"`: each type gets its own colour, badge shape (circle, square, triangle…) and legend entry |
| Grouped monitoring and identity | a `"boundary": "group"` labelled "Monitoring", without flows |
| No title in the image (documents) | `"frame": "figure"` |
| Azure look | the `azure` theme (default for this type): white canvas, Selawik (metrically identical to Segoe UI, which PPTX uses), black labels, Azure blue networks and green steps |
