# Writing diagrams for leaders

A leadership diagram is an argument, not an inventory. The title makes a claim; the picture proves it; the accent points at the proof.

## 1. Action titles

State the finding in one sentence, in sentence case, under 90 characters. A reader who sees only the title should know what you want them to believe.

| Topic title (avoid) | Action title (use) |
| --- | --- |
| Finance operating model | A shared finance hub frees business partners to focus on decisions |
| Invoice approval process | Invoices over £10k wait two days for a second approval |
| Platform overview | Three platforms carry 80% of customer journeys |
| 2027 roadmap | The ERP switch in Q3 2027 unlocks the finance hub a year later |
| Initiative prioritisation | Three initiatives deliver most of the value for modest effort |

Only use numbers the user gave you. If you do not have the number, write the claim without it ("Second approvals add days to large invoices"), or ask.

The `subtitle` carries scope: what, where, when ("Target finance operating model, 2027"). The `callout` carries the "so what" in one sentence, anchored to the element it explains.

## 2. Choose the altitude for the room

| Room | Altitude | What to keep |
| --- | --- | --- |
| Board, ExCo, steering committee | `executive` | ≤ 9 nodes. Names, maybe one line each. One accent. A so-what callout. |
| Department leadership, programme board | `management` | ≤ 20 nodes. Owners, short descriptions, metrics. |
| Working team, design document | `detailed` | ≤ 60 nodes. Full detail, tags, legend. |

Default to `executive`. If the user's content does not fit, **summarise before you raise the altitude**:

- Group siblings: "Accounts payable", "Accounts receivable", "General ledger" → "Transaction processing".
- Move the detail into a `description`, or into the speaker notes (the PPTX notes carry the subtitle and callout).
- Drop what does not serve the title's claim.

## 3. Labels

- Short noun phrases, 1–4 words at executive altitude: "Finance hub", "Credit check", "Data platform".
- Sentence case ("Record to report"), not Title Case, not ALL CAPS.
- Plain words over jargon. For non-technical audiences: "Customer data" not "CDP"; "Connects systems" not "ESB".
- Decisions are short questions: "Over £10k?", "Complete?".
- Consistent grammar within a set: all verbs ("Submit invoice", "Approve spend") or all nouns, never mixed.
- No trailing punctuation; avoid ampersands in long labels; spell out abbreviations once in the subtitle if needed.

## 4. Emphasis: one thing to look at

- `accent` marks **the** element the title is about. One, at most two, at executive altitude.
- `highlight` is a quieter second focus.
- `muted` pushes context back (legacy, out of scope).
- Status badges (`new`, `changed`, `retired`, `at-risk`) explain change; use them on target-state and transformation diagrams, not on everything.
- If everything is emphasised, nothing is. The renderer warns above the limit.

## 5. Facts

Never invent facts, owners, dates, volumes, percentages or metrics. Use the user's words for names of teams and systems. When you summarise, keep the meaning; do not add claims. If a key fact is missing and the diagram does not work without it, ask one short question.

## 6. The self-review questions

1. Does the title state a finding, and does the picture prove it at a glance?
2. Is the eye drawn first to the accented element?
3. Is anything cramped, orphaned or visually unbalanced?
4. Would a senior executive understand it without a voice-over?

Typical fixes: tighten the title; move the accent to the element that proves the claim; group nodes; drop a lane that only has one step; add the callout; switch `canvas.aspect` to `auto` for large detailed diagrams.
