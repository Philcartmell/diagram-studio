# Spec format (v1.0)

One diagram is one JSON document: a shared **envelope** plus a type-specific **body**. The spec carries meaning only (roles, emphasis, status). It never carries colours, coordinates or font sizes. Unknown fields are rejected, so typos surface immediately. The full JSON Schema is `schema/diagram.schema.json` (envelope) and `schema/types/<type>.schema.json` (bodies).

## Envelope

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `"1.0"` | yes | |
| `type` | enum | yes | `operating-model`, `swimlane`, `roadmap`, `value-chain`, `matrix-2x2`, `layered-architecture` |
| `altitude` | enum | no | `executive` (default), `management`, `detailed` |
| `theme` | string | no | Theme id; default `boardroom` or the saved default |
| `themeOverrides` | object | no | Token overrides for this diagram only, e.g. `{ "color": { "accent": "#D4001A" } }` |
| `canvas` | object | no | `{ "aspect": "16:9" \| "4:3" \| "A4-landscape" \| "A4-portrait" \| "square" \| "auto" }` |
| `title` | string | yes | Action title stating the finding, ≤ 90 characters |
| `subtitle` | string | no | Scope or context line, ≤ 140 characters; also copied into PPTX notes |
| `callout` | object | no | `{ "text": "…", "anchor"?: "<id>" }` — the "so what" box. With an anchor it sits beside that element; without, as a bar at the bottom |
| `legend` | `"auto"` \| `"none"` \| array | no | `auto` (default) lists the tags used; at detailed altitude it also lists statuses and emphasis. Status badges are labelled, so at executive and management altitude they need no legend |
| `footer` | object | no | `{ "source"?, "note"?, "classification"? }` — shown as "Source: …  ·  Note: …" on the left and the classification in capitals on the right |
| `body` | object | yes | Type-specific; see `references/<type>.md` |

## Node (used inside every body)

```json
{
  "id": "fin-planning",
  "label": "Planning & Analysis",
  "description": "Budgets, forecasts, performance packs",
  "owner": "CFO Office",
  "emphasis": "accent",
  "status": "new",
  "tags": ["shared-service"],
  "icon": "chart",
  "metric": "Forecast in 5 days"
}
```

| Field | Notes |
| --- | --- |
| `id` | Required. kebab-case (`fin-planning`, `r2r`), starts with a letter, unique across the whole diagram |
| `label` | Required. Short noun phrase, sentence case. Max 40 / 60 / 80 characters by altitude |
| `description` | One supporting line. Max 70 / 160 / 300 characters by altitude |
| `owner` | Who owns it ("CFO Office"); shown small under the label |
| `emphasis` | `normal` (default), `accent` (the one thing to look at), `highlight` (secondary), `muted` (context, de-emphasised) |
| `status` | `current`, `new`, `changed`, `retired`, `at-risk` — badge or border, added to the legend automatically |
| `tags` | Up to 4 kebab-case tags; each gets a small colour marker and a legend entry. Use for a second dimension (e.g. `customer-facing` vs `internal`) |
| `icon` | Name from `ds icons` (Lucide subset). Only drawn by themes with icons on (blueprint, sketch) |
| `metric` | A number the user gave you ("avg 2 days", "£14m"). Shown in the accent colour. Never invent one |

## Edge (swimlanes)

```json
{ "from": "intake", "to": "approve", "label": "over £10k", "style": "solid", "kind": "handoff" }
```

- `style`: `solid` (default), `dashed` (optional or future), `dotted` (information only).
- `kind`: `flow` (default within a lane), `handoff` (crosses a lane; drawn heavier — applied automatically when the steps are in different lanes), `feedback` (a loop back; routed below the main flow — pair it with `"style": "dashed"`).
- `label`: ≤ 30 characters, e.g. `yes` / `no` on decision branches.

## Legend entries

```json
"legend": [
  { "label": "New capability", "status": "new" },
  { "label": "Focus for 2027", "emphasis": "accent" },
  { "label": "Customer-facing", "tag": "customer-facing" }
]
```

## Rules the validator applies

- Every edge endpoint, `callout.anchor`, lane, phase, workstream and horizon reference must resolve to an existing id or name; errors list the valid ones.
- Altitude limits on node count, label and description length (see SKILL.md).
- At `detailed` altitude a legend is required when colour carries meaning (tags, status, highlight, muted).
- Warnings: more than two accents at executive altitude; a title that reads like a topic.

## Ids in outputs

Spec ids become SVG element ids (`id="fpa"`, `id="fpa--label"`) and PPTX shape names, so a reviewer can find "fpa" in any export.
