# layered-architecture

System layers for a non-technical audience: stacked layers of components in plain words, cross-cutting concerns as vertical bars on the right, external parties in a dashed column on the left. Answers "how does the system fit together, and what changes?".

**Use for:** target platform pictures for executives, modernisation stories (what is new, changed, retired), data platform overviews, architecture for steering committees and investment cases.
**Not for:** engineering diagrams with protocols, ports, cloud services or sequence flows (out of scope in v1); organisation design (`operating-model`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `layers[]` | yes | 1–7 `{ id, label, description?, emphasis?, status?, nodes[] }`, top (closest to users) to bottom (closest to data / infrastructure). 1–12 nodes each |
| `crossCutting[]` | no | 0–4 `{ id, label, description?, emphasis?, status? }` — concerns that apply to every layer (security, monitoring, governance) drawn as tall bars on the right |
| `external[]` | no | 0–6 nodes for parties outside the system (partners, regulators, card networks) in a dashed column on the left |
| `externalLabel` | no | Heading for that column; default "External parties" |

Only layer nodes count toward the node limit.

**Layout:** like `operating-model` bands: a header column per layer, an equal-width grid of nodes, one node height across all layers. Cross-cutting bars and the external column span all layers.

## Writing tips

- **Executive:** 3–4 layers, ≤ 9 components, plain words ("Customer data", not "CDP"; "Connects systems", not "ESB"). Accent the layer the title is about and badge it `new`.
- **Management:** add a `description` per layer ("Where people see data") and per key component; 2–3 cross-cutting bars.
- **Detailed:** use `status` to tell a modernisation story (`new`, `changed`, `retired` + `emphasis: "muted"` for what goes away) with `legend: "auto"`.
- Name layers by what they do for the business ("Use", "Trusted data", "Collect"), not by technology tier names, unless the audience is technical.
- Never add protocols, product versions or vendor names the user did not mention.

Names, figures and dates in the examples below are illustrative. Copy the structure, not the facts.

## Example: executive

```json
{
  "version": "1.0",
  "type": "layered-architecture",
  "altitude": "executive",
  "title": "One customer data layer replaces four separate customer records",
  "subtitle": "Target customer platform, for the executive review",
  "body": {
    "layers": [
      { "id": "channels", "label": "Channels", "nodes": [
        { "id": "app", "label": "Mobile app" },
        { "id": "web", "label": "Website" },
        { "id": "branch", "label": "Branches" },
        { "id": "contact", "label": "Contact centre" }
      ]},
      { "id": "services", "label": "Customer services", "nodes": [
        { "id": "onboarding", "label": "Onboarding" },
        { "id": "servicing", "label": "Servicing" },
        { "id": "payments", "label": "Payments" }
      ]},
      { "id": "data", "label": "Customer data", "emphasis": "accent", "status": "new", "nodes": [
        { "id": "single-view", "label": "Single customer view", "description": "One record, shared by every channel" }
      ]}
    ],
    "crossCutting": [
      { "id": "security", "label": "Security & identity" },
      { "id": "monitoring", "label": "Monitoring" }
    ],
    "external": [
      { "id": "credit-bureau", "label": "Credit bureau" },
      { "id": "card-network", "label": "Card network" }
    ]
  }
}
```

## Example: management

```json
{
  "version": "1.0",
  "type": "layered-architecture",
  "altitude": "management",
  "title": "A governed data layer lets every team build on the same trusted numbers",
  "subtitle": "Target data platform, for the investment committee",
  "body": {
    "layers": [
      { "id": "consume", "label": "Use", "description": "Where people see data", "nodes": [
        { "id": "dashboards", "label": "Dashboards", "description": "Board and management packs" },
        { "id": "self-serve", "label": "Self-service analysis" },
        { "id": "models", "label": "AI and forecasting", "status": "new" }
      ]},
      { "id": "trusted", "label": "Trusted data", "description": "One version of the truth", "emphasis": "accent", "nodes": [
        { "id": "metrics", "label": "Shared metrics layer", "description": "Revenue, margin, churn defined once", "status": "new" },
        { "id": "catalogue", "label": "Data catalogue", "description": "Owners and definitions" }
      ]},
      { "id": "ingest", "label": "Collect", "description": "Raw data from source systems", "nodes": [
        { "id": "erp-feed", "label": "ERP" },
        { "id": "crm-feed", "label": "CRM" },
        { "id": "web-feed", "label": "Web & app events" },
        { "id": "files", "label": "Partner files" }
      ]}
    ],
    "crossCutting": [
      { "id": "governance", "label": "Data governance", "description": "Owners, quality, access" },
      { "id": "privacy", "label": "Privacy & security" },
      { "id": "finops", "label": "Cost controls" }
    ]
  }
}
```

A detailed modernisation story with new / changed / retired components: `ds example layered-architecture --n 3`.

## Common mistakes

- **Technical detail for an executive audience** (API versions, protocols, hosting). Move it to a detailed diagram.
- **Arrows between components.** This type shows structure, not flow; for flows across teams use `swimlane`.
- **External systems inside a layer.** Put third parties in `external`.
- **More than ~5 components per layer at 16:9 executive altitude.** Group them.
