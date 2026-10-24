# value-chain

Primary activities as interlocking chevrons from left to right, support activities as bands above them, optional detail panels under each chevron, and an outcome arrow (e.g. margin) at the end. Answers "how do we create value, and where should we focus?".

**Use for:** Porter-style value chains, end-to-end activity chains (source → make → deliver → service), "where the margin is" stories, focus areas for a strategy.
**Not for:** who-does-what processes with handoffs (`swimlane`), organisation design (`operating-model`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `primary[]` | yes | 2–8 nodes in order, drawn as chevrons sharing the width equally (the first is flat-backed). Each node may add `items` (1–5 short strings, shown as bullets in a panel below) and `description` (shown in that panel) |
| `support[]` | no | 0–5 `{ id, label, description?, items?, emphasis?, status? }` drawn as bands above the chevrons; items are joined into one line ("Data platform · Store systems") |
| `outcome` | no | `{ label, description? }` — an arrow at the end spanning the support bands and chevrons ("Margin", "+180 bps by 2028") |

Primary and support activities count toward the altitude node limit.

**Layout:** chevrons interlock with an even 16-unit gap; detail panels align under each chevron and share one height. An accented chevron tints its panel too. A chevron's `metric` shows inside the chevron under the label.

## Writing tips

- **Executive:** 4–6 primary activities, accent the 1–2 focus areas named in the title, keep 1–2 `items` per panel or none. Add the outcome only if the user gave the figure.
- **Management:** use `description` per activity and a `metric` (e.g. savings target) per chevron; status `changed` for activities being redesigned.
- **Detailed:** up to 5 items per panel, support bands with items, `tags` (e.g. `digital` vs `core`) with `legend: "auto"`.
- Activity labels are short nouns or verbs ("Sourcing", "Plan", "Last-mile delivery").
- Keep panels parallel: the same kind of content under every chevron (all levers, or all KPIs).

Names, figures and dates in the examples below are illustrative. Copy the structure, not the facts.

## Example: executive with support activities

```json
{
  "version": "1.0",
  "type": "value-chain",
  "altitude": "executive",
  "title": "Margin gains sit in sourcing and last-mile delivery, not in stores",
  "subtitle": "Retail value chain, focus areas for 2027",
  "body": {
    "support": [
      { "id": "tech", "label": "Technology", "items": ["Data platform", "Store systems", "E-commerce"] },
      { "id": "people", "label": "People", "items": ["Workforce planning", "Training"] }
    ],
    "primary": [
      { "id": "source", "label": "Sourcing", "emphasis": "accent", "items": ["Supplier consolidation", "Own-label growth"] },
      { "id": "inbound", "label": "Inbound logistics", "items": ["Distribution centres"] },
      { "id": "stores", "label": "Stores & online", "items": ["Store estate", "Web and app"] },
      { "id": "delivery", "label": "Last-mile delivery", "emphasis": "accent", "items": ["Route density", "Click & collect"] },
      { "id": "service", "label": "Customer service", "items": ["Returns", "Contact centre"] }
    ],
    "outcome": { "label": "Margin", "description": "+180 bps by 2028" }
  }
}
```

## Example: management with metrics

```json
{
  "version": "1.0",
  "type": "value-chain",
  "altitude": "management",
  "title": "Planning and procurement drive two thirds of the cost-out programme",
  "subtitle": "Manufacturing value chain with 2027 savings targets",
  "body": {
    "primary": [
      { "id": "plan", "label": "Plan", "description": "Integrated demand and supply planning", "metric": "£14m", "emphasis": "accent" },
      { "id": "procure", "label": "Procure", "description": "Category-led sourcing, fewer suppliers", "metric": "£11m", "emphasis": "accent" },
      { "id": "make", "label": "Make", "description": "Lean lines, predictive maintenance", "metric": "£6m", "status": "changed" },
      { "id": "deliver", "label": "Deliver", "description": "Network redesign, two DCs", "metric": "£4m" },
      { "id": "service", "label": "Service", "description": "Spares and field service", "metric": "£2m" }
    ],
    "outcome": { "label": "£37m", "description": "run-rate savings by 2028" }
  }
}
```

A detailed example with tags and a legend: `ds example value-chain --n 3`.

## Common mistakes

- **More than ~6 chevrons at 16:9.** Labels get cramped; merge adjacent activities.
- **Long chevron labels.** Chevrons are narrow; keep labels to 1–3 words and put detail in `description` or `items`.
- **Accenting every activity with a saving.** Accent the ones the title names; others keep their `metric`.
- **Mixing support and primary.** Support activities enable all primary activities (technology, people, procurement); they are not steps.
