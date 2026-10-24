# operating-model

Layers of capability top-down: who is served (customers) on top, capability layers in the middle, foundations underneath, governance at the side. Answers "how are we organised to deliver?".

**Use for:** target operating models (TOMs), shared-service designs, function blueprints (finance, HR, IT, procurement), "centres of excellence / business partners / service centre" models.
**Not for:** step-by-step processes (use `swimlane`), timelines (`roadmap`), system stacks for technical readers (`layered-architecture`), reporting lines (org charts are v2).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `customers` | no | `{ "label": "Business units", "items": ["Retail", "Commercial"] }` — who the model serves; 1–8 short items, drawn as pills in the top band |
| `layers[]` | yes | 1–6 layers, top to bottom. Each `{ id, label, description?, emphasis?, status?, nodes[] }` with 1–12 nodes |
| `layers[].nodes[]` | yes | Standard nodes (see spec-format). These count toward the altitude node limit |
| `foundations` | no | Array of 1–8 short strings (platforms, data, controls) drawn as tiles in the bottom band |
| `foundationsLabel` | no | Band heading; default "Foundations" |
| `governance` | no | `{ label, description?, items?, position?: "left" \| "right" }` — a side bar spanning the layers (default right) |

Only layer nodes count toward the node limit; customers, foundations and governance frame the picture.

**Layout:** bands fill the canvas height; nodes in a layer share one width (wrapping to two rows past ~6 per layer at 16:9); all nodes share one height. A layer's `emphasis` tints the whole band and outlines its nodes in the accent colour; a node's `emphasis` tints just that box. An anchored callout takes a side column (opposite governance) with a short leader to its anchor; an unanchored callout is a bar under the model, which usually balances the page better.

Process-named capability towers ("Record to report", "Purchase to pay") are fine as nodes: they name a capability, not a sequence of steps.

## Writing tips

- **Executive:** 3–4 layers, 1–3 nodes each, names only, the layer the title is about accented. Badge it `"status": "new"` only if the user described it as new (a target state they are creating counts). The callout states the point in the user's terms; use a figure only if they gave it.
- **Management:** add `description` (what the layer or team does) and `owner`; one `metric` per node at most.
- **Detailed:** up to ~10 nodes per layer, `tags` for a second dimension, `status` for changes, `legend: "auto"`; consider `"canvas": { "aspect": "auto" }` beyond ~30 nodes.
- Order layers from closest-to-customer to most shared/foundational.
- Layer labels are roles or groupings ("Business partnering", "Centres of expertise"), node labels are capabilities or teams.

Names, figures and dates in the examples below are illustrative. Copy the structure, not the facts.

## Example: executive

```json
{
  "version": "1.0",
  "type": "operating-model",
  "altitude": "executive",
  "title": "A shared finance hub frees business partners to focus on decisions",
  "subtitle": "Target finance operating model, 2027",
  "callout": { "text": "40% of transactional effort moves to the hub", "anchor": "hub" },
  "body": {
    "customers": { "label": "Business units", "items": ["Retail", "Commercial", "Wealth"] },
    "layers": [
      { "id": "partnering", "label": "Business partnering", "nodes": [
        { "id": "bp", "label": "Finance business partners", "description": "Embedded in each unit" }
      ]},
      { "id": "expertise", "label": "Centres of expertise", "nodes": [
        { "id": "fpa", "label": "FP&A" },
        { "id": "tax", "label": "Tax & Treasury" },
        { "id": "control", "label": "Financial control" }
      ]},
      { "id": "hub", "label": "Finance hub", "emphasis": "accent", "status": "new", "nodes": [
        { "id": "r2r", "label": "Record to report" },
        { "id": "p2p", "label": "Purchase to pay" },
        { "id": "o2c", "label": "Order to cash" }
      ]}
    ],
    "foundations": ["Single ERP", "Data & reporting platform", "Controls framework"],
    "governance": { "label": "Finance leadership team", "position": "right" }
  }
}
```

## Example: management

```json
{
  "version": "1.0",
  "type": "operating-model",
  "altitude": "management",
  "title": "HR moves routine work to one service centre and keeps advice close to leaders",
  "subtitle": "People function operating model, target state 2027",
  "body": {
    "customers": { "label": "Served", "items": ["Employees", "Line managers", "Leadership team"] },
    "layers": [
      { "id": "advisory", "label": "HR business partners", "description": "Strategic advice by division", "nodes": [
        { "id": "bp-ops", "label": "Operations partner", "owner": "COO division" },
        { "id": "bp-commercial", "label": "Commercial partner", "owner": "CCO division" },
        { "id": "bp-corporate", "label": "Corporate partner", "owner": "CFO division" }
      ]},
      { "id": "coe", "label": "Centres of excellence", "description": "Policy and programme design", "nodes": [
        { "id": "reward", "label": "Reward", "description": "Pay, benefits, recognition" },
        { "id": "talent", "label": "Talent", "description": "Hiring, careers, succession", "status": "changed" },
        { "id": "learning", "label": "Learning", "description": "Academies and skills" }
      ]},
      { "id": "service-centre", "label": "People service centre", "description": "Tier 1 and 2 support", "emphasis": "accent", "status": "new", "nodes": [
        { "id": "helpdesk", "label": "People helpdesk", "metric": "80% first-contact resolution" },
        { "id": "payroll", "label": "Payroll & admin" },
        { "id": "onboarding", "label": "Onboarding" }
      ]}
    ],
    "foundations": ["HR platform", "Employee self-service", "People data"],
    "governance": { "label": "People leadership team", "description": "Sets priorities and policy", "position": "left" }
  }
}
```

A detailed example with tags, statuses, a legend and a footer: `ds example operating-model --n 3`.

## Common mistakes

- **Listing processes instead of capabilities.** An operating model shows who does what kind of work, not the steps. Steps belong in a swimlane.
- **More than ~5 nodes per layer at executive altitude.** Group them ("Transaction processing") or raise the altitude.
- **Accenting several layers.** Accent the one layer the title is about; use `status` for other changes.
- **Repeating the layer name in each node** ("Hub: R2R", "Hub: P2P"). The band already says it.
- **Governance as a layer.** Put oversight bodies in `governance`, not in `layers`.
