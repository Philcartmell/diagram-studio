# What a good Databricks diagram looks like

The house style of Databricks' own architecture diagrams, written down so every Databricks diagram this skill draws looks like it belongs in Databricks' documentation. It comes from an analysis of 17 diagram sources Databricks publishes (October 2026). They cover:

- the lakehouse reference architectures for AWS, Azure and GCP, with their use-case overlays;
- the high-level classic and serverless workspace architectures and the networking diagrams;
- the Unity Catalog object model, medallion architecture, RAG, Lakeflow Connect, MLOps and Lakebase diagrams;
- the marketing set.

A second analysis, of 9 Azure Architecture Center and Azure Databricks docs diagrams, covers how Microsoft draws Azure Databricks inside Azure diagrams (see the last sections).

`databricks-architecture` implements this style; `references/databricks-architecture.md` says how to write the spec. Read this guide once per session before drawing Databricks diagrams, and use it to judge the result.

## Four kinds of Databricks diagram

Decide which one the reader needs before choosing anything else.

| | Platform reference map | Use-case data flow | Deployment topology | Concept or pipeline |
| --- | --- | --- | --- | --- |
| Answers | "Which platform capabilities cover our data and AI estate?" | "How does this use case move through the platform?" | "Whose account does each part run in, and how is traffic secured?" | "How does this idea work?" (medallion, RAG, MLOps) |
| Shape | Sources on the left, a navy platform block of white workload panels in the middle, consumers on the right | Stage columns left to right (Sources, Ingest, Transform, Serve, Analyse), a governance band underneath | Databricks account beside the customer's cloud account, planes inside each | Stages left to right, governance and storage bands underneath |
| Steps | Rare | Always: one or two numbered paths, explained in a list | Often: numbered connections | Sometimes |

## Canvas and type

- **White canvas, landscape 16:9.** The reference map is drawn on an 11×17 in page; docs diagrams are wide.
- **No title inside the image** in documentation: the page carries the caption. On a slide, the action title sits above.
- **DM Sans throughout.** Navy text (`#1B3139` dark, `#1B5162` structure), grey-blue (`#618794`) for secondary headings. Sizes step down from the platform title through lane headers and panel headings to labels.

## Colour

| Role | Colour |
| --- | --- |
| Text and structure | navy `#1B3139`, `#1B5162` |
| Connectors, panel headings | grey-blue `#618794` |
| Panels and legends | white on oat (`#F9F7F4`, `#EEEDE9`) |
| Databricks account boundary | lava `#FF5F46`, dashed |
| Customer cloud account boundary | blue-violet `#7587FF`, dashed |
| Numbered flows | amber `#FFAB00` (first), blue `#4299E0` (second) |
| Medallion layers | bronze, silver, gold, one consistent set |

**Lava is scarce.** Databricks keeps it for the account boundary, the Unity Catalog band and the logo. Diagrams that splash it on every box, or use Google Slides' default palettes, look off-brand.

## Icons

- **Databricks products:** the official product artwork, one consistent size, labelled with the current product name (Unity Catalog, Lakeflow Jobs, Databricks SQL warehouse). Databricks' own maps often show capabilities as green text chips. This renderer draws the product icons instead, which read better at slide size.
- **The Databricks logo** (the stacked layers) labels the platform or the Databricks account and nothing else.
- **Cloud services** (storage, event streams, BI) use the official cloud icons: the Azure icons are available here.
- **Generic sources and users** are monoline glyphs, not product icons.

## Boundaries: the nesting grammar

| Boundary | Drawn as | Used for |
| --- | --- | --- |
| Databricks account | dashed lava, logo at top-left | What Databricks runs: the control plane, the serverless compute plane |
| Cloud account | dashed blue-violet | What the customer runs: the classic compute plane, workspace storage |
| Plane | solid thin navy, white | Control plane, serverless or classic compute plane, workspace storage |
| Workspace | solid thin navy, white, workspace icon | One workspace (dev, staging, prod side by side) |
| Platform | solid navy block, white title with the logo | The platform in a reference map |
| Panel | white, borderless, heading centred | A workload area inside the platform (Data Engineering, Data Warehousing, AI) |
| Stage | grey header bar over open space | A swim column: Sources, Ingest, Transform, Serve, Analyse |
| Unity Catalog | lava outline, the Unity Catalog icon | Governance: a band under the flow, or a panel in the platform |
| Bronze, silver, gold | dashed rounded columns in the layer colour | Medallion layers |

