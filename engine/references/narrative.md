# narrative

A short block of text: an optional heading, paragraphs, and bulleted points with an optional bold lead-in each. Mostly used as the left-hand panel of an `exhibit` (the argument beside the chart), or for a "benefits and risks" page.

**Use for:** the explanation beside an exhibit, implications and next steps, benefits and risks.
**Not for:** anything with structure a diagram would show better: steps (`swimlane`), layers (`operating-model`), phases (`roadmap`).

## Body fields

| Field | Required | Notes |
| --- | --- | --- |
| `heading` | | Up to 60 characters, in the accent colour |
| `paragraphs[]` | | 1–4 strings, up to 400 characters each |
| `bullets[]` | | 1–8 `{ lead?, text }`. The lead is a bold line (a figure or a two-word point), the text explains it |

At least one of the three is required. Keep it short: an `executive` narrative carries about 90 words, `management` 160 (the validator warns past that).

## Writing tips

- Lead with figures where you have them: "$140 billion a year" then what it buys.
- Every bullet should support the title; cut the rest.

Names and figures in the example below are fictitious. Copy the structure, not the facts.

## Example

```json
{
  "version": "1.0",
  "type": "narrative",
  "title": "Automating the two largest warehouses pays back in four years, if we manage two risks",
  "subtitle": "What the board should weigh before committing capital",
  "body": {
    "heading": "Benefits",
    "bullets": [
      { "lead": "Later cut-off", "text": "Robotic picking lets both sites ship next-day orders placed up to 10 pm." },
      { "lead": "Fewer errors", "text": "Scan-to-pack checks remove most of the mis-picks behind customer returns." },
      { "lead": "Supplier risk", "text": "Few vendors can deliver at this scale; the plan depends on ours keeping its build slots." },
      { "lead": "Payback risk", "text": "Fit-out costs fall in the first two years while the savings build over five." }
    ]
  }
}
```
