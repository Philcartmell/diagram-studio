# Diagram Studio

A plugin for Claude Code and GitHub Copilot that designs diagrams with you. Describe what you need, or point it at an ARM export. Your agent works out what the reader needs to see, shows two or three concepts on a live preview board, refines the one you pick, and exports editable PowerPoint, draw.io, SVG, PNG or PDF.

<table>
<tr>
<td align="center" width="14%"><a href="#example-azure"><img src="docs/images/example-azure.png" alt="Azure workflow" width="110"></a><br><sub>Azure workflow</sub></td>
<td align="center" width="14%"><a href="#example-landing-zone"><img src="docs/images/example-landing-zone.png" alt="Landing zone reference architecture" width="110"></a><br><sub>Landing zone</sub></td>
<td align="center" width="14%"><a href="#example-business"><img src="docs/images/example-business.png" alt="Operating model" width="110"></a><br><sub>Operating model</sub></td>
<td align="center" width="14%"><a href="#example-swimlane"><img src="docs/images/example-swimlane.png" alt="Swimlane" width="110"></a><br><sub>Swimlane</sub></td>
<td align="center" width="14%"><a href="#example-databricks"><img src="docs/images/example-databricks.png" alt="Databricks lakehouse" width="110"></a><br><sub>Databricks lakehouse</sub></td>
<td align="center" width="14%"><a href="#example-exhibit"><img src="docs/images/example-exhibit.png" alt="Data exhibit" width="110"></a><br><sub>Data exhibit</sub></td>
<td align="center" width="14%"><a href="#example-deck"><img src="docs/images/example-deck.png" alt="Nine-page deck" width="110"></a><br><sub>Nine-page deck</sub></td>
</tr>
</table>

- **See it as you go.** A live preview board opens in your browser and refreshes after every change. Compare two or three concepts side by side, then refine the one you pick in plain words: "number the steps", "too busy", "add private endpoints".
- **Take it anywhere.** Export an editable PowerPoint slide (native, grouped shapes), a draw.io file, SVG, PNG or a vector PDF. A deck exports as one PowerPoint, PDF or draw.io file.

## Install

