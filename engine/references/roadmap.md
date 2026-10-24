# roadmap

Phases or horizons over time as columns, workstreams as rows, items as bars spanning horizons, milestones as diamonds and gates as dashed lines across every row. Answers "what happens when, and what depends on what?".

**Use for:** transformation plans, programme timelines, now/next/later product roadmaps, migration waves, phased investments.
**Not for:** detailed Gantt charts with daily dates or dependencies between tasks (use a planning tool), processes (`swimlane`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `scale` | no | `equal` (default: every horizon the same width) or `time` (widths proportional to dates; every horizon then needs `start` and `end`) |
| `horizons[]` | yes | 1–8 `{ id, label, description?, start?, end? }` in time order. `label` ≤ 24 chars ("H1 2027", "Now"); `description` ≤ 40 chars, one short line ("Build"). Dates as `"2027-03"` or `"2027-03-31"` |
| `workstreams[]` | yes | 1–10 `{ id, label, description?, owner?, emphasis? }`, top to bottom. `label` ≤ 32 chars, `owner` ≤ 40 |
| `items[]` | yes | Nodes plus `workstream` (id), `start` (horizon id) and optional `end` (horizon id, inclusive). A bar spans start…end. Overlapping bars in one row stack automatically |
| `milestones[]` | no | `{ id, label, horizon, at?, kind?, workstream?, emphasis?, description? }`. `at`: `start`, `middle` (default) or `end` of the horizon. `kind`: `milestone` (diamond) or `gate` (dashed line through every row, default `at: "end"`). Milestones without a `workstream` sit on a track above the rows; with one, inside that row |

Items count toward the altitude node limit; milestones do not.

**Layout:** a header row of horizons, an optional milestone track, then one row per workstream with its header cell on the left. Alternate horizons are lightly tinted. Bars share one height. Gates are drawn behind bars.

## Writing tips

- **Executive:** 3–4 horizons, 2–4 workstreams, 4–8 bars, 1–3 milestones. Accent the bar or milestone the title is about. Title states the sequencing insight ("The ERP switch in Q3 2027 unlocks the finance hub a year later").
- **Management:** owners on workstreams, `metric` on key bars, `status: "at-risk"` on slipping items, gates for investment decisions.
- **Detailed:** up to 10 workstreams; consider `"canvas": { "aspect": "auto" }`.
- **Any altitude:** use `"scale": "time"` whenever horizons differ in length (H1, H2, then a full year), or equal widths will mislead. Turning the user's "H1 2027" into `"start": "2027-01", "end": "2027-06"` is a faithful translation, not invented data.
- **Callouts:** an anchored callout takes a side column and squeezes the timeline; prefer an unanchored callout (a bar under the rows), or none if space is tight.
- **Status vs accent:** an `at-risk` item shows a red border and badge. Keep the accent on the item the title is about; if the risk *is* the point, make it the title.
- Bar labels are deliverables or outcomes ("Move P2P to the hub"), not activities ("Work on P2P").
- Use only dates the user gave you. With no dates, use relative horizons (Now / Next / Later, Year 1 / 2 / 3).

Names, figures and dates in the examples below are illustrative. Copy the structure, not the facts.

## Example: executive

```json
{
  "version": "1.0",
  "type": "roadmap",
  "altitude": "executive",
  "title": "The ERP switch in Q3 2027 unlocks the finance hub a year later",
  "subtitle": "Finance transformation roadmap, 2026–2028",
  "body": {
    "horizons": [
      { "id": "h1", "label": "H2 2026", "description": "Mobilise" },
      { "id": "h2", "label": "H1 2027", "description": "Build" },
      { "id": "h3", "label": "H2 2027", "description": "Switch" },
      { "id": "h4", "label": "2028", "description": "Scale" }
    ],
    "workstreams": [
      { "id": "erp", "label": "ERP platform" },
      { "id": "hub", "label": "Finance hub" },
      { "id": "people", "label": "People & skills" }
    ],
    "items": [
      { "id": "erp-design", "label": "Design & configure", "workstream": "erp", "start": "h1", "end": "h2" },
      { "id": "erp-cutover", "label": "Cutover", "workstream": "erp", "start": "h3", "status": "at-risk" },
      { "id": "hub-pilot", "label": "Pilot R2R in the hub", "workstream": "hub", "start": "h2", "end": "h3" },
      { "id": "hub-scale", "label": "Move P2P and O2C to the hub", "workstream": "hub", "start": "h4", "emphasis": "accent" },
      { "id": "upskill", "label": "Business partner academy", "workstream": "people", "start": "h1", "end": "h4" }
    ],
    "milestones": [
      { "id": "go-live", "label": "ERP go-live", "horizon": "h3", "at": "middle", "emphasis": "accent" },
      { "id": "gate-1", "label": "Investment gate", "horizon": "h1", "at": "end", "kind": "gate" }
    ]
  }
}
```

## Example: now / next / later

```json
{
  "version": "1.0",
  "type": "roadmap",
  "altitude": "executive",
  "title": "Self-service onboarding comes first; pricing changes wait for the new data",
  "body": {
    "horizons": [
      { "id": "now", "label": "Now" },
      { "id": "next", "label": "Next" },
      { "id": "later", "label": "Later" }
    ],
    "workstreams": [
      { "id": "acquire", "label": "Acquire" },
      { "id": "engage", "label": "Engage" },
      { "id": "monetise", "label": "Monetise" }
    ],
    "items": [
      { "id": "self-onboard", "label": "Self-service onboarding", "workstream": "acquire", "start": "now", "emphasis": "accent" },
      { "id": "referrals", "label": "Referral programme", "workstream": "acquire", "start": "next", "end": "later" },
      { "id": "insights", "label": "Usage insights", "workstream": "engage", "start": "now", "end": "next" },
      { "id": "pricing", "label": "Usage-based pricing", "workstream": "monetise", "start": "later", "emphasis": "highlight" }
    ],
    "milestones": [
      { "id": "launch", "label": "Public launch", "horizon": "now", "at": "end", "kind": "gate" }
    ]
  }
}
```

A time-scaled plan with dates, owners and row milestones: `ds example roadmap --n 2`.

## Common mistakes

- **`end` before `start`**, or a horizon id that does not exist (validation lists valid ids).
- **`scale: "time"` without dates** on every horizon.
- **Too many bars in one row.** Overlapping bars stack and make rows tall; split the workstream or merge items.
- **Milestone labels that collide.** Two milestones close together on the track need short labels or different `at` positions.
- **Inventing dates.** Use relative horizons if the user gave none.
