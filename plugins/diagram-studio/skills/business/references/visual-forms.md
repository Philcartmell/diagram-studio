# Visual forms

How to match content to a form, how to sketch each form for an `AskUserQuestion` preview, and how to make concepts that differ.

## Which forms fit the content

Start from the shape of what the user gave you, not from the words they used. "Operating model" content is often best shown as layers, but sometimes as a value chain or a swimlane.

| The content is mostly… | Strong fits | Also worth a concept when… |
| --- | --- | --- |
| Groups of capabilities or teams, and who serves whom | `operating-model` | the point is the end-to-end flow of value (`value-chain`) or the handoffs between the groups (`swimlane`) |
| Steps done by different teams, in order | `swimlane` | the steps fall into a few big stages and the handoffs are not the point (`value-chain`) |
| Things that happen over time, by workstream | `roadmap` | the message is "what first" rather than "when" (`matrix-2x2` with impact against effort) |
| A chain of activities from input to outcome | `value-chain` | each activity has clear owners and handoffs (`swimlane`) |
| Items compared on two qualities | `matrix-2x2` | the items group into a few buckets with no second axis (`operating-model` with a layer per bucket) |
| Systems or components stacked by role | `layered-architecture` | the audience thinks in teams rather than systems (`operating-model`) |

If only one form fits, say so and make the concepts differ in story instead (see below).

Azure services, networks and deployments are drawn by the azure skill (`/diagram-studio:azure`), and Databricks pipelines and platforms by the databricks skill (`/diagram-studio:databricks`), with the official icons. Here a cloud platform is a `layered-architecture` in plain words, for readers who do not need the services named.

## What each form needs from the user

Ask for exactly what is missing, in plain words. Never fill a gap yourself.

| Form | Needs | Nice to have |
| --- | --- | --- |
| `operating-model` | the layers and what sits in each | who it serves (customers), foundations, governance |
| `swimlane` | the teams or roles, the steps in order, who does each | decisions and their branches, phases, the bottleneck and its delay |
| `roadmap` | the time horizons, the workstreams, what lands where | milestones, gates, owners, what is at risk |
| `value-chain` | the activities in order | support activities, the outcome, the focus areas |
| `matrix-2x2` | the two axes, the items, where each item sits (scores or a quadrant) | quadrant names, a third value as a metric |
| `layered-architecture` | the layers and the components in each | cross-cutting concerns, external parties, what is new, changed or retired |

## Sketches for option previews

An `AskUserQuestion` option can carry a `preview`, shown in a monospace box beside the options. Draw the user's **own** labels into the sketch, shortened if needed, so they see their content in each form. Keep it to about 8 lines and 56 columns. These are the patterns, shown with placeholder labels.

`operating-model`:

```
        Served:  Retail · Commercial · Wealth
 ┌──────────────────────────────────────────┐  ┌─────┐
 │ Partnering   [ Business partners       ] │  │ Gov │
 │ Expertise    [ FP&A ] [ Tax ] [ Control ] │  │     │
 │ Hub          [ R2R  ] [ P2P ] [ O2C     ] │  │     │
 └──────────────────────────────────────────┘  └─────┘
   Foundations:  ERP · Data platform · Controls
```

`swimlane`:

```
 Requester │ [Submit]──┐
 ──────────┼───────────┼──────────────────────────
 Manager   │           └─▶[Approve]─▶<Over £10k?>─┐
 ──────────┼──────────────────────────────────────┼─
 Finance   │                                    └─▶[Pay]
```

`roadmap`:

```
                Now          Next          Later
 Platform    ███████████    ██████
 Process            ████████████████   ◆ Go-live
 People                       ███████████████
 ─────────────────────────┊ gate ┊──────────────────
```

`value-chain`:

```
 ┌ Support: HR · Finance · IT ─────────────────────┐
 ▶ Source ▶ Make ▶ Deliver ▶ Sell ▶ Service ▶ Margin
   · lever   · lever  · lever   · lever  · lever
```

`matrix-2x2`:

```
  High │  Quick wins      │  Big bets
 value │    • A   • B     │    • C
       ├──────────────────┼──────────────────
   Low │  Fill-ins        │  Avoid
       │    • D           │    • E
       └──── Low ──── effort ──── High ─────
```

`layered-architecture`:

```
 ┌ Partners ┐ ┌ Channels   [ Web ] [ App ] [ Branch ] ┐ ┌ Security ┐
 │ Bank     │ │ Services   [ Orders ] [ Payments ]    │ │          │
 │ Regulator│ │ Data       [ Customer data ]          │ │ Monitor  │
 └──────────┘ └ Platform   [ Cloud hosting ]  ────────┘ └──────────┘
```

## Making concepts diverge

Each concept should make a different thing obvious. In order of preference:

1. **A different form.** Layers (who serves whom) against a chain (how value flows) against lanes (who hands off to whom).
2. **The same form, a different story.**
   - *Accent:* the bottleneck step, the new layer, or the at-risk workstream. Each one implies a different title.
   - *Grouping:* nine capabilities in three layers, or three towers with three items each. Fewer, bigger groups read faster at executive altitude.
   - *Orientation and canvas:* a horizontal swimlane for a slide, a vertical one for many lanes or a portrait page.
   - *Altitude:* an executive summary next to a management view, when the user is unsure how much detail the room wants.
3. **Never** a theme change alone. A theme is a styling choice, offered after a direction is picked.

Give each concept its own action title that matches what it makes obvious. When presenting, give one line per concept: the letter, the form, what it makes obvious, and what it gives up ("B: swimlane. Shows the two-day wait at second approval. Loses the hub-and-spoke picture.").
