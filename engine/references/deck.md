# Decks

A deck is several pages rendered as **one** PowerPoint file (a slide per page), **one** PDF (a page per page, bookmarked by action title) and **one** draw.io file (a tab per page). A page is any diagram spec of any type (business diagrams, Azure and Databricks architectures, charts, exhibits), in its own file or inline, or a title or section page the engine draws. Render it like a single diagram: `ds render deck.json --pptx --pdf`.

The deck sets what must match across pages, so a deck is consistent by construction:

- **Theme:** the deck's `theme` applies to every page (a page entry may override it). An Azure or Databricks diagram keeps its official icons in any theme.
- **Canvas:** every page is drawn on the deck's `aspect` (default 16:9).
- **Title frame:** every action title sits in the same place, with an optional tracker `tag` above it ("Exhibit 3"). A page whose layout outgrows the canvas (a large architecture) is drawn as a figure under the standard frame rather than shrunk title and all.
- **Footer:** the deck's `classification` and page numbers on every page (not on the title page); its `source` on any page that gives none.
- **Series colours:** a chart series keeps its palette colour on every page it appears on, matched by its label (case and spacing ignored), so "China" is the same hue on page 2 and page 9. Series shown on the same page always differ; series that never meet may share a hue. This covers line charts and `categorical` bar charts; `sequential` bars shade by position, and emphasis (`accent`, `muted`) still wins on its own page. Spell a series the same way on every page for it to match.

## deck.json

| Field | Required | Notes |
| --- | --- | --- |
| `version` | yes | `"1.0"` |
| `title` | yes | The deck's name: file names, the PDF title, and the title page unless it sets its own |
| `subtitle` | | Shown on the title page ("Steering committee, November 2026") |
| `theme` | | Theme id for every page |
| `aspect` | | `16:9` (default), `4:3`, `A4-landscape`, `A4-portrait` |
| `footer` | | `{ source?, classification? }` |
| `pageNumbers` | | Default `true` |
| `pages[]` | yes | 1–60 entries, in order (below) |

Page entries:

| Entry | Draws |
| --- | --- |
| `{ "spec": "pages/03-costs.json", "tag": "Exhibit 2", "theme": "…" }` | A diagram spec file, relative to the deck file (an existing session's `working/diagram.json` works) |
| `{ "diagram": { …spec… }, "tag": "…" }` | An inline spec |
| `{ "kind": "title", "title": "…", "subtitle": "…", "tag": "24 October 2026" }` | A title page (title and subtitle default to the deck's) |
| `{ "kind": "section", "title": "How we will run it", "tag": "Section 2" }` | A full-bleed section divider |

Title and section pages also take `themeOverrides`, as a diagram spec does: `{ "color": { "accent": "#7A5CFA" } }` gives a divider its part's colour (give that part's pages the same override, so colour tells the reader where they are). `"inverted": true` draws the title page full-bleed in the accent, like a divider.

```json
{
  "version": "1.0",
  "title": "Platform investment case",
  "subtitle": "Steering committee, November 2026",
  "theme": "boardroom",
  "footer": { "classification": "Confidential" },
  "pages": [
    { "kind": "title", "tag": "24 October 2026" },
    { "kind": "section", "tag": "Section 1", "title": "Where the value comes from" },
    { "spec": "pages/02-cost-case.json", "tag": "Exhibit 1" },
    { "spec": "../finance-tom/working/diagram.json", "tag": "Exhibit 2" },
    { "spec": "pages/04-target-architecture.json", "tag": "Exhibit 3" }
  ]
}
```

## Outputs

`ds render deck.json --pptx --pdf --drawio --out <dir>` writes:

| File | What |
| --- | --- |
| `preview.png` | Every page as a numbered, titled thumbnail: view it first |
| `pages/NN-<slug>.png`, `.svg` | Each page at full size, for the self-review checklist |
| `<deck>.pptx` | One slide per page, native editable shapes, the title in each slide's title placeholder; pages with the same title position share one master |
| `<deck>.pdf` | One page per page, fonts embedded, bookmarks from the action titles |
| `<deck>.drawio` | One tab per page |
| `<deck>.storyline.md` | The action titles in order: read alone, they should make the argument |
| `<deck>.svg`, `<deck>.deck.json` | The contact sheet, and a copy of the deck as rendered |

Every page goes through the same validation and QA as a single diagram. Errors and warnings name the page (`page 4 (pages/03-costs.json): …`). If any page fails, only the previews are written. `ds validate deck.json` and `ds check deck.json` work on decks too.

## Writing a deck

- Agree the storyline first: one action title per page, in order. Read them aloud; if they do not make the argument, fix the titles before drawing anything.
- One message per page. Two messages make two pages.
- Number exhibits with `tag` and refer to them by number in the narrative.
- Keep series and emphasis consistent: a series that is accented on one page should not be muted on the next.
