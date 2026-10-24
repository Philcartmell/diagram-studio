# matrix-2x2

Items placed on two axes with four named quadrants. Answers "where should we focus?" or "how do these compare on two dimensions?".

**Use for:** impact vs effort prioritisation, portfolio positioning, vendor assessments, risk heatmaps (likelihood vs impact), BCG-style grids.
**Not for:** more than two dimensions (use tags for a third), exact data plots with axes and ticks (use a charting tool).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `xAxis` | yes | `{ label, low?, high? }` — e.g. `{ "label": "Effort to deliver", "low": "Low", "high": "High" }`. `low`/`high` ≤ 20 chars (default "Low"/"High") |
| `yAxis` | yes | Same shape; `high` is at the top |
| `quadrants[4]` | yes | Exactly one each of `top-left`, `top-right`, `bottom-left`, `bottom-right`: `{ position, label, description?, emphasis?, id? }`. Labels sit in each quadrant's outer corner |
| `items[]` | yes | 1–30 `{ id, label, x?, y?, quadrant?, emphasis?, status?, metric?, tags? }` |
| `items[].x`, `.y` | | Position from 0 (low) to 1 (high) on each axis. Give both, or neither |
| `items[].quadrant` | | Alternative to x/y: the item is placed automatically inside that quadrant |

Items count toward the altitude node limit.

**Layout:** each half of an axis maps into its own quadrant, so values below 0.5 land in the low quadrant and values from 0.5 up in the high one; markers never sit on the gutter. Markers are circles (accent items larger and in the accent colour; `highlight` items in the highlight colour; `tags` colour the marker). Labels go beside the marker on whichever side is free and always stay inside the marker's quadrant. If no free spot exists, QA reports `canvas-fit` on `<item>--label`, naming what blocks it — nudge `x`/`y` about 0.05 away from that, or shorten the label. `status: "at-risk"` rings the marker; non-current statuses are appended to the label.

**Turning scores into x/y.** For scores on a 1–10 scale use `(score − 0.5) / 10` (so 5 → 0.45 and 6 → 0.55: 5 or less is "low", 6 or more is "high"), and say where the line falls in `footer.note`. Never use exactly 0.5: the validator warns, because the item's quadrant would be ambiguous. Equal scores give equal positions; if two items coincide, separate them by ±0.03 and keep them on the same side of the midline.

## Writing tips

- **Executive:** 4–8 items. Accent the quadrant the title is about (e.g. "Quick wins") *or* 1–2 items, not both: an accented quadrant counts toward the two-accent limit. To pick out several items inside an accented quadrant, give them `highlight`. Quadrant labels are verdicts ("Do now", "Avoid"), descriptions explain them.
- **Management:** up to ~15 items; `metric` for a third value (e.g. "£2m"); `tags` + `legend: "auto"` for categories.
- Use x/y only when the user gave scores or a relative order; otherwise use `quadrant`, which avoids implying precision.
- Keep labels ≤ 3–4 words; spread items that share a position by ±0.05 so labels have room.

Names, figures and dates in the examples below are illustrative. Copy the structure, not the facts.

## Example: executive with positions

```json
{
  "version": "1.0",
  "type": "matrix-2x2",
  "altitude": "executive",
  "title": "Three initiatives deliver most of the value for modest effort",
  "subtitle": "2027 initiative portfolio by value and effort",
  "callout": { "text": "Fund the quick wins first; re-scope the data lake before approving it", "anchor": "data-lake" },
  "body": {
    "xAxis": { "label": "Effort to deliver", "low": "Low", "high": "High" },
    "yAxis": { "label": "Value to the business", "low": "Low", "high": "High" },
    "quadrants": [
      { "position": "top-left", "label": "Quick wins", "description": "Do now", "emphasis": "accent" },
      { "position": "top-right", "label": "Major projects", "description": "Plan carefully" },
      { "position": "bottom-left", "label": "Fill-ins", "description": "Do when capacity allows" },
      { "position": "bottom-right", "label": "Thankless tasks", "description": "Avoid or re-scope" }
    ],
    "items": [
      { "id": "e-invoicing", "label": "E-invoicing", "x": 0.18, "y": 0.82, "emphasis": "accent" },
      { "id": "self-service", "label": "Self-service reporting", "x": 0.32, "y": 0.7 },
      { "id": "auto-recs", "label": "Automated reconciliations", "x": 0.28, "y": 0.58 },
      { "id": "erp", "label": "ERP upgrade", "x": 0.82, "y": 0.78 },
      { "id": "data-lake", "label": "Data lake", "x": 0.86, "y": 0.22, "status": "at-risk" },
      { "id": "policy", "label": "Policy refresh", "x": 0.2, "y": 0.25 }
    ]
  }
}
```

## Example: placement by quadrant

```json
{
  "version": "1.0",
  "type": "matrix-2x2",
  "altitude": "management",
  "title": "Two vendors combine strong capability with an acceptable price",
  "subtitle": "CRM vendor shortlist, placed by quadrant after scoring workshops",
  "body": {
    "xAxis": { "label": "Total cost of ownership", "low": "Lower", "high": "Higher" },
    "yAxis": { "label": "Capability fit", "low": "Weaker", "high": "Stronger" },
    "quadrants": [
      { "position": "top-left", "label": "Shortlist", "description": "Strong fit, affordable", "emphasis": "accent" },
      { "position": "top-right", "label": "Negotiate", "description": "Strong fit, expensive" },
      { "position": "bottom-left", "label": "Watch", "description": "Cheap but limited" },
      { "position": "bottom-right", "label": "Reject", "description": "Weak and costly" }
    ],
    "items": [
      { "id": "vendor-a", "label": "Vendor A", "quadrant": "top-left", "emphasis": "accent" },
      { "id": "vendor-b", "label": "Vendor B", "quadrant": "top-left" },
      { "id": "vendor-c", "label": "Vendor C", "quadrant": "top-right" },
      { "id": "vendor-d", "label": "Vendor D", "quadrant": "bottom-left" },
      { "id": "vendor-e", "label": "Vendor E", "quadrant": "bottom-right" },
      { "id": "vendor-f", "label": "Vendor F", "quadrant": "bottom-right" }
    ]
  }
}
```

A risk heatmap with tags, statuses and a footer: `ds example matrix-2x2 --n 3`.

## Common mistakes

- **Items in a quadrant's title corner** (the outer corner where its label sits). Pull them in slightly if QA says the quadrant title blocks a label.
- **Several items at almost the same x/y.** Spread them by ±0.03–0.05 (staying on the same side of 0.5) or use `quadrant` placement.
- **x or y exactly 0.5.** The item's quadrant is ambiguous; choose 0.45 or 0.55.
- **Axis labels that are judgements** ("Good"). Axes are dimensions ("Effort", "Value"); quadrant labels carry the verdict.
- **Giving only `x` or only `y`.** Both are required together.
