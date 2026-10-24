# exhibit

One slide built from panels under a single action title, the way consulting exhibits are: the argument beside the chart, three small multiples with a shared story, an architecture beside its cost case. Each panel is **any other type** (a chart, `kpi`, `narrative`, a business diagram, an `azure-architecture` or `databricks-architecture`), laid out as a figure into its own box. The slide stays native shapes throughout, so it is editable in PowerPoint and draw.io.

**Use for:** narrative + chart (+ KPI column), small multiples, a diagram with the numbers that justify it.
**Not for:** two unrelated messages (make two slides), more than about four panels at executive altitude.

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `panels[]` | yes | 1–6 `{ id, type, body, title?, subtitle?, span?, altitude?, legend?, callout? }` |
| `panels[].type` | yes | Any type except `exhibit` |
| `panels[].body` | yes | A body of that type, exactly as in its own reference (`ds docs <type>`); it is validated as one |
| `panels[].title`, `.subtitle` | | The panel heading ("Release frequency" / "From every quarter to every month"). Not an action title: the exhibit's title carries the message |
| `panels[].span` | | Relative width in `columns`, height in `rows` (default 1). `[1, 2.2, 0.8]` gives a narrow narrative, a wide chart and a slim KPI column |
| `panels[].altitude`, `.legend`, `.callout` | | Per panel; altitude defaults to the exhibit's |
| `layout` | | `columns` (default), `rows`, or `grid` (with `columns`: panels per row) |
| `dividers` | | Hairlines between panels (good for small multiples) |

The envelope's `title`, `subtitle`, `footnotes`, `footer` and an unanchored `callout` apply to the whole slide. Panel ids must be unique; ids inside different panels may repeat (two charts may both have a series called `revenue`).

**Fitting.** Each panel is laid out to fill its box. A figure that needs more room (a large Azure architecture) is laid out at its natural size and scaled down to fit; the render notes say by how much. Below 70% its text would be unreadable, so QA fails with `canvas-fit` and tells you to give the panel a larger `span`, use fewer panels, or move it to a page of its own.

**Accents.** At executive altitude the whole slide still has at most two accents. The same series accented in each small multiple counts once.

## Writing tips

- The exhibit title states the finding the panels prove together.
- Small multiples: same type, same series order and emphasis in every panel, with `dividers`. Put the shared unit in the subtitle.
- Narrative left (`span` about 1), chart centre (about 2), KPIs right (about 0.8) is the classic consulting layout.
- A chart panel's `title` is a label ("Global annual system costs¹"), its `subtitle` the unit.

Names, figures and dates in the examples below are fictitious. Copy the structure, not the facts.

## Example: small multiples

```json
{
  "version": "1.0",
  "type": "exhibit",
  "title": "Teams release more often and recover sooner on the new platform",
  "subtitle": "Share of developers, before and after the move to the new platform, %",
  "footer": { "source": "Engineering survey, 240 developers; fictitious data" },
  "body": {
    "dividers": true,
    "panels": [
      {
        "id": "frequency",
        "type": "bar-chart",
        "title": "Release frequency",
        "subtitle": "From every quarter to every month",
        "body": {
          "mode": "percent",
          "series": [
            { "id": "rare", "label": "Twice a year or less", "emphasis": "muted" },
            { "id": "quarterly", "label": "Every quarter" },
            { "id": "monthly", "label": "Every month" },
            { "id": "often", "label": "Several times a month", "emphasis": "accent" }
          ],
          "categories": [
            { "label": "Before", "values": [31, 34, 24, 11] },
            { "label": "After", "values": [9, 24, 41, 26] }
          ],
          "seriesLabels": "legend"
        }
      },
      {
        "id": "recovery",
        "type": "bar-chart",
        "title": "Mean time to recover",
        "subtitle": "From half a day or more to a few hours",
        "body": {
          "mode": "percent",
          "series": [
            { "id": "day", "label": "More than a day", "emphasis": "muted" },
            { "id": "half-day", "label": "Half a day to a day" },
            { "id": "hours", "label": "Two to 12 hours" },
            { "id": "fast", "label": "Under two hours", "emphasis": "accent" }
          ],
          "categories": [
            { "label": "Before", "values": [27, 39, 25, 9] },
            { "label": "After", "values": [7, 21, 44, 28] }
          ],
          "seriesLabels": "legend"
        }
      }
    ]
  }
}
```

Narrative, chart and KPI column: `ds example exhibit`. An Azure architecture beside a cost waterfall: `ds example exhibit --n 3`.

## Common mistakes

- **An action title on every panel.** One message per slide: the exhibit title. Panel titles are labels.
- **Too many panels.** Each shrinks; past four, split into two slides of a deck.
- **A large architecture squeezed into a narrow panel.** Give it the larger `span`, or its own page.
