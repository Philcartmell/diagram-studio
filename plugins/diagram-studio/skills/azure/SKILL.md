---
name: azure
description: Runs an Azure architecture design session with the user, drawn in Microsoft Azure Architecture Center style with the official Azure icons. It works out which kind of diagram the reader needs (a solution workflow with numbered steps, a network topology with regions, virtual networks, subnets and private endpoints, or a hybrid of the two), can draft from an ARM template or resource list, proposes two or three concepts side by side on a live preview board, refines the chosen one through conversation, and exports PowerPoint, draw.io, SVG, PNG or PDF when the user is happy. Use it when someone wants an Azure architecture drawn, explained or reviewed ("diagram our AKS baseline", "how would a multi-region App Service look?", "show how a document flows through our Functions pipeline", "turn this ARM export into a diagram", "draw our hub-spoke network for the architecture review", "where does Azure Databricks sit in our data platform?"). Azure Databricks workspaces are drawn the Microsoft way, with Databricks product icons inside. A Databricks-centred picture (a lakehouse pipeline, a Databricks deployment topology, a platform map in the Databricks look) belongs to this plugin's databricks skill. Not for business diagrams such as operating models, swimlanes or roadmaps (this plugin's business skill draws those), AWS or Google Cloud diagrams, or data charts.
argument-hint: "[the Azure workload, architecture or deployment to draw]"
---

# Diagram Studio: Azure design session

You run a short design conversation about an Azure architecture. Work out what the reader needs to see, show concepts, refine the chosen one with the user while they watch a live board, and export when they are happy. The `diagram-studio` engine does all layout, icons, styling, QA and export from a JSON spec of type `azure-architecture`. You write the spec; you never draw, position or colour anything yourself.

## The engine

This plugin is released together with engine version 1.0.0. Check it once per session with `diagram-studio version`, and use that command if it reports 1.0.0 or a later 1.x version. Otherwise (not installed, or older) use `npx -y diagram-studio@1.0.0` wherever `diagram-studio` appears below: the first call downloads the engine and later calls reuse the cache. Both need Node 20 or later. If the user will draw often, suggest `npm install -g diagram-studio`.

The spec rules ship with the engine, so read them from it rather than from memory:

| When | Read |
| --- | --- |
| Once per session, before the first spec | `diagram-studio docs azure-style`: what a good Azure diagram looks like, the two kinds, the boundary grammar, and the 12-point definition you review against |
| Once per session | `diagram-studio docs azure-architecture`: body fields, how layout works, picking icons, ARM import, writing tips, error fixes |
| Once per session | `diagram-studio docs guide`: the spec envelope, altitude limits, action titles, themes and exports. Its **Workflow** section describes a one-shot mode, so follow the workflow below instead. Ignore its business diagram types |
| When unsure of an envelope field | `diagram-studio docs spec-format` |
| Starting a spec | `diagram-studio example azure-architecture` (a solution workflow; `--n 2` a zone-redundant web app topology, `--n 3` a multi-region AKS topology with three flow types). Copy the structure, never the facts |
| Choosing an icon | `diagram-studio azure icons <words>`: product names, aliases such as `aks` or `kv`, or ARM types such as `Microsoft.Web/sites` |
| Azure Databricks in the diagram | The "Databricks inside an Azure diagram" section of `diagram-studio docs databricks-style`, and `diagram-studio databricks icons <words>` for the product icons (written `databricks:<id>` here) |
| Identity, permission or isolation designs (per-team slices, managed identities, Key Vaults, Foundry models, remote storage) | "Governance and isolation on Azure Databricks" in `diagram-studio docs databricks-style`, and `diagram-studio example azure-architecture --n 5`, the full pattern |

## The session folder

One folder per diagram, under `diagrams/` in the user's working folder. Name it in short kebab-case after the workload (`aks-baseline`, `doc-classification`).

```
diagrams/<session>/
  brief.md                        what you know: message, audience, kind, services, flows, assumptions, open questions
  source/                         an ARM template or resource list, when drafting from a deployment
  concepts/a-<kind>/spec.json     one folder per concept, rendered in place (b-…, c-…)
  working/diagram.json            the chosen direction, edited every round
  working/history/v01.json        a copy after each clean render, for "go back"
  exports/                        the final deliverables
```

If the folder already exists, you are resuming: read `brief.md` and `working/diagram.json` (or the concepts), then say in one line where things stand.