You need [Node.js](https://nodejs.org) 20 or later (`node --version`) and one of the coding agents below. Diagram Studio is a plugin: the skills run in your agent, and a small engine does the drawing. The first session downloads the engine through `npx` (about 2 MB) and reuses it afterwards.

### Claude Code

```
/plugin marketplace add Philcartmell/diagram-studio
/plugin install diagram-studio@diagram-studio
```

Or from a terminal: `claude plugin marketplace add Philcartmell/diagram-studio`, then `claude plugin install diagram-studio@diagram-studio`. Restart Claude Code, then start with `/diagram-studio:azure`.

### GitHub Copilot CLI

```bash
copilot plugin marketplace add Philcartmell/diagram-studio
copilot plugin install diagram-studio@diagram-studio
```

Then ask for the diagram you want in plain words.

### VS Code with GitHub Copilot

1. Turn on the `chat.plugins.enabled` setting.
2. Add the marketplace to your user settings:

   ```json
   "chat.plugins.marketplaces": ["Philcartmell/diagram-studio"]
   ```

3. Install it from the Extensions view (search `@agentPlugins`), or from the Command Palette with **Chat: Open Customizations**, then **Plugins**, then **Browse Marketplace**. You can also run **Chat: Install Plugin From Source** and give it `https://github.com/Philcartmell/diagram-studio.git`.
4. Open Copilot Chat in **Agent** mode and ask for the diagram you want. **Chat: Configure Skills** lists the four skills.

### Another agent that reads Agent Skills

Copy the four folders from [`plugins/diagram-studio/skills`](plugins/diagram-studio/skills) into your project's `.github/skills/` (or `.claude/skills/`). The agent picks a skill from its description when you ask for a diagram.

### Optional: install the engine yourself

```bash
npm install -g diagram-studio
```

This skips the `npx` download on the first run, and it is how you use the engine on its own (see [The engine on its own](#the-engine-on-its-own)).

## Skills

In Claude Code, start one with its slash command. In Copilot, ask in plain words and the matching skill loads.

| Skill | Draws |
| --- | --- |
| `/diagram-studio:azure` | Azure architectures in the style of the Microsoft Azure Architecture Center, with the official Azure icons: solution workflows, network topologies, or a draft from your deployment. Azure Databricks workspaces included |
| `/diagram-studio:databricks` | Databricks architectures in the Databricks brand look, with the official Databricks product icons: lakehouse and medallion pipelines, workspace deployment topologies, platform maps |
| `/diagram-studio:business` | Business slides for leadership packs: operating models, swimlanes, roadmaps, value chains, 2x2 matrices and layered architectures, and consulting-style data exhibits (bar and column charts, waterfalls, line charts, KPI figures, and slides that combine them with text) |
| `/diagram-studio:deck` | Decks: agree the storyline, then build every page from any of the above and export one PowerPoint, PDF or draw.io file with consistent titles, theme, classification and page numbers |

## Examples

Each diagram below is drawn from the prompt above it: everything on it comes from the prompt, and the names and facts are made up. A prompt this specific goes straight to a diagram; a vaguer one gets a few questions first and two or three concepts to choose from on the live preview board.

<a id="example-azure"></a>

**Azure: a solution workflow**

```
/diagram-studio:azure For the architecture review: shoppers check out over HTTPS through Azure Front Door to our
storefront web app in UK South. The storefront puts each order on a Service Bus queue, and an order processor Function
stores it in Cosmos DB and sends it to our warehouse system. Application Insights and Key Vault support it. The message:
orders reach the warehouse within a minute of checkout. Put the steps underneath.
```

![An Azure order-processing workflow in UK South: Front Door, a storefront web app, a Service Bus queue, a Function and Cosmos DB, with five numbered steps](docs/images/example-azure.png)

<a id="example-landing-zone"></a>

**Azure: a landing zone reference architecture**

```
/diagram-studio:azure A landing zone reference architecture for the architecture review. Platform subscriptions: Connectivity,
with a hub virtual network holding Azure Firewall, a gateway to our on-premises datacentre, Bastion and a DNS Private Resolver,
plus the private DNS zones; Identity, with domain controllers in their own virtual network, platform managed identities and a
platform Key Vault; and Management, with Log Analytics, Monitor, Defender for Cloud, Policy and Automation. Two application
landing zones, each a spoke peered back to the hub and linked to the private DNS zones: Orders (a container app reaching
Azure SQL and Key Vault through private endpoints) and Storefront (Application Gateway with WAF, a web app, and storage
through a private endpoint). The point to land: every landing zone peers back to one platform hub for network, DNS and identity.
```

![An Azure landing zone reference architecture: a platform group with Connectivity, Identity and Management subscriptions, and two application landing zones whose spoke networks peer back to the hub network and link to the private DNS zones, with private endpoints to their data services](docs/images/example-landing-zone.png)

<a id="example-business"></a>

**A business slide: an operating model**

```
/diagram-studio:business A slide for the ExCo on our target procurement operating model. We serve three divisions:
Manufacturing, Logistics and Corporate. Category leads (one per spend category) sit on top, a centre of excellence
covers contracts, supplier risk and spend analytics, and a new procure-to-pay hub handles requisitions, purchase
orders and invoice processing. Foundations: our source-to-pay platform, supplier master data and delegated authority.
The procurement board governs it. The point to land: the hub frees category teams to negotiate, not process.
```

![A procurement operating model: category leads, a centre of excellence and a new procure-to-pay hub serving three divisions, on three foundations, governed by the procurement board](docs/images/example-business.png)

<a id="example-swimlane"></a>

**A process: a swimlane**

```
/diagram-studio:business Swimlane of our current complaint handling for the operations leadership team. The customer
raises a complaint, the contact centre logs it, and the complaints team investigates and checks whether it's a
regulated product. If it is, Legal reviews it, which takes about 6 days on average. Then the complaints team sends the
final response, and the contact centre closes the case and sends a survey. Phases: log, investigate, resolve.
```

![A complaint handling swimlane across customer, contact centre, complaints team and Legal, with the six-day legal review highlighted](docs/images/example-swimlane.png)

<a id="example-databricks"></a>

**Databricks: a medallion lakehouse**

```
/diagram-studio:databricks Our medallion lakehouse for the data platform review. Lakeflow Connect ingests our
operational apps and Auto Loader picks up new files from cloud storage. Raw events land in bronze, are cleaned into
silver orders and aggregated into gold daily KPIs. A SQL warehouse serves AI/BI dashboards and Genie, and Unity Catalog
governs it all with lineage and data quality monitoring.
```

![A Databricks medallion pipeline in the Databricks look: sources, ingest, bronze, silver and gold, serve and analyse stages over a Unity Catalog band](docs/images/example-databricks.png)

<a id="example-exhibit"></a>

**A data exhibit: the argument, the chart and the headline numbers**

```
/diagram-studio:business One exhibit for the board on pooling fleet charging. Annual charging cost in £ millions,
split into grid connections, chargers and electricity: 2030 separate depots 20 / 90 / 260, pooled 30 / 80 / 200;
2040 separate 10 / 340 / 1,050, pooled 110 / 290 / 700. Operating cost is 240, 220, 820 and 760. Show the saving
between the options in each year, the 2040 saving as the headline, and three supporting points on the left:
£110m a year in grid connections and hubs, £350m lower electricity cost, over £2bn saved to 2040.
```

![An exhibit: three bullet points on the left, stacked columns of fleet charging costs for 2030 and 2040 with computed totals, −60 and −300 difference arrows and operating-cost badges in the centre, and £60M and £300M headline figures on the right](docs/images/example-exhibit.png)

The engine adds up the totals and the differences itself, from the figures you give it.

<a id="example-deck"></a>

**A deck: several pages, one file**

```
/diagram-studio:deck A nine-page steering committee pack on the platform and fleet charging investment case, confidential.
Use the fleet charging exhibit, the margin bridge and the cloud survey charts as evidence, then the finance operating model,
the medallion pipeline and the claims portal architecture with its cost case.
```

![A contact sheet of a nine-page deck: a title page, two section dividers, chart exhibits, an operating model, a Databricks pipeline and an Azure architecture beside a cost waterfall, every page with its tracker tag, action title in the same place, classification and page number](docs/images/example-deck.png)

## How it works

Claude never draws anything itself. It writes a JSON spec, and a deterministic renderer (the [`diagram-studio`](engine/README.md) npm package, in [`engine/`](engine/)) does the layout, icons, styling, quality checks and export. Same spec, same picture, every time. The domain knowledge lives in the engine: the Azure style definition (from an analysis of 14 Microsoft reference architectures), the Databricks style definition (from 17 Databricks diagram sources and Microsoft's Azure Databricks diagrams), the Azure and Databricks icon catalogs, the layout rules and the ARM importer. The skills run the conversation.

## What you get

**Azure** (`/diagram-studio:azure`)

- **The right kind of diagram.** A *solution workflow* ("how does it work, step by step?") with green numbered steps and a workflow panel; a *network topology* ("where does it run, and how is traffic contained?") with regions, virtual networks, subnets, NSGs and private endpoints; or a *hybrid* that traces two or three flows across the topology, each with its own badge shape and a legend.
- **From your deployment.** Give it an ARM template (`az group export`, or a Bicep file built with `az bicep build`) or a resource list. It drafts the architecture as deployed, then curates it into a story with you.
- **Microsoft's house style.** The official icons (637 of them, with official names, about 400 aliases and ARM resource types), never recoloured or distorted. Boundaries nest the standard way (Azure > region > virtual network > subnet > zone), and lines run left to right without crossing unrelated boundaries.

**Databricks** (`/diagram-studio:databricks`)

- **The right kind of diagram.** A *use-case data flow* (stages from sources to consumers, bronze, silver and gold layers, Unity Catalog underneath, numbered steps); a *deployment topology* (what runs in the Databricks account and what in your cloud account); or a *platform reference map* (the navy platform block of workload panels between your sources and consumers).
- **Databricks' house style.** DM Sans, navy and grey-blue, oat panels, lava kept for the Databricks account and Unity Catalog, amber and blue numbered paths. The official product artwork for 71 Databricks products, with former names (Delta Live Tables, Workflows, Vector Search) understood.
- **Databricks inside Azure.** In an Azure diagram, an Azure Databricks workspace holds Databricks product icons, the Microsoft way: control plane outside your subscription, VNet injection, medallion layers beside ADLS Gen2.
- **Governance designs on Azure Databricks.** Who can reach which data, models and secrets, through which identity: one slice per team in a shared workspace, with Entra groups, catalogs, storage and service credentials, access connectors and managed identities, Key Vault-backed secret scopes, Microsoft Foundry models through Unity Gateway and sources in other subscriptions. Databricks terms stay inside the workspace, Azure terms outside, and every arrow carries its permission. `diagram-studio example azure-architecture --n 5` is the full pattern.
- **Current names.** Databricks renames features often (Delta Live Tables, Workflows, AI Gateway). The skills check current docs when a design depends on how a product works today, and say when your term has changed.

**Business** (`/diagram-studio:business`)

- **The form that fits the content.** Layers for who serves whom, lanes for handoffs, horizons for what happens when, a chain for how value flows, a 2x2 for where to focus. Concepts differ in form or story, not just in colour.
- **Written for leaders.** Every title states the finding ("Invoices over £10k wait two days for a second approval"), and the renderer enforces how much detail each audience gets.
- **Your brand.** Seven themes, from boardroom navy to hand-drawn sketch, or a contrast-checked theme built from your brand colours.
- **Charts the consulting way.** Figures on the data rather than on an axis, totals and difference arrows computed from your values (a waterfall whose total does not add up is refused), series named beside the bars, one accent. Exhibits put a chart beside its argument, line up small multiples, or set an Azure or Databricks architecture next to the numbers that justify it.

**Decks** (`/diagram-studio:deck`)

- **Storyline first.** Claude drafts one action title per page and agrees them with you before drawing; the render writes them out as a storyline so you can check the argument.
- **Any page type.** Business diagrams, charts, exhibits, Azure and Databricks architectures, title pages and section dividers. A page can point at a diagram you designed in another session, so later edits there flow into the deck.
- **Consistent by construction.** One theme and canvas, every action title in the same place, "Exhibit N" trackers, classification and page numbers on every page. One PowerPoint (a slide per page), one bookmarked PDF, one draw.io file with a tab per page.

**All the skills**

- **Pitched at the audience.** Executive (at most 9 boxes or services), management (up to 20) or detailed (up to 60), with fix-it messages when a diagram carries too much.
- **Exports you can keep editing.** A PowerPoint slide of native, grouped shapes, a draw.io file, SVG, PNG and vector PDF.

## Use

Ask for the diagram you want, or start a session explicitly:

```
/diagram-studio:azure Our AKS baseline for the architecture review: hub and spoke, private endpoints, two regions
/diagram-studio:databricks Our medallion lakehouse: orders and clickstream into bronze, silver and gold, served to Power BI
/diagram-studio:business A slide for the ExCo on our IT operating model: service desk, platform engineering and architecture
```

Other things to try:

- "Show the ExCo how an uploaded document flows through our Functions pipeline to the chat app"
- "Here's `az group export` for rg-orders-prod. Turn it into a diagram for the security review"
- "What happens when East US 2 goes down? Show the failover"
- "How does our Databricks workspace deploy into our Azure subscription? Show the control plane and VNet injection"
- "Map our Databricks platform for the steering group"
- "Show how each team in our shared Databricks workspace is kept apart: their groups, catalogs, storage, identities and Key Vaults"
- "Add Foundry models for the data science team, through Unity Gateway, using the team's own managed identity"
- "Help me visualise our invoice approval process across four teams"
- "A 2x2 of our initiatives: value against effort"

Each diagram gets a session folder in your working folder:

```
diagrams/<name>/
  brief.md              the message, audience, content and what Claude assumed
  source/               your ARM template or resource list, if you gave one (Azure)
  concepts/a-…/         the concepts Claude proposed, side by side
  working/              the chosen design, with history/ for "go back to the previous one"
  exports/              the files you asked for, plus the spec for later changes
```

The preview board opens in your browser and refreshes after every change. In the Claude desktop app, Claude can open it in the built-in browser beside the chat. Refine it in plain words: "make finance stand out", "number the steps", "add private endpoints", "too busy", "for the wiki".

**Your own themes and icons** live in your user folder: `%APPDATA%\diagram-studio` on Windows, `~/.config/diagram-studio` elsewhere (`diagram-studio version` prints it). For example, Microsoft ships the Entra ID icon outside the Azure icon pack. Save the official SVG there as `azure-icons/entra-id.svg` and Claude can use it.

## Update

**Claude Code:**

```bash
claude plugin marketplace update diagram-studio
claude plugin update diagram-studio@diagram-studio
```

(or use the `/plugin` menu), then restart Claude Code.

**GitHub Copilot CLI:** run `copilot plugin marketplace update diagram-studio`, then `/plugin update diagram-studio` in a session.

**VS Code:** run **Extensions: Check for Extension Updates**, or turn on `extensions.autoUpdate`.

Each plugin release names the engine version it was tested with, so the plugin and engine stay in step. If you installed the engine globally, update it too: `npm install -g diagram-studio`.

## The engine on its own

The renderer works without Claude, from any script or pipeline:

```bash
npm install -g diagram-studio
diagram-studio example azure-architecture > diagram.json
diagram-studio render diagram.json --all --out out
diagram-studio azure import template.json --out draft.json
diagram-studio databricks icons unity catalog
diagram-studio docs guide
```

See [`engine/README.md`](engine/README.md).

## Develop

```bash
git clone https://github.com/Philcartmell/diagram-studio
cd diagram-studio/engine
npm ci            # installs dependencies and builds scripts/dist/
npm link          # your `diagram-studio` command now runs this checkout (undo: npm unlink -g diagram-studio)
npm test          # the full suite: golden renders, acceptance, stress, exports, CLI, docs
npm run azure-icons -- "<Azure icon pack>/Icons"              # refresh the Azure icons (the Azure Architecture Center download)
npm run databricks-icons -- databricks-architecture-icons-all.zip   # refresh the Databricks icons (the pack's "Download all" zip)
cd ..
claude --plugin-dir ./plugins/diagram-studio   # load the plugin from the folder; skill edits apply on the next start
```

```
.claude-plugin/marketplace.json     the marketplace (this repository)
plugins/diagram-studio/             the plugin, one skill per domain:
  skills/azure/                       Azure architectures (Azure Databricks included)
  skills/databricks/                  Databricks architectures
  skills/business/                    business diagrams
engine/                             the npm package "diagram-studio": source, assets, docs, tests
tools/release.mjs                   keeps the one shared version in step; see RELEASING.md
.github/workflows/                  CI on Windows, macOS and Linux; release on a version tag
```

Each domain is a skill folder in the plugin plus what the engine needs to draw it well: a style definition, an icon catalog, boundary kinds and a theme. Databricks was added that way; see [ROADMAP.md](ROADMAP.md) for what is next.

Releases: [RELEASING.md](RELEASING.md). Changes: [CHANGELOG.md](CHANGELOG.md).

## Licences

The code is MIT ([LICENSE](LICENSE)). The bundled fonts (Inter, IBM Plex Sans, Kalam, Source Sans 3, Selawik, DM Sans) are under the SIL Open Font License, and the Lucide icon subset under ISC; their licence files are in `engine/assets/`. The Azure architecture icons are Microsoft's, used under Microsoft's icon terms: see [`engine/assets/azure-icons/NOTICE.md`](engine/assets/azure-icons/NOTICE.md). The Databricks icons are Databricks' artwork, gathered by a community collection: see [`engine/assets/databricks-icons/NOTICE.md`](engine/assets/databricks-icons/NOTICE.md). Microsoft, Azure and the Azure icons are trademarks of the Microsoft group of companies; Databricks, the Databricks logo and the product names are trademarks of Databricks, Inc. This project is not affiliated with or endorsed by Microsoft or Databricks.
