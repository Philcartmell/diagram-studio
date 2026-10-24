# line-chart

Values over time as lines on light gridlines. Each line is named at its end with its last value (no legend to decode), with an optional reference line (an index base, a target) and vertical markers for events. Answers "how did it move, and where is it now?".

**Use for:** trends, indices (2019 = 100), actuals against plan, before and after an event.
**Not for:** a few periods compared side by side (use a `bar-chart`), the steps between two values (use `waterfall`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `x[]` | yes | 2–120 labels along the x axis ("2018", "Q2", "Jan"). Labels are thinned automatically so they never touch |
| `series[]` | yes | 1–8 `{ id, label, values[], emphasis?, style? }`. One value per x label; `null` for a gap. `style: "dashed"` for a forecast or plan |
| `unit`, `format` | | As in `bar-chart` |
| `yAxis` | | `{ min?, max? }`. By default the axis rounds out from the data to tidy ticks (it need not start at zero) |
| `reference` | | `{ value, label? }`: a dashed horizontal line, e.g. `{ "value": 100, "label": "2019 = 100" }` |
| `annotations[]` | | Up to 4 `{ at, label }`: a dotted vertical line at an x label ("Website relaunch", "Go-live") |
| `labels` | | `end` (default: name and last value at each line end) or `legend` |
| `markers` | | `true` draws a dot at every value (for short series) |

**Colour:** without emphasis each line takes a theme palette colour, held by its label across the panels of an exhibit and the pages of a deck. Accent the line the title is about and the others turn grey, which is usually the better chart. Line charts do not count toward the node limit; `executive` allows 4 lines, `management` 6, `detailed` 8.

## Writing tips

- The title says what the line did ("Retail has recovered to its pre-pandemic level while industry stagnates"); accent that line.
- Index series to a base (= 100) when comparing things of different size, and add the `reference` line.
- Mark the event that explains the shape with an annotation rather than in the title.

Names, figures and dates in the example below are fictitious. Copy the structure, not the facts.

## Example: two indices, one accented, with a reference line and an event

```json
{
  "version": "1.0",
  "type": "line-chart",
  "title": "Online orders are back to their 2019 level after the relaunch; store visits keep falling",
  "subtitle": "Online orders and store visits, index (2019 = 100)",
  "footer": { "source": "Trading data; fictitious data" },
  "body": {
    "x": ["2018", "Q2", "Q3", "Q4", "2019", "Q2", "Q3", "Q4", "2020", "Q2", "Q3", "Q4", "2021", "Q2", "Q3", "Q4", "2022", "Q2", "Q3", "Q4", "2023"],
    "series": [
      {
        "id": "online",
        "label": "Online orders",
        "emphasis": "accent",
        "values": [96, 97, 99, 99, 100, 101, 101, 102, 98, 89, 94, 97, 99, 101, 102, 101, 100, 101, 99, 100, 100]
      },
      { "id": "stores", "label": "Store visits", "values": [104, 103, 102, 101, 100, 99, 98, 98, 96, 94, 93, 93, 92, 91, 91, 90, 90, 89, 89, 88, 88] }
    ],
    "reference": { "value": 100, "label": "2019 = 100" },
    "annotations": [
      { "at": "2020", "label": "Website relaunch" }
    ]
  }
}
```

## Common mistakes

- **A values list shorter or longer than `x`.** One value per x label; `null` for a gap.
- **An annotation `at` that is not an x label.** Use the label exactly as written in `x`.
- **Five or more coloured lines.** Accent one or two and let the rest go grey, or split into small multiples in an `exhibit`.