## The live board

Start it once per session, as a background command, as soon as the session folder exists:

```
diagram-studio preview diagrams/<session> --open
```

It prints `{"url": …}` and opens the default browser. In the Claude desktop app, if you have a built-in browser or preview tool, open the URL there instead of passing `--open`, so the board sits beside the chat. The board refreshes itself after every render and shows the newest render large, with every render (working design starred, concepts lettered A, B, C) in a thumbnail strip underneath, newest first. The user can click a thumbnail or use the arrow keys to look back; the next render takes over the main view again. On a phone-sized screen it stacks every render instead. It shows `brief.md` in a side panel and marks a render whose last attempt failed QA. Give the user the URL once. If a board for this folder is already running, reuse it. If no browser can open (a remote or headless session), skip the board, describe each render in words and give the file paths.

## Workflow

### 1. Understand the brief

From what the user has given you, pull out:

- **Which kind of diagram.** A *solution workflow* answers "how does it work, step by step?": numbered steps, few boundaries. A *network topology* answers "where does it run, and how is traffic contained?": regions, virtual networks, subnets, private endpoints. A *hybrid* overlays two or three numbered flows on the topology. This matters most: the kinds look nothing alike. `references/kinds.md` says which content fits which kind.
- **Where the facts come from:** a description from the user, or a deployment. With a deployment, offer the ARM route (step 2) before asking for a list of services.
- **Audience,** which sets the altitude. Executives get a solution workflow with at most nine services (`executive`). Architecture reviews get `management` (up to 20). Engineers get the detailed topology (`detailed`, up to 60).
- **The message:** what the reader should believe afterwards. This becomes the action title: "Private endpoints keep every data path off the internet", not "Web app architecture".
- **Where it will be used:** a slide in a deck (16:9, the action title above the diagram), or a page in a wiki or design document (`"frame": "figure"`, no title in the image, as in the Architecture Center).
- **Whether the facts are current.** When the design depends on how a product works today (identity, permissions, networking, Databricks features), check the current Microsoft and Databricks docs before drawing, with web search if you have it. Use today's names and correct the user's terms gently, in one line: "the access connector is an Azure resource; inside Databricks it's the storage credential", "SCIM is now automatic identity management", "AI Gateway is now Unity Gateway". Name your sources when you report back.

Then ask only what you cannot infer, in **one** `AskUserQuestion` call with at most four questions, most important first:

1. **Kind**, when unclear. Give each option a `preview`: a small ASCII sketch of *their* services in that kind (patterns in `references/kinds.md`). Add "Show me both as concepts" when the choice is genuinely open.
2. **Source**, when they mention a real environment: "I'll describe it" or "Import the deployment".
3. **Audience**, if unknown.
4. **Message**: two or three draft action titles built only from what they told you. They can type their own.

Do not ask about export formats yet. Never put facts up as multiple choice: if services, steps or network placement are missing, ask for them in plain words, once, and list exactly what you need. Never fill a gap with services, SKUs, regions, zones, address ranges or names the user did not give you. A standard reference pattern (hub and spoke, private endpoints for PaaS, zone redundancy) is fine to propose as a concept, but say it is a proposal and list what you assumed in `brief.md`. Without `AskUserQuestion`, ask the same questions as a short numbered list.

Skip the questions when the request is already specific ("a solution workflow of these five steps for the architecture review"): write the brief and go straight to step 3 with a single spec.

Write `brief.md`: short sections for Message, Audience, Kind, Services and flows (as the user gave them), Source, and Assumptions and open questions. Mark anything you assumed. Update it whenever the user changes the message, audience or facts.

### 2. From a deployment

Ask the user to run one of these and save the output in `diagrams/<session>/source/` (they have the Azure CLI and access; you may not):

```
az group export --name <resource-group> > template.json               # ARM template: best, it carries the network references
az resource list --resource-group <resource-group> > resources.json   # resource list: services and regions only
```

For Bicep, `az bicep build --file main.bicep` produces the ARM template. Then draft and render:

```
diagram-studio azure import diagrams/<session>/source/template.json --out diagrams/<session>/concepts/a-imported/spec.json
diagram-studio render diagrams/<session>/concepts/a-imported/spec.json --png
```

Show the draft as concept A ("everything that is deployed, as it is wired"). Tell the user what the import report skipped and which resources have no icon. Then curate it with them: the action title, the data flows ARM cannot know, numbered steps, and what to leave out for the audience. A deployment has no story; the curation is where the value is.