Nest at most three levels: account > plane > items, or stage > layer > table.

## Flows and numbered steps

- Orthogonal grey-blue connectors with filled arrowheads, left to right. Storage links may run both ways.
- A use case is one or two numbered paths: amber badges for the first, blue for the second. Every number is explained in a list.
- Colour marks a path only when the legend explains it.

## The definition: a good Databricks diagram

1. It is clearly one kind: a platform map, a use-case flow, a deployment topology or a concept.
2. DM Sans, navy and grey-blue text, white panels on oat or white.
3. Lava appears only on the Databricks account, Unity Catalog and the logo.
4. Products are official icons at one size, labelled with current product names. Cloud services use cloud icons; generic actors use glyphs.
5. The flow runs left to right through the stages, with governance (and storage) underneath.
6. Lines are orthogonal and grey-blue with filled heads; colour marks a numbered path only when the list explains it.
7. Steps run in reading order, amber for the first path and blue for the second, each explained in the list.
8. Topology nests account > plane > items: dashed lava for Databricks, dashed blue-violet for the customer's cloud.
9. Medallion layers use one bronze, silver and gold set, in order, joined left to right.
10. Unity Catalog governs the whole picture: a band under it, not a box wired to everything.
11. Nothing overlaps: no label on a line, no badge on an icon, no line through an unrelated boundary.
12. Product names come from the brief or current docs (Databricks renames often), and there is no logo beyond the platform mark and nothing invented.

## Common mistakes

- **Google Slides defaults:** Arial, `#4285F4` blue, `#FFD966` yellow. Off-brand even in Databricks' own docs.
- **Lava everywhere.** It stops meaning "Databricks".
- **Old names:** Delta Live Tables (now declarative pipelines), Databricks Workflows (Lakeflow Jobs), Vector Search (AI Search), Lakehouse Monitoring (data quality monitoring). The icon catalog knows the old names, and the labels show the new ones.
- **The logo as a product icon,** or one product icon repeated to mean "data".
- **Lines from Unity Catalog to every table.** Put the governed things inside or above the band instead.

## Databricks inside an Azure diagram

Microsoft's Azure Architecture Center draws Azure Databricks its own way. When Databricks is part of an Azure architecture, keep the Azure look (`azure-architecture`, the `azure` theme) and follow Microsoft:

- **The Azure Databricks icon means the service or a workspace.** Use exactly one per workspace. Databricks product icons (`databricks:` in the spec) are the features inside it: pipelines, jobs, SQL warehouses, MLflow, model serving.
- **A workspace is a white panel** with a thin dark outline and the Azure Databricks icon at its top-left. Several workspaces (dev, staging, prod) sit side by side.
- **The control plane is managed elsewhere:** a dashed grey Databricks account boundary outside the customer's subscription. The serverless compute plane sits inside it.
- **The classic compute plane is the customer's virtual network** (VNet injection): a host subnet (public) and a container subnet (private), both with NSG shields. Add a private endpoint subnet for the back-end Private Link endpoint.
- **Unity Catalog** sits in a governance band under the flow. **Medallion layers** sit in a Store group beside ADLS Gen2, joined left to right.
- A diagram with a single Databricks node uses just the Azure Databricks icon.

## Governance and isolation on Azure Databricks

"Who can reach what, and through which identity" diagrams (per-team isolation, data and model access, cross-subscription sources) are Azure-heavy: Entra groups, managed identities, Key Vaults, storage accounts. Draw them as `azure-architecture` in the Azure look, and offer the `databricks` theme as a variant; the same spec renders in both.

**Databricks terms inside the workspace, Azure terms outside.** Every concept has a Databricks object and an Azure resource; draw each on its own side and connect them:

