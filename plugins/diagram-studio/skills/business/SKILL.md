---
name: business
description: Runs a business diagram design session with the user. It asks a few sharp questions about the message, audience and content, proposes two or three visual concepts (operating model, swimlane, roadmap, value chain, 2x2 matrix or layered architecture) side by side on a live preview board, refines the chosen one through conversation, and exports PowerPoint, draw.io, SVG, PNG or PDF when the user is happy. Use it when someone describes a diagram or slide they want to build ("I need a slide showing our operating model", "help me visualise this process", "what's the best way to show X, Y and Z?"), wants to explore options, or wants to keep tweaking a diagram until it is right. Not for Azure architecture diagrams with Azure icons, VNets or ARM templates (this plugin's azure skill draws those), Databricks lakehouse, pipeline or platform diagrams (this plugin's databricks skill), data charts (bar, line, pie), org charts, or AWS and Google Cloud diagrams.
argument-hint: "[what the diagram or slide should show]"
---

# Diagram Studio: business design session

You run a short design conversation: understand the message, show visual concepts, refine the chosen one with the user while they watch a live board, and export when they are happy. The `diagram-studio` engine does all layout, styling, QA and export from a JSON spec. You write the spec; you never draw, position or colour anything yourself.

## The engine

This plugin is released together with engine version 1.0.0. Check it once per session with `diagram-studio version`, and use that command if it reports 1.0.0 or a later 1.x version. Otherwise (not installed, or older) use `npx -y diagram-studio@1.0.0` wherever `diagram-studio` appears below: the first call downloads the engine and later calls reuse the cache. Both need Node 20 or later. If the user will draw often, suggest `npm install -g diagram-studio`.

The spec rules ship with the engine, so read them from it rather than from memory:

| When | Read |
| --- | --- |
| Once per session, before the first spec | `diagram-studio docs guide`: spec essentials, altitude limits, action titles, error fixes, self-review checklist, themes, exports. Its **Workflow** section describes a one-shot mode; in a design session follow the workflow below instead |
| Once per session | `diagram-studio docs writing-for-leaders` |
| Before writing a spec of a type | `diagram-studio docs <type>` (body fields, capacity, writing tips). `diagram-studio example <type>` prints a starter spec: copy its structure, never its facts |
| When unsure of an envelope field | `diagram-studio docs spec-format` |

## The session folder

One folder per diagram, under `diagrams/` in the user's working folder. Name it in short kebab-case after the topic (`finance-tom`, `invoice-approval`).

```
diagrams/<session>/
  brief.md                        what you know: message, audience, content, assumptions, open questions
  concepts/a-<form>/spec.json     one folder per concept, rendered in place (b-…, c-…)
  working/diagram.json            the chosen direction, edited every round
  working/history/v01.json        a copy after each clean render, for "go back"
  exports/                        the final deliverables
```

If the folder already exists, you are resuming: read `brief.md` and `working/diagram.json` (or the concepts), then say in one line where things stand.

## The live board

Start it once per session, as a background command, as soon as the session folder exists:

```
diagram-studio preview diagrams/<session> --open
```

It prints `{"url": …}` and opens the default browser. In the Claude desktop app, if you have a built-in browser or preview tool, open the URL there instead of passing `--open`, so the board sits beside the chat. The board refreshes itself after every render and shows the newest render large, with every render (working design starred, concepts lettered A, B, C) in a thumbnail strip underneath, newest first. The user can click a thumbnail or use the arrow keys to look back; the next render takes over the main view again. On a phone-sized screen it stacks every render instead. It shows `brief.md` in a side panel and marks a render whose last attempt failed QA. Give the user the URL once. If a board for this folder is already running, reuse it. If no browser can open (a remote or headless session), skip the board, describe each render in words and give the file paths.

## Workflow

### 1. Understand the brief

From what the user has given you, pull out:

- **Message:** what the reader should believe afterwards. This becomes the action title.
- **Audience and room**, which set the altitude (board or ExCo means `executive`, a programme board means `management`, a working team means `detailed`).
- **Content:** the things themselves (teams, steps, phases, capabilities, items) and how they relate (who hands off to whom, what sits on what, what comes before what).
- **Where it will be used:** a slide in a deck (16:9, `boardroom`), a page in a document (`A4-landscape` or `A4-portrait`, `minimal` or `print`), or a workshop wall (`sketch`).

Then ask only what you cannot infer, in **one** `AskUserQuestion` call with at most four questions, most important first:

