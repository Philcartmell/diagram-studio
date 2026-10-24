# Contributing

Thanks for helping with Diagram Studio. Bug reports, fixes, new icons and new diagram ideas are all welcome.

## Before you start

- **Bugs and small fixes:** open an issue or go straight to a pull request.
- **New diagram types, skills or spec fields:** open an issue first so we can agree on the shape before you build it. Specs are a public format, and the version rules in [RELEASING.md](RELEASING.md) make breaking changes expensive.
- **Security problems:** don't open a public issue. See [SECURITY.md](SECURITY.md).

## Set up

You need Node 20 or later and git. To try the plugin, you also need [Claude Code](https://claude.com/claude-code).

```bash
git clone https://github.com/<you>/diagram-studio      # your fork
cd diagram-studio/engine
npm ci            # installs dependencies and builds scripts/dist/
npm test          # the full suite (about 30 seconds)
npm link          # optional: your `diagram-studio` command runs this checkout
cd ..
claude --plugin-dir ./plugins/diagram-studio           # try the skills from your checkout
```

The engine is TypeScript in `engine/scripts/src/`, and the CLI runs the compiled `engine/scripts/dist/`. Run `npm run build` after a change, or `npm test`, which builds first. `dist/` is never committed.

## Making a change

- **Golden renders.** `npm test` renders every example in every theme. Each must match its snapshot in `engine/tests/__golden__/`, the SVG exactly and the PNG to within 0.1% of pixels. If your change is meant to alter how diagrams look, run `npm run test:update-golden`, look at the changed images, and say in the pull request what changed and why. Unexplained golden changes won't be merged.
- **Changelog.** Add a line under `## Unreleased` in [CHANGELOG.md](CHANGELOG.md), in the plugin or engine section.
- **Versions.** Don't change version numbers. They're set at release time by `tools/release.mjs`.
- **Skills.** If you change a skill in `plugins/diagram-studio/skills/`, try a short session with it through `--plugin-dir`. Keep the "The engine" paragraph each skill shares: CI checks it.
- **Icons.** The Azure and Databricks icons belong to Microsoft and Databricks. Don't edit the SVGs. Regenerate them from the official packs with `npm run azure-icons` or `npm run databricks-icons` (see the `NOTICE.md` beside each set), and follow the rules there: never recolour, crop or distort an icon, and always label it.
- **Dependencies.** Keep exact versions in `engine/package.json`. Mention new or upgraded dependencies in the pull request.

## Pull requests

CI runs the full suite on Linux (Node 20, 22 and 24), Windows and macOS. For a first-time contributor's pull request, it starts once a maintainer approves the run. All five jobs must pass before a pull request can merge, and a maintainer merges it, by squash or rebase.

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE) that covers this repository's code.