| Concept | Databricks object (inside the workspace) | Azure resource (outside, in a resource group) |
| --- | --- | --- |
| A team | the group, assigned to the workspace | Entra ID security group (synced by automatic identity management, not SCIM) |
| Data identity | storage credential (Unity Catalog) | access connector for Azure Databricks, using a user-assigned managed identity |
| Cloud-service identity (Foundry and others) | service credential (Unity Catalog) | the same access connector and managed identity |
| Data | catalog (managed location), external location | storage account container |
| Secrets | secret scope | Key Vault |
| Models | model provider service, queried through Unity Gateway | Microsoft Foundry resource and its model deployments |
| Network to a remote account | none: the network belongs to the compute | private endpoint (classic compute, in the workspace VNet) or an NCC private endpoint rule (serverless) |

The access connector is an Azure resource, not a workspace object. Catalogs, credentials and model provider services belong to the metastore and are bound to the workspace; drawing them in a team's slice is fine, and the metastore's description says so.

**Permissions on the arrows.** Label arrows between Databricks objects with Unity Catalog privileges (`USE CATALOG`, `READ FILES`, `EXECUTE`, `READ` on a secret scope). Label arrows into Azure resources with the Azure role (`Storage Blob Data Contributor` or `Reader`, `Key Vault Secrets User` held by the AzureDatabricks application, `Azure AI User` on Foundry). When the arrow would cross the diagram, put the role in the target's description instead ("Azure AI User: id-dbx-eng").

**The slice pattern** (`ds example azure-architecture --n 5`):

- The workspace is the big rectangle in the middle; each team is an identical `group` slice inside it, generated from one template so labels have the same lengths.
- The metastore and Unity Gateway sit outside the workspace (left, or above), with an "Attached" arrow into it.
- Each slice's Azure resource group sits directly under its slice; the shared storage account runs across the bottom, one container under each slice; Foundry sits above.
- Order each Azure row to match the slice above it (Key Vault under the secret scope, access connector under the credentials, managed identity over its container), so every line runs straight.
- Number the first slice only, and say in the last step that every slice repeats it.
- Keep box text to one line (about 20 characters for a label, 25 for a description). Boxes side by side share one size.
- Detailed designs grow wide: use `"canvas": { "aspect": "auto" }` and `"workflow": "bottom"`, and say it is a document diagram, not a slide.

**Facts that change.** Databricks renames and re-scopes these features often, so check the current docs before drawing and correct the user's terms gently. As of October 2026:

- Models outside Databricks (Microsoft Foundry, Azure OpenAI) are **model provider services**, Unity Catalog securables queried through **Unity Gateway** with `EXECUTE`. They authenticate with an API key, an Entra service principal, or a service credential. They were formerly "external models" behind "AI Gateway".
- **Serverless budget policies** attribute serverless usage to a group and feed budget alerts; they do not stop spend. **Unity Gateway budgets** can alert and block, including model provider spend.
- Foundry's inference role is **Azure AI User** (rolling out as "Foundry User"); Azure OpenAI also has **Cognitive Services OpenAI User**.
- Reading another subscription or region: an external location, `Storage Blob Data Reader` for the credential's identity (same Entra tenant), and a private endpoint the account owner approves. Data that another metastore governs is better shared with **Delta Sharing**. Cross-region reads cost egress.

## How Diagram Studio applies this style

| Convention | In the spec |
| --- | --- |
| Databricks products as official icons | `"service": "<slug or former name>"` (`unity-catalog`, `dlt`, `jobs`). In an Azure diagram, prefix it: `"databricks:unity-catalog"` |
| Cloud services | Azure icons by id; a name both catalogs know (`ai-search`) means the Databricks product here, and `"azure:ai-search"` means Azure AI Search |
| The boundaries above | `"boundary"`: `databricks-account`, `cloud-account`, `plane`, `workspace`, `platform`, `panel`, `stage`, `unity-catalog`, `bronze`, `silver`, `gold` (plus all the Azure kinds) |
| Amber then blue numbered paths | `"step"` on flows; `"flowTypes"` for a second path |
| Steps list | `"steps"`, drawn as a panel and copied into the speaker notes |
| No title in the image (documents) | `"frame": "figure"` |
| Databricks look | the `databricks` theme (default for this type): DM Sans, navy, grey-blue connectors, oat panels, lava for the account and Unity Catalog |