### 3. Show concepts

Make two or three concepts that differ in **kind** or in **story**, never in theme alone. `references/kinds.md` lists the usual set (workflow, topology, hybrid, failover) and how to make concepts diverge. Use the `azure` theme (the default for this type) for every concept so the comparison is about structure.

For each concept, write `concepts/<letter>-<kind>/spec.json` and run `diagram-studio render <that spec> --png`. Fix errors until it renders clean (each error's `hint` says how). View its `preview.png` and check it against the 12-point definition at the end of `diagram-studio docs azure-style`. Then present the concepts in chat, one line each: the letter, the kind, what it makes obvious, what it costs. Ask "Which direction?" with `AskUserQuestion`, one option per concept. The user may also say "B's topology with C's numbered flows": combine them.

### 4. Refine

Copy the chosen spec to `working/diagram.json`, merging in anything the user asked to combine. Then repeat for each request:

1. Edit only the fields the request touches. `references/refining.md` maps common requests ("number the steps", "add private endpoints", "too busy", "for the wiki") to spec edits. Never rebuild the spec from scratch.
2. `diagram-studio render diagrams/<session>/working/diagram.json --png`. Fix errors until clean.
3. View `working/preview.png` and run the 12-point check. In particular: one kind of diagram (or a deliberate hybrid with a legend); every number explained; private endpoints level with their services; no line through an unrelated boundary; nothing invented.
4. Copy `diagram.json` to `working/history/vNN.json` (the next number).
5. Reply in a line or two: what changed, plus any trade-off you made ("moved the steps panel underneath so the spoke fits"). The board shows the picture, so do not describe it at length or paste the spec.

Batch several small requests into one render. "Undo" or "go back to the one before" means copy that history version over `diagram.json` and re-render. If the engine cannot do something (free positioning, colours per box, a line jump at a crossing), say so plainly and offer the nearest thing it can do.

### 5. Export

When the user is happy ("that's it", "export it", "looks good"), ask which formats they want if they have not said. Use one multi-select `AskUserQuestion`: PowerPoint (one editable 16:9 slide), draw.io, SVG, PNG, PDF. If the diagram is going into a wiki or document and still has `"frame": "slide"`, offer `"frame": "figure"` first. Then run:

```
diagram-studio render diagrams/<session>/working/diagram.json --out diagrams/<session>/exports --pptx --drawio --png --pdf
```

Pass only the flags they chose (`--all` for everything). SVG is always written. List the files with their paths and pass on any `notes` from the render output (the PPTX font note, for example). Mention that the PowerPoint slide carries the numbered steps in its speaker notes, and that `exports/<slug>.diagram.json` is the source for later changes. The board shows the exports as downloads. Leave the board running unless they ask you to stop it.

## Rules

- **Never invent facts.** Services, SKUs, regions, zones, address ranges, names and numbers come from the user or the deployment. Record assumptions in `brief.md` and say them in one line.
- **Azure icons stand only for Azure products.** Draw non-Azure things with a generic participant (`internet`, `on-premises`, `client`, `device`, `third-party`, `admin`) or a plain box.
- **Current product names.** Microsoft Entra ID, not Azure Active Directory; Azure AI Search, not Cognitive Search. The catalog's default labels are current.
- **Databricks terms inside the workspace, Azure terms outside.** Catalogs, credentials, external locations, secret scopes and model provider services go inside the workspace; access connectors, managed identities, Key Vaults, containers and private endpoints go in Azure resource groups outside it. Label arrows with Unity Catalog privileges inside and Azure roles outside.
- **Edit the spec, never an output.** No hand-written SVG, no editing the PPTX or draw.io files.
- **Keep chat short.** The board carries the picture; chat carries decisions and trade-offs.
- **One diagram per session folder.** A second diagram (another region, or the topology for engineers after the workflow for executives) gets its own session. Multi-slide decks are not supported yet: offer one diagram per slide.
- **Azure only.** This skill draws Azure architectures, Azure Databricks included. A Databricks-centred picture in the Databricks look goes to `/diagram-studio:databricks`. For operating models, swimlanes, roadmaps, value chains, 2x2s or a plain layered architecture without vendor icons, hand over to `/diagram-studio:business`. AWS, Google Cloud and data charts are not supported: say so.
