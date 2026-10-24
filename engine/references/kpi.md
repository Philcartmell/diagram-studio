# kpi

Big figures with a line of explanation each: a row of tiles for a headline slide, or a column down the side of an exhibit. The figure prints exactly as written, so "$140 BN", "10–20%" and "~1.9 billion" all work; the engine never rounds or restates it.

**Use for:** headline results, the "so what" numbers beside a chart, a summary of a business case.
**Not for:** comparing figures against each other (use a `bar-chart`), more than six numbers.

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `items[]` | yes | 1–6 `{ id, value, label, detail?, emphasis? }` |
| `items[].value` | yes | The figure as it should print, up to 14 characters |
| `items[].label` | yes | What it measures, as a phrase that completes the figure ("of invoices now post with no manual touch") |
| `items[].detail` | | A smaller line of context ("Up from 11% two years earlier") |
| `layout` | | `row` (default: tiles side by side, centred on a slide of their own) or `column` (stacked, for the side of an exhibit) |

An accented item gets the accent colour and a heavier rule. `executive` slides read best with up to 4 figures, `management` 5.

Names and figures in the example below are fictitious. Copy the structure, not the facts.

## Example

```json
{
  "version": "1.0",
  "type": "kpi",
  "title": "The invoice automation pilot already pays for itself in all three teams that use it",
  "subtitle": "Finance automation pilot, three teams, first six months",
  "footer": { "source": "Pilot tracking; fictitious data" },
  "body": {
    "items": [
      { "id": "touchless", "value": "41%", "label": "of invoices now post with no manual touch", "detail": "Up from 12% before the pilot" },
      { "id": "saving", "value": "£1.8M", "label": "annual saving across the three pilot teams", "emphasis": "accent" },
      { "id": "close", "value": "3 days", "label": "faster month-end close", "detail": "Largest in accounts payable" }
    ]
  }
}
```

## Common mistakes

- **Long figures.** "$140,000,000,000" does not fit a tile; write "$140 BN".
- **Labels that repeat the figure.** The label explains it ("lower annual cost in 2050"), the figure carries the number.
