# waterfall

A starting level, the rises and falls that move it, and the level they reach. Answers "what moved the number?". The engine runs the totals itself: subtotals and the end bar are computed from the steps, and a stated total that does not add up is a validation error.

**Use for:** profit and margin bridges, cost-saving walks, budget-to-actual variance, headcount or customer movements.
**Not for:** parts of a whole at one point in time (use a stacked `bar-chart`), trends (use `line-chart`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `steps[]` | yes | 2–16 `{ id?, label, value?, kind?, emphasis? }`, left to right |
| `steps[].kind` | | `start` (the first step: the opening level), `delta` (default after the first: a change, negative for a fall), `subtotal` (a level part-way through), `end` (the last step: the closing level) |
| `steps[].value` | | Required for `start` and `delta`. Leave it out of `subtotal` and `end` and the engine computes it; if you give it, it must match the running total |
| `unit`, `format` | | As in `bar-chart`: `{ "suffix": "%", "decimals": 1 }` prints `12.4%`; changes print with a sign (`+1.8%`, `−0.7%`) |
| `colors` | | `neutral` (default: levels solid, changes tinted) or `direction` (rises and falls in two colours, with a legend) |
| `invert` | | With `direction`: a fall is good news (costs, defects), so falls take the positive colour |
| `axis` | | `auto` (default): when every level sits far above zero and the changes are small beside it, the axis breaks (marked with slashes on the level bars) so the changes get the height. `zero` always starts at zero |

An accented change is drawn in the highlight colour, so it never reads as a level. Waterfalls do not count toward the altitude node limit.

## Writing tips

- The title names the step that matters ("Procurement savings more than offset inflation"). Accent that step.
- Order the changes by the story: often the largest first, or rises then falls.
- Combine small changes into one "Other" step; 5–9 bars read best.
- Use `direction` colours only when up and down genuinely mean good and bad; otherwise stay `neutral`.
- Margins and rates break the axis automatically; for money that started from zero, or when a reader will compare bar heights, set `"axis": "zero"`.

Names, figures and dates in the examples below are fictitious. Copy the structure, not the facts.

## Example: margin bridge (axis breaks automatically)

```json
{
  "version": "1.0",
  "type": "waterfall",
  "title": "Procurement savings more than offset inflation, lifting margin by 2.1 points",
  "subtitle": "Operating margin bridge, FY25 to FY26, % of revenue",
  "body": {
    "format": { "suffix": "%", "decimals": 1 },
    "steps": [
      { "label": "FY25 margin", "value": 12.4, "kind": "start" },
      { "label": "Price increases", "value": 1.8 },
      { "label": "Wage inflation", "value": -1.6 },
      { "label": "Energy costs", "value": -0.7 },
      { "label": "Procurement savings", "value": 2.9, "emphasis": "accent" },
      { "label": "Mix effects", "value": -0.3 },
      { "label": "FY26 margin", "kind": "end" }
    ]
  }
}
```

A cost walk with a subtotal and direction colours: `ds example waterfall --n 2`.

## Common mistakes

- **A stated end that does not add up.** Leave `value` out of `subtotal` and `end` unless the user gave it; then the validator checks it.
- **A `start` that is not first, or an `end` that is not last.** Use `subtotal` for levels part-way through.
- **Wide figures in narrow columns.** Use a suffix ("bn", "m") rather than full numbers.
