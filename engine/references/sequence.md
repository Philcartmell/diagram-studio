# sequence

Who talks to whom, in what order. Participants are lifelines across the top, messages are arrows between them in time order down the page, and fragments (loop, alt, opt, par…), notes, phases and timing brackets explain the flow. Answers "what happens between these parties, step by step, and where does it wait?".

**Use for:** request and integration flows (web app → service → database), handshakes with partners (payments, identity, carriers), a customer journey across parties, as-is vs to-be interactions, explaining where time goes in a flow, and any diagram someone already has in Mermaid (`ds import mermaid`).
**Not for:** who does what across teams with decisions and handoffs (`swimlane`), how systems are layered (`layered-architecture`), cloud services and networks (`azure-architecture`, `databricks-architecture`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `participants[]` | yes | 1–14 `{ id, label, description?, kind?, icon?, emphasis?, status?, color? }`, drawn left to right in this order. Put parties that talk most next to each other |
| `participants[].kind` | no | `person` (person icon), `system` (default), `service`, `database` (cylinder header), `queue` (layers icon), `external` (dashed outline: a party outside your control) |
| `participants[].description` | no | A short role line under the label ("Internal", "Card network") |
| `groups[]` | no | `{ id, label, participants[], color?, emphasis? }`: a labelled box behind neighbouring participants ("Our platform", "Partners"). Members must sit side by side |
| `steps[]` | yes | The flow, in order. Each step is a message, a note, a fragment, a highlight, a phase, a divider or a delay (below) |
| `timings[]` | no | `{ from, to, label, emphasis? }`: a bracket in the right margin from one message id to another, labelled "1.4 s typical" or "avg 3 days" |
| `numbering` | no | `none` (default), `badge` (numbered circles at the start of each arrow, easy to refer to in a narrative), `inline` ("3. Label") |
| `activations` | no | `auto` (default above executive): a call opens a bar on the receiver and its return closes it. `manual`: only `activate` / `deactivate` flags. `none` (default at executive) |
| `style` | no | Look presets, below |

### Steps

| Step | Shape | Notes |
| --- | --- | --- |
| Message | `{ from, to, label?, detail?, kind?, … }` | `kind`: `sync` (default, solid line, filled head), `async` (open head), `return` (dashed, open head, quieter label), `fail` (ends in a cross: lost or failed). `detail` is a second, smaller line ("POST /payments"). `from` = `to` draws a self-message loop |
| | `id` | Needed only to point at the message from `timings` or `callout.anchor` |
| | `both`, `style` | `both: true` for a two-way exchange; `style` overrides the line (`solid`, `dashed`, `dotted`) |
| | `activate`, `deactivate` | Override the automatic activation rule for this message |
| | `create`, `destroy` | `create: true`: the receiver's header appears at this message, not at the top. `destroy: "from" \| "to"`: that lifeline ends in a cross after this message |
| | `emphasis`, `color` | Accent two or more messages to trace one path: the other messages are muted automatically |
| Note | `{ note, over, position? }` | `over` is one participant id, or two to stretch across them. `position`: `over` (default), `left`, `right` |
| Fragment | `{ fragment, label?, steps[], branches? }` | `fragment`: `loop`, `alt`, `opt`, `par`, `critical`, `break`, `group`. `label` is the guard ("every 30 s", "card accepted"), drawn in brackets. `branches: [{ label?, steps[] }]` adds sections split by dashed lines: the `else` of an `alt`, the parallel arms of a `par` |
| Highlight | `{ highlight, steps[], color? }` | A tinted background behind a run of steps; `highlight` is a caption string or `true` |
| Phase | `{ phase, steps[], color? }` | A labelled band across the whole diagram with the name in a left gutter. Once one top-level step is a phase, all are (dividers and delays may sit between) |
| Divider | `{ divider }` | A double rule with a caption across all lifelines ("Next business day") |
| Delay | `{ delay }` | Time passes: a band where lifelines turn dotted, with a clock and a caption ("5 working days") |

Fragments nest up to four deep. Messages count toward the altitude node limit, except returns, which answer a call. Participant limits: 6 at executive, 10 at management, 14 at detailed.

### Colours

`color` (participants, groups, messages, notes, fragments, highlights, phases) takes a theme colour so it follows the theme: `accent`, `highlight`, `muted`, `ink`, a categorical slot `cat-1` … `cat-8`, a status colour `new`, `changed`, `retired`, `at-risk`, or a hex value `#RRGGBB` (a warning flags hex colours that would vanish on the theme background). A coloured participant tints its header and its activation bars; a coloured message draws its line and badge in that colour. Text colours are chosen for contrast automatically. Prefer `emphasis` for meaning and `color` for categories (one colour per party type, say).

### Style presets

| `style` field | Values | Default |
| --- | --- | --- |
| `participants` | `card` (rounded box), `pill`, `underline` (label over a coloured rule, no box), `plain` (label only) | `card` |
| `lifeline` | `dashed`, `dotted`, `solid` | `dashed` |
| `arrowheads` | `classic` (UML: calls filled, async and returns open), `filled`, `open` | `classic` |
| `shading` | `none` (line art), `soft` (fragments faintly tinted, phases banded), `banded` (soft plus a stripe behind every other message) | `soft` (`none` in themes without band fills) |
| `density` | `comfortable`, `compact` | `comfortable`; `compact` at detailed |
| `shadow` | `true` / `false` | from the theme |
| `mirror` | `true` repeats the headers under the lifelines (long diagrams) | `false` |

**Layout:** the gap between two lifelines is sized so every message label between them fits on one line (long labels wrap at about 220 units), and a long arrow's label sits in the clear gap next to the sender, so no lifeline or activation bar runs through the text. Labels sit on a plate the colour of whatever is behind them. Spare width spreads the lifelines out (to a comfortable maximum) and the diagram is centred. On a fixed canvas the rows tighten (compact, then tight) before the layout reports that it does not fit, and open up a little when there is room to spare.

**Capacity at 16:9:** about 6 participants across, and about 9 messages down with comfortable spacing (12–14 compact, with no subtitle). Phases, fragments and notes each take a row. Sequence diagrams run down the page: for longer flows use `"canvas": { "aspect": "auto" }` (the canvas grows to fit) or `"A4-portrait"`, or split the flow into two slides at a phase boundary.

## Writing tips

- **Executive:** 3–5 participants, 5–8 messages, no activation bars (the default), the slow or risky step accented, a `delay` or `timings` bracket for where the time goes. Title names the delay or the change. Skip returns that add nothing.
- **Management:** up to ~8 participants and ~20 calls; `numbering: "badge"` so the narrative can refer to steps; `alt` for the branch that matters; `groups` to show whose systems are whose; `phases` for a long flow.
- **Detailed:** full call and return pairs, `detail` lines for endpoints, `note`s for rules and timeouts; `"canvas": { "aspect": "auto" }`.
- Message labels are verb + object ("Authorise payment", "Send reset link"); returns name what comes back ("Account found", "Quote £1,240"). Participants are systems, services or roles, not people's names unless the user gave them.
- Use `kind: "external"` for parties outside the organisation, and a `group` to separate "us" from "them".

Names, figures and dates in the examples below are fictitious. Copy the structure, not the facts.

## Example: executive, with a delay

```json
{
  "version": "1.0",
  "type": "sequence",
  "altitude": "executive",
  "title": "New suppliers wait five days because the risk check runs after the contract",
  "body": {
    "participants": [
      { "id": "supplier", "label": "Supplier", "kind": "person" },
      { "id": "buying", "label": "Buying team" },
      { "id": "risk", "label": "Risk desk", "emphasis": "accent" },
      { "id": "finance", "label": "Finance" }
    ],
    "steps": [
      { "from": "supplier", "to": "buying", "label": "Submit quote" },
      { "from": "buying", "to": "supplier", "label": "Sign contract", "kind": "return" },
      { "from": "buying", "to": "risk", "label": "Request risk check", "emphasis": "accent" },
      { "delay": "5 working days" },
      { "from": "risk", "to": "buying", "label": "Supplier cleared", "kind": "return", "emphasis": "accent" },
      { "from": "buying", "to": "finance", "label": "Set up supplier record" },
      { "from": "finance", "to": "supplier", "label": "First payment", "kind": "async" }
    ]
  },
  "callout": { "text": "Running the risk check alongside the quote removes the five-day wait.", "anchor": "risk" }
}
```

## Example: management, with an alternative and a note

```json
{
  "version": "1.0",
  "type": "sequence",
  "altitude": "management",
  "title": "Each quote session lives for one request and is closed when the price is sent",
  "body": {
    "numbering": "badge",
    "participants": [
      { "id": "broker", "label": "Broker portal", "kind": "external" },
      { "id": "engine", "label": "Pricing engine", "emphasis": "accent" },
      { "id": "session", "label": "Quote session", "kind": "service" },
      { "id": "rates", "label": "Rate tables", "kind": "database" }
    ],
    "steps": [
      { "from": "broker", "to": "engine", "label": "Price this risk" },
      { "from": "engine", "to": "session", "label": "Open session", "create": true },
      { "from": "session", "to": "rates", "label": "Read rates" },
      { "from": "rates", "to": "session", "label": "Rates", "kind": "return" },
      { "fragment": "alt", "label": "broker has a discount", "steps": [
        { "from": "session", "to": "session", "label": "Apply discount" }
      ], "branches": [
        { "label": "list price", "steps": [
          { "note": "No change to the rate", "over": "session", "position": "right" }
        ]}
      ]},
      { "from": "session", "to": "engine", "label": "Price", "kind": "return", "destroy": "from" },
      { "from": "engine", "to": "broker", "label": "Quote £1,240", "kind": "return" }
    ]
  }
}
```

More: a card payment with phases, groups and a timing bracket (`ds example sequence --n 2`), and a detailed locker flow showing the style presets, `par`, `loop`, `break`, a highlight, a divider and custom colours (`ds example sequence --n 4`).

## From Mermaid

`ds import mermaid flow.mmd --out diagram.json` turns a Mermaid `sequenceDiagram` (or the first mermaid block in a Markdown file) into a draft spec: participants and actors with aliases and types, boxes, every arrow form, `+`/`-` and `activate`/`deactivate`, `create` and `destroy`, notes, `loop` / `alt` / `opt` / `par` / `critical` / `break` / `rect`, `autonumber` and the title. It reports anything it skipped. Then add what Mermaid cannot say: an action title, emphasis on the path that matters, `timings`, `phases`, and a style.

## Common mistakes

- **Too many messages for 16:9.** Merge call and return into one message where the return adds nothing, move detail into `detail` lines, or use `"canvas": { "aspect": "auto" }`.
- **Participants in an order that forces long arrows.** Order them so most messages go to a neighbour; the flow then reads left to right.
- **Group members that are not neighbours** (validation error). Reorder `participants`.
- **A phase inside a fragment, or only some top-level steps in phases** (validation error). Phases run across the whole diagram.
- **A participant used before the message that creates it**, or after its lifeline ended (validation error).
- **Accenting everything.** Accent the participant or the two or three messages the title is about; the rest of the flow mutes itself.
