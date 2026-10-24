# bar-chart

Columns (vertical, the default) or bars (horizontal) drawn from numbers: one series, stacked, grouped side by side, or 100% stacked. Figures sit on the data, not on an axis: values inside the segments (or just beside a segment too thin to hold one), totals on top, series named beside the last column, and difference arrows between columns. Answers "how big, and how does it split?".

**Use for:** cost or revenue stacks, before and after, scenario comparisons, rankings (horizontal), contributions to growth with negative values (horizontal), shares of a total (`percent`).
**Not for:** trends over many periods (use `line-chart`), how a number moved from A to B step by step (use `waterfall`), a handful of headline figures (use `kpi`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `series[]` | yes | 1–8 `{ id, label, emphasis? }`. Stacked columns stack **from the baseline up**: the first series sits on the axis |
| `categories[]` | yes | 1–40 `{ id?, label, values[], group?, emphasis?, badge? }`. `values` has one number per series, in series order; `null` for a missing value |
| `categories[].id` | | Needed only to point at the category from `deltas` (default `category-1`, `category-2`…) |
| `categories[].group` | | Consecutive categories with the same group sit together under a heading with a rule ("2030", "2050"). Columns only |
| `categories[].badge` | | A second figure in a hexagon under the category ("of which opex"). Say what it means in `badges.label` |
| `orientation` | | `vertical` (default) or `horizontal` |
| `mode` | | `stacked` (default with two or more series), `grouped`, `percent` (each column shown as shares of 100%) |
| `unit` | | Unit line above the plot ("$ billions"). Or put the unit in the subtitle |
| `format` | | `{ prefix?, suffix?, decimals?, thousands? }` for every figure: `{ "prefix": "£", "suffix": "m" }` prints `£1,050m`. Decimals default to the most the data uses; thousands are grouped unless `"thousands": false` |
| `totals` | | Totals above stacked columns (default on with two or more series). The engine adds them up |
| `deltas[]` | | Up to 4 `{ from, to, label?, show? }` difference arrows between two category ids, left to right. The difference is computed; `show`: `absolute` (default), `percent`, `both`. Columns only, unsorted, not `grouped` |
| `badges` | | `{ label, format? }`: the legend entry for the badges |
| `seriesLabels` | | `auto` (default: series named beside the last column when they fit, else a legend), `direct`, `legend` |
| `labels` | | `auto` (default) or `none` (no figures on the data) |
| `sort` | | `none` (default), `descending`, `ascending` by total. Use for rankings. Muted categories ("Other", a total) stay at the end in their given order |
| `palette` | | `sequential` (default: shades of the accent, darkest first) or `categorical` (the theme palette; a series keeps its hue by label across an exhibit's panels and a deck's pages) |

**Colour carries meaning, not decoration.** With `sequential`, an accented series takes the full accent and the rest fade with distance from it, so an ordinal scale (rarely … often) reads as one ramp. A `muted` series is grey (use it for "other", "grid connections", the comparison year). With one series, an accented category takes the accent and the others step back; a `muted` category (a total such as "Group revenue") is grey.

**The engine does the arithmetic.** Give the segment values only. Totals, shares, and differences are computed, so a chart can never print a total that does not add up. Never type a total as a category.

Charts do not count toward the altitude node limit; instead an `executive` chart allows 12 categories and 4 series, `management` 24 and 6, `detailed` 40 and 8.

## Writing tips

- The title states what the numbers show ("Pooled charging saves £300 million a year by 2040"), and the delta or the accent proves it.
- **One accent:** the category or series the title is about. Mute the context.
- Put the unit in the subtitle ("Global annual system costs, $ billions") or `unit`, never in every figure.
- Prefer horizontal bars for long category names, rankings and negative contributions.
- `percent` mode suits survey answers on an ordinal scale; order the series from one end of the scale to the other.
- Footnote markers (¹ ²) go in the text; the notes themselves in the envelope's `footnotes`.

Names, figures and dates in the examples below are fictitious. Copy the structure, not the facts.

## Example: stacked columns in two groups, with differences and badges

```json
{
  "version": "1.0",
  "type": "bar-chart",
  "title": "Pooled fleet charging cuts costs by 21%, saving £300 million a year by 2040",
  "subtitle": "Annual fleet charging cost¹, £ millions",
  "footnotes": ["Charging cost combines capital and operating expenditure for grid connections, chargers and electricity", "Each division builds and runs its own charging"],
  "footer": { "source": "Fleet electrification model; fictitious data" },
  "body": {
    "series": [
      { "id": "grid", "label": "Grid connections", "emphasis": "muted" },
      { "id": "chargers", "label": "Chargers" },
      { "id": "electricity", "label": "Electricity" }
    ],
    "categories": [
      { "id": "separate-2030", "label": "Separate depots²", "group": "2030", "values": [20, 90, 260], "badge": 240 },
      { "id": "pooled-2030", "label": "Pooled charging", "group": "2030", "values": [30, 80, 200], "badge": 220 },
      { "id": "separate-2040", "label": "Separate depots²", "group": "2040", "values": [10, 340, 1050], "badge": 820 },
      { "id": "pooled-2040", "label": "Pooled charging", "group": "2040", "values": [110, 290, 700], "badge": 760, "emphasis": "accent" }
    ],
    "deltas": [
      { "from": "separate-2030", "to": "pooled-2030" },
      { "from": "separate-2040", "to": "pooled-2040" }
    ],
    "badges": { "label": "£ of which operating cost" }
  }
}
```

## Example: horizontal bars with negative values

```json
{
  "version": "1.0",
  "type": "bar-chart",
  "title": "Licence and project revenue drove the 2.1-point fall in group growth",
  "subtitle": "Group revenue growth, FY26, contribution by business line in percentage points",
  "footer": { "source": "Management accounts; fictitious data" },
  "body": {
    "orientation": "horizontal",
    "format": { "decimals": 1 },
    "series": [
      { "id": "contribution", "label": "Contribution" }
    ],
    "categories": [
      { "label": "Subscriptions", "values": [0.9] },
      { "label": "Support contracts", "values": [0.3] },
      { "label": "Implementation projects", "values": [-1.2] },
      { "label": "Perpetual licences", "values": [-1.6], "emphasis": "accent" },
      { "label": "Hardware resale", "values": [-0.5] },
      { "label": "Group revenue", "values": [-2.1], "emphasis": "muted" }
    ]
  }
}
```

Grouped columns: `ds example bar-chart --n 3`.

## Common mistakes

- **A values list that does not match the series.** One value per series, in series order; `null` where there is none.
- **Series listed top-down.** Stacks build from the baseline: the first series is the bottom segment.
- **Typing totals or differences.** Leave them to `totals` and `deltas`; the engine computes them.
- **A delta between grouped or sorted columns.** Arrows need stacked or single columns in their given order.
- **More than one accent.** Accent the category or series the title is about; mute the context instead.