1. **Visual form**, when more than one fits. Give the two or three forms that suit the content, each with a `preview`: a small ASCII sketch of *their* content in that form (patterns in `references/visual-forms.md`). Add "Show me concepts" as an option when the choice is genuinely open.
2. **Audience**, if unknown.
3. **Message**: two or three draft action titles built only from what they told you. They can type their own.
4. **Where it will be used**, if unclear.

Do not ask about export formats yet. Never put facts up as multiple choice: if content is missing (the steps, the teams, the dates), ask for it in plain words, once, and list exactly what you need. Never fill a gap with invented names, numbers, owners or dates. Without `AskUserQuestion`, ask the same questions as a short numbered list.

Skip the questions when the request is already specific ("swimlane of these six steps across these three teams for the ExCo"): write the brief and go straight to step 3 with a single spec.

Write `brief.md`: four short sections (Message, Audience, Content, Assumptions and open questions), with content as the user gave it. Mark anything you assumed. Update it whenever the user changes the message, audience or facts.

### 2. Show concepts

Make two or three concepts that are **different ways of seeing the content**, not one picture in three themes. `references/visual-forms.md` lists which forms fit which content and how to make concepts diverge: a different form, or the same form telling a different story (a different accent, grouping or orientation). Use the same theme for every concept so the comparison is about structure.

For each concept, write `concepts/<letter>-<form>/spec.json` and run `diagram-studio render <that spec> --png`. Fix errors until it renders clean (each error's `hint` says how), view its `preview.png` and run the self-review checklist from the guide. Then present the concepts in chat, one line each: the letter, the form, what it makes obvious, what it costs. Ask "Which direction?" with `AskUserQuestion`, one option per concept. The user may also say "A's layers with C's accent": combine them.

### 3. Refine

Copy the chosen spec to `working/diagram.json`, merging in anything the user asked to combine. Then repeat for each request:

1. Edit only the fields the request touches. `references/refining.md` maps common requests ("make finance stand out", "too busy", "flip it") to spec edits. Never rebuild the spec from scratch.
2. `diagram-studio render diagrams/<session>/working/diagram.json --png`. Fix errors until clean.
3. View `working/preview.png` and run the self-review checklist.
4. Copy `diagram.json` to `working/history/vNN.json` (the next number).
5. Reply in a line or two: what changed, plus any trade-off you made ("moved the callout under the diagram so six lanes fit"). The board shows the picture, so do not describe it at length or paste the spec.

Batch several small requests into one render. "Undo" or "go back to the one before" means copy that history version over `diagram.json` and re-render. If the engine cannot do something (free positioning, colours per box, a diagram type it lacks), say so plainly and offer the nearest thing it can do.

### 4. Export

When the user is happy ("that's it", "export it", "looks good"), ask which formats they want if they have not said. Use one multi-select `AskUserQuestion`: PowerPoint (one editable 16:9 slide), draw.io, SVG, PNG, PDF. Then run:

```
diagram-studio render diagrams/<session>/working/diagram.json --out diagrams/<session>/exports --pptx --drawio --png --pdf
```

Pass only the flags they chose (`--all` for everything). SVG is always written. List the files with their paths, pass on any `notes` from the render output (the PPTX font note, for example), and mention that `exports/<slug>.diagram.json` is the source for later changes. The board shows the exports as downloads. Leave the board running unless they ask you to stop it.

## Rules

- **Never invent facts.** Names, figures, owners, dates and statuses come from the user. Record assumptions in `brief.md` and say them in one line.
- **Edit the spec, never an output.** No hand-written SVG, no editing the PPTX or draw.io files.
- **Keep chat short.** The board carries the picture; chat carries decisions and trade-offs.
- **One diagram per session folder.** A second diagram gets its own session. Multi-slide decks are not supported yet: offer one diagram per slide.
- **Stay inside the six business types.** For data charts, org charts, journey maps or AWS and Google Cloud diagrams, say the engine does not draw them yet, and offer the nearest supported form only if it genuinely fits.
- **Azure and Databricks architectures belong to their skills.** When the user wants Azure services drawn with their icons, networks, subnets and private endpoints, or a diagram from an ARM template, hand over to `/diagram-studio:azure`. For a Databricks lakehouse, pipeline, deployment or platform map, hand over to `/diagram-studio:databricks`. Draw it here only as a plain `layered-architecture`, without Azure icons, when the audience is non-technical and the user wants that.
