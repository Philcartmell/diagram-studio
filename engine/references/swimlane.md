# swimlane

Who does what across teams: lanes for each team or role, steps placed in order, arrows for flow and handoffs, optional phases as column bands. Answers "who does what, and where does it wait?".

**Use for:** approval flows, onboarding, order-to-cash, incident handling, as-is vs to-be processes, any "handoffs across teams" story.
**Not for:** organisational structure (`operating-model`), timelines with dates (`roadmap`), system integrations for engineers.

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `orientation` | no | `horizontal` (default: lanes are rows, flow left→right) or `vertical` (lanes are columns, flow runs down the page; use it for 6+ lanes or for portrait pages) |
| `lanes[]` | yes | 1–8 `{ id, label, description?, emphasis? }`, in the order to draw them. Put lanes that hand off to each other next to each other |
| `phases[]` | no | 1–8 phase names (strings) drawn as column bands. When set, **every step needs `phase`** with one of these names |
| `steps[]` | yes | Nodes plus `lane` (lane id, required), `phase` (phase name), `shape` |
| `steps[].shape` | no | `task` (default), `decision` (diamond; phrase as a short question), `start`, `end`, `document`, `system` (automated step), `wait` |
| `edges[]` | yes | `{ from, to, label?, style?, kind? }` between step ids (may be empty) |

Steps count toward the altitude node limit.

**Layout:** step order comes from the edges (ELK layered layering). When one-step-per-column does not fit, a handoff to another lane may stay in the same column as a vertical arrow, which keeps 12+ step processes on one 16:9 slide. Connectors are orthogonal, never cross a box, and are glued to shapes in PPTX. The router tries several edge orders and keeps the one with fewest crossings, so the order you list edges in does not matter. Edges that cross lanes are drawn as heavier handoffs automatically. A `feedback` edge routes below the main flow.

**Capacity at 16:9:** horizontal fits about 6 lanes (fewer if steps carry descriptions) and about 7 columns of steps. All steps share one size, so one long label, description or `metric` makes every step taller. For more lanes use `"orientation": "vertical"` (lanes become columns; any aspect works), or `"canvas": { "aspect": "auto" }`.

## Writing tips

- **Executive:** 4–8 steps, the bottleneck step accented with its `metric` ("avg 2 days"). Title names the delay or the change. Keep the roles the user named as lanes (2–6 is typical); do not merge distinct teams just to save space.
- **Management:** up to ~14 steps; phases help; label decision branches `yes`/`no`; show loops with `"kind": "feedback", "style": "dashed"`.
- **Detailed:** up to 60 steps; use `"canvas": { "aspect": "auto" }` beyond ~16 steps.
- Steps are verb + object ("Approve spend", "Schedule payment"). Decisions are questions ("Over £10k?"). Lanes are teams or roles, not people's names unless the user gave them.
- One start and one end at most; skip them at executive altitude if they add nothing.
- Every step should have at least one edge, and every lane at least one step (empty lanes warn).

Names, figures and dates in the examples below are fictitious. Copy the structure, not the facts.

## Example: management, horizontal with phases

```json
{
  "version": "1.0",
  "type": "swimlane",
  "altitude": "management",
  "title": "Invoices over £10k wait two days for a second approval",
  "body": {
    "orientation": "horizontal",
    "lanes": [
      { "id": "supplier", "label": "Supplier" },
      { "id": "ap", "label": "Accounts payable" },
      { "id": "budget", "label": "Budget holder" },
      { "id": "cfo", "label": "CFO office" }
    ],
    "phases": ["Receive", "Approve", "Pay"],
    "steps": [
      { "id": "submit", "lane": "supplier", "phase": "Receive", "label": "Submit invoice" },
      { "id": "match", "lane": "ap", "phase": "Receive", "label": "3-way match" },
      { "id": "approve", "lane": "budget", "phase": "Approve", "label": "Approve spend" },
      { "id": "over10k", "lane": "budget", "phase": "Approve", "label": "Over £10k?", "shape": "decision" },
      { "id": "cfo-ok", "lane": "cfo", "phase": "Approve", "label": "Second approval", "emphasis": "accent", "metric": "avg 2 days" },
      { "id": "pay", "lane": "ap", "phase": "Pay", "label": "Schedule payment" }
    ],
    "edges": [
      { "from": "submit", "to": "match", "kind": "handoff" },
      { "from": "match", "to": "approve", "kind": "handoff" },
      { "from": "approve", "to": "over10k" },
      { "from": "over10k", "to": "cfo-ok", "label": "yes", "kind": "handoff" },
      { "from": "over10k", "to": "pay", "label": "no", "kind": "handoff" },
      { "from": "cfo-ok", "to": "pay", "kind": "handoff" }
    ]
  }
}
```

## Example: executive, vertical

```json
{
  "version": "1.0",
  "type": "swimlane",
  "altitude": "executive",
  "title": "Expense claims under £100 now pay out without manager approval",
  "canvas": { "aspect": "4:3" },
  "body": {
    "orientation": "vertical",
    "lanes": [
      { "id": "employee", "label": "Employee" },
      { "id": "manager", "label": "Manager" },
      { "id": "finance", "label": "Finance" }
    ],
    "steps": [
      { "id": "submit", "lane": "employee", "label": "Submit claim", "shape": "start" },
      { "id": "check", "lane": "finance", "label": "Under £100?", "shape": "decision" },
      { "id": "approve", "lane": "manager", "label": "Approve claim" },
      { "id": "pay", "lane": "finance", "label": "Pay in next run", "emphasis": "accent", "status": "new" },
      { "id": "paid", "lane": "employee", "label": "Claim paid", "shape": "end" }
    ],
    "edges": [
      { "from": "submit", "to": "check" },
      { "from": "check", "to": "pay", "label": "yes" },
      { "from": "check", "to": "approve", "label": "no" },
      { "from": "approve", "to": "pay" },
      { "from": "pay", "to": "paid" }
    ]
  }
}
```

A 12-step, 4-lane process with a feedback loop: `ds example swimlane --n 2`.

## Common mistakes

- **More than ~7 steps in one lane at executive altitude.** Group them into one step with a `description`.
- **A lane per person.** Lanes are roles or teams. A lane with one step is fine when it is a distinct party (Supplier, Warehouse); merge only lanes that are really the same team.
- **Missing `phase` on some steps** once `phases` is set (validation error), or a `phase` name that does not match exactly.
- **Edges that skip the decision.** Route both branches out of the decision step with `yes`/`no` labels.
- **Lanes in an order that forces long arrows.** Order lanes so consecutive handoffs go to neighbouring lanes; this keeps crossings at or under 2.
- **Labels on every edge.** Label only decision branches and genuinely informative transitions.
