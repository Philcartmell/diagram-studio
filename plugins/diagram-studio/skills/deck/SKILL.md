---
name: deck
description: Runs a deck design session with the user. It agrees the storyline first (one action title per page), then builds each page as any Diagram Studio type (business diagrams, Azure and Databricks architectures, bar and column charts, waterfalls, line charts, KPI figures, and exhibits that combine them with text), shows the whole deck on a live preview board, refines page by page, and exports one PowerPoint (a slide per page), one PDF and one draw.io file with consistent titles, theme, classification and page numbers. Use it when someone wants several slides for one meeting ("a steering committee pack", "five slides for the board on the platform case", "turn these diagrams into a deck", "add the cost chart to the deck"), or wants to combine diagrams they already made into one file. Not for a single slide (this plugin's business, azure and databricks skills design those, and their sessions can become deck pages).
argument-hint: "[what the deck is for, or the diagrams to combine]"
---

# Diagram Studio: deck design session

You run a short design conversation: agree what the deck must argue, as a storyline of action titles, then build each page, refine the deck with the user while they watch a live board, and export when they are happy. The `diagram-studio` engine does all layout, styling, QA and export. You write one JSON spec per page and a `deck.json` that lists them; you never draw, position or colour anything yourself.

## The engine

This plugin is released together with engine version 1.1.0. Check it once per session with `diagram-studio version`, and use that command if it reports 1.1.0 or a later 1.x version. Otherwise (not installed, or older) use `npx -y diagram-studio@1.1.0` wherever `diagram-studio` appears below: the first call downloads the engine and later calls reuse the cache. Both need Node 20 or later. If the user will draw often, suggest `npm install -g diagram-studio`.

The rules ship with the engine, so read them from it rather than from memory:

| When | Read |
| --- | --- |
| Once per session, first | `diagram-studio docs deck`: deck.json, page entries, what the deck makes consistent, outputs |
| Once per session, before the first page | `diagram-studio docs guide` (spec essentials, the "Numbers" rule, altitude, action titles, error fixes, self-review checklist) and `diagram-studio docs writing-for-leaders`. In a deck session follow the workflow below, not the guide's one-shot workflow |
| Before writing a page of a type | `diagram-studio docs <type>`; `diagram-studio example <type>` prints a starter spec: copy its structure, never its facts. For a slide that combines a chart with its argument, `diagram-studio docs exhibit` |
| Before an Azure or Databricks page | `diagram-studio docs azure-style` or `databricks-style` as well |

## The session folder

One folder per deck, under `decks/` in the user's working folder, named in short kebab-case after the meeting (`steerco-nov`, `platform-case`).

```
decks/<deck>/
  brief.md                       audience, decision sought, storyline, facts as given, assumptions, open questions
  deck.json                      the deck: theme, classification, and the pages in order
  pages/NN-<slug>.json           one spec per page this session owns (02-cost-case.json, …)
  history/vNN/                   a copy of deck.json and pages/ after each clean render, for "go back"
  exports/                       the rendered deck (previews, pages/, and the deliverables)
```

A page may also point at another session's working spec (`"spec": "../../diagrams/finance-tom/working/diagram.json"`): edits made in that session then flow into the deck. If the folder exists, you are resuming: read `brief.md` and `deck.json`, then say in one line where things stand.

## The live board

Start it once per session, in the background, as soon as the folder exists:

```
diagram-studio preview decks/<deck>/exports --open
```

The board shows the deck as one card: a contact sheet of every page, numbered and titled, with the PowerPoint, PDF and draw.io downloads once they exist. Give the user the URL once and reuse a running board. Without a browser, describe the pages in words and give the file paths.

## Workflow

### 1. Brief and storyline

Pull out, from what the user has given you: the **audience and room** (sets the altitude: `executive` unless told otherwise), the **decision or belief** the deck should leave behind, the **facts** (as given: figures with units, periods and sources, names, dates), and any **existing diagrams** to include (sessions under `diagrams/`, files the user points at).

Then draft the **storyline**: one action title per page, in order, each stating a finding, under 90 characters, built only from the user's facts. A typical shape: title page; the answer; three to five supporting pages, each one message; what we need from you. Show it as a numbered list and ask in **one** `AskUserQuestion` call (at most four questions): is the storyline right (accept, or tell me what to change), the audience if unknown, and anything you cannot infer. Never put facts up as multiple choice: ask for missing figures, names or dates in plain words, once, listing exactly what you need.

Write `brief.md` with the agreed storyline. The titles are the spine of the deck: change them only with the user.

### 2. Build the pages

For each page choose the form that proves its title (`references/visual-forms.md` in the business skill covers the business and chart forms; a chart beside its argument is an `exhibit`; an Azure or Databricks design is its own type). Then:

1. Write `pages/NN-<slug>.json` (or reuse an existing session's spec as it is). Give every page the agreed title.
2. Render it alone first: `diagram-studio render decks/<deck>/pages/NN-<slug>.json --png --out decks/<deck>/scratch/NN`, fix errors until clean, view its `preview.png` and run the self-review checklist.
3. Add it to `deck.json` with a `tag` ("Exhibit N") if the deck numbers its exhibits.

Add a `{ "kind": "title" }` page first, and `{ "kind": "section" }` dividers only for decks of eight pages or more. Set the deck's `theme` (the user's brand theme if they have one), `footer.classification` if the material is confidential, and a default `footer.source` only if every page shares it.

Then render the deck:

```
diagram-studio render decks/<deck>/deck.json --out decks/<deck>/exports
```

Fix every error (each names its page and file), view `exports/preview.png` for the deck as a whole and `exports/pages/*.png` for any page you changed, and read `exports/<deck>.storyline.md`: the titles alone should make the argument. Copy `deck.json` and `pages/` to `history/vNN/`.

### 3. Refine

Requests are about a page ("make the waterfall start at zero"), about the order ("move costs before benefits"), or about the deck ("use our brand", "mark it confidential", "no page numbers"). Edit only what the request touches: the page spec (with the business skill's `references/refining.md` for wording-to-field mappings), the order of `pages`, or the deck fields. Re-render the deck, view the changed pages, copy to `history/`, and reply in a line or two. A change to a title changes the argument: confirm it with the user and update `brief.md`.

### 4. Export

When the user is happy, ask which formats they want if they have not said (one multi-select `AskUserQuestion`: PowerPoint, PDF, draw.io). Then:

```
diagram-studio render decks/<deck>/deck.json --out decks/<deck>/exports --pptx --pdf --drawio
```

Pass only the flags they chose. List the files, pass on the render `notes` (the PPTX font note; any page drawn as a scaled figure), and mention that `deck.json` and `pages/` are the source for later changes.

## Rules

- **Storyline first.** Agree the titles before drawing pages; one message per page.
- **Never invent facts, never compute a figure.** Names, figures, owners, dates and statuses come from the user; charts take their values as given and the engine works out totals, differences and shares. Record assumptions in `brief.md`.
- **Edit specs, never outputs.** No hand-written SVG; never edit the PPTX, PDF or draw.io files.
- **Consistency is the deck's job.** Leave theme, canvas and classification to `deck.json`; do not set them per page unless the user wants an exception. Keep a series that is accented on one page from being muted on the next.
- **Keep chat short.** The board carries the pages; chat carries decisions and trade-offs.
