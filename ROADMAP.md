# Roadmap

Where Diagram Studio is going. Version 1.0.0 has the engine, the `azure`, `databricks` and `business` skills, the live preview board, and one shared version for the npm package and the plugin.

Every skill works from the same **session folder** (`diagrams/<name>/`: `brief.md`, `concepts/`, `working/`, `history/`, `exports/`). The skill writes it, the engine renders into it, and each view (the browser board now, a Claude Code pane later) only reads it. Keeping that contract stable lets each item below ship on its own.

## Go public

- Check Microsoft's terms for redistributing the Azure icons, and Databricks' brand guidelines for the Databricks artwork, in a public npm package.
- Make the repository public, publish 1.0.0 to npm and turn on trusted publishing (see [RELEASING.md](RELEASING.md)).
- Optionally submit the plugin to Anthropic's plugin directory, which requires a name nobody else has listed there.
- `pptxgenjs` depends on a version of `image-size` with a denial-of-service advisory for formats the engine never passes it (JXL, HEIF, ICNS). Update when `pptxgenjs` moves to a fixed version.

## Databricks follow-ups

The `databricks` skill, the `databricks-architecture` type, the icon catalog and the theme shipped in 1.0.0. Next, from the style analysis:

- **Capability chips.** Databricks' own reference maps show capabilities as green text chips inside white panels rather than icons. A chip node look would let a platform map match them exactly.
- **Use-case overlays.** Databricks fades the unused panels of the reference map and draws one or two paths across it. `"emphasis": "muted"` already fades a panel; a documented overlay pattern (and an example) would make it routine.
- **Badges on the line.** Databricks puts ringed step badges on the path; the engine places filled badges beside it, as Microsoft does.
- **Draft from a deployment.** As `azure import` drafts from ARM, draft a topology from a Databricks asset bundle, Terraform state or the workspace API.
- **More examples:** RAG, MLOps across dev, staging and production workspaces, Private Link on Azure.

## Azure follow-ups

- Line jumps where flows cross.
- Read Bicep directly (today: `az bicep build` first).
- More reference patterns as examples: hub and spoke with Virtual WAN, the AKS baseline, the Foundry chat baseline.

## Tighten the loop

- **Auto-render hook:** a `PostToolUse` hook in the plugin renders any spec under `diagrams/**` that Claude writes and hands the QA result back, so the board updates even if Claude skips a step.
- **Point and say:** spec ids are already SVG element ids. The board draws the SVG inline, so clicking a box can show its id and label and write `diagrams/<name>/.selection.json`. "Make *this* the accent" then needs no naming.
- **Visual history:** the board already shows every rendered folder as a thumbnail strip, newest first. Keep the SVG with each `history/vNN` snapshot too, so the strip can show every version of the working design for "go back to v3".

## A pane inside Claude Code

Claude Code plugins can open a pane and draw it from a hook: an SVG on the desktop app and in VS Code, a PNG in terminals that show images (the browser board stays the answer elsewhere). Pane buttons can run slash commands, so "Use B", "Undo" and "Export…" can drive the skill directly. SVG sources are capped at 131,072 characters, so large detailed diagrams may need a lean preview SVG without embedded fonts. Start with a one-day spike: a pane that draws the working SVG, with fonts, size and refresh checked.

## Later

- Decks: several diagrams in one session, exported as one PPTX.
- Corporate `.potx` masters, org charts and journey maps.
- A project-level `.diagram-studio/` folder, so a team can share a brand theme through its repository.
- Other destinations and sources: push the SVG to a Miro board; import Mermaid and draw.io.
