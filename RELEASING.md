# Releasing

The engine (npm package `diagram-studio`, in `engine/`) and the plugin (`diagram-studio`, in `plugins/`) share **one version** and are released together. The version lives in four places, and `tools/release.mjs` keeps them in step:

| Where | What it does |
| --- | --- |
| `engine/package.json` (and its lockfile) | The npm version |
| `plugins/diagram-studio/.claude-plugin/plugin.json` | The plugin version. Claude Code offers users an update only when it changes |
| `plugins/diagram-studio/skills/*/SKILL.md` (every skill) | The engine version each skill runs: `npx -y diagram-studio@<version>`, or an installed `diagram-studio` of that version or a later one with the same major |
| `CHANGELOG.md` | One section per version; the GitHub release notes come from it |

CI fails if they disagree (`node tools/release.mjs check`). A new skill must carry the same "The engine" paragraph as the others, or the check fails.

## How a release reaches users

- **The plugin** comes from the default branch of this repository, through the marketplace in `.claude-plugin/marketplace.json`. Users get it with `claude plugin marketplace update` and `claude plugin update`.
- **The engine** is staged on npm by `.github/workflows/release.yml` when you push a `v<version>` tag, and goes live when you approve it on npmjs.com with 2FA. The workflow's trusted publisher may only stage, so no version reaches users without that approval. Each version carries provenance, linking the package to the commit and workflow that built it.

Because the skills pin the engine version, a plugin release always runs the engine it was tested with. Push the release commit and its tag **together**, in one push (step 4 below), and approve the staged version as soon as the workflow finishes. Until then, a user who updates the plugin gets an `npx` error, because the version the skills ask for isn't live yet.

## Versioning

Semantic versioning, judged by what a spec, a script or a skill relies on:

- **Major:** a spec field, diagram type, theme, CLI command or flag is removed or renamed; output files are named differently; a valid spec now fails validation; a skill is renamed or removed (its command changes). The skills accept a later engine within the same major only, so a breaking change must bump the major.
- **Minor:** a new skill (a new domain such as Databricks), new diagram features, spec fields, commands, icons or themes.
- **Patch:** fixes, layout improvements that keep specs valid, documentation.

Golden renders change with layout improvements. Review the `engine/tests/__golden__` diff (`npm run test:update-golden`) and mention visible changes in the changelog.

## Every release

1. Write the notes under `## Unreleased` in `CHANGELOG.md`, in the plugin and engine subsections.
2. Set the version everywhere and date the notes:

   ```bash
   node tools/release.mjs 1.1.0
   ```

3. Check it locally:

   ```bash
   cd engine && npm test && npm pack --dry-run && cd ..
   claude plugin validate .
   claude --plugin-dir ./plugins/diagram-studio     # try a short session with each skill you changed
   ```

4. Commit, tag and push together:

   ```bash
   git commit -am "Release v1.1.0"
   git tag -a v1.1.0 -m v1.1.0
   git push --atomic origin main v1.1.0
   ```

   Name the tag in the push. `git push --follow-tags` sends only annotated tags, so a plain `git tag v1.1.0` would never reach GitHub and the release would never start. `main` and `v*` tags are protected by rulesets (see below). As a repository admin you bypass them for this push.

5. The release workflow checks that the tag matches every version, runs the full suite, stages `diagram-studio@1.1.0` on npm and creates the GitHub release from the changelog section. Watch it with `gh run watch`.
6. **Approve the staged version** on npmjs.com (the package's staged versions), or from a terminal: `npm stage list diagram-studio`, then `npm stage approve <id>` (npm 11.15 or later; it asks for your 2FA). Approval waits for npm's malware scan to finish. Once approved, the version is `latest` on npm. Check with `npm view diagram-studio version`.

If the workflow fails:

- **A problem outside the code** (npm settings, a network error): fix it, then re-run the failed job with `gh run rerun <run-id> --failed`. On `PUT https://registry.npmjs.org/diagram-studio`, an `E404` means npm didn't recognise the workflow, and an `E403 OIDC permission denied for this action` means the trusted publisher isn't allowed the command the workflow ran. Check the trusted publisher (step 6 of "Going public").
- **A problem in the code, found before publishing:** fix it, then move the tag (`git tag -fa v1.1.0 -m v1.1.0 && git push -f origin v1.1.0`) so it runs again on the fixed commit.
- **The version is already staged:** npm won't stage it twice, so approve or reject it (`npm stage reject <id>`) before re-running.

Once a version is on npm it cannot be republished: release a patch instead. The workflow skips the stage step when that version is already on npm, so a re-run only redoes the GitHub release.

## Branch and tag protection

Two rulesets (repository **Settings** → **Rules**) guard what reaches users:

- **Protect main:** changes arrive through a pull request with all five CI jobs passing, merged by squash or rebase. No force-pushes, no deletion.
- **Protect release tags:** only repository admins can create, move or delete `v*` tags. Pushing one stages a release on npm.

Repository admins bypass both, which the release commit and tag need. Outside contributors work from forks. Their CI runs wait for an admin's approval, and only an admin can merge.

## Going public: the first release (once)

The repository starts private. While it is private you can install the plugin from it yourself (Claude Code uses your git credentials) or load it with `--plugin-dir`, but nobody else can, and nothing is on npm. Don't push a `v*` tag until step 6.

1. **Check the icon terms.** The npm package contains Microsoft's Azure icons and Databricks' product artwork, and a public package redistributes them. Read Microsoft's current terms for the icons and Databricks' brand guidelines (see the `NOTICE.md` in `engine/assets/azure-icons/` and `engine/assets/databricks-icons/`) before publishing.
2. **Make the repository public:**

   ```bash
   gh repo edit Philcartmell/diagram-studio --visibility public --accept-visibility-change-consequences
   ```

   The repository URL appears in `engine/package.json` (`repository`, `homepage`, `bugs`), `plugin.json` and the README. npm provenance checks `repository.url` against the repository that publishes, so update those if the repository ever moves.
3. **Create an npm account** at [npmjs.com](https://www.npmjs.com/signup), turn on two-factor authentication, then sign in from a terminal: `npm login`.
4. **Check the name is still free:** `npm view diagram-studio` should answer 404.
5. **Publish 1.0.0 by hand.** Trusted publishing (step 6) is set up on a package that already exists:

   ```bash
   node tools/release.mjs 1.0.0          # dates the 1.0.0 notes
   git commit -am "Release v1.0.0"
   cd engine && npm publish && cd ..     # builds and runs the full suite first
   ```

6. **Turn on trusted publishing** at npmjs.com: the package's **Settings** → **Trusted publisher** → **GitHub Actions**, with owner `Philcartmell`, repository `diagram-studio`, workflow `release.yml`, no environment, and **Allowed actions: npm stage publish** only. From now on the workflow stages each release without any stored token, and you approve it with 2FA. Then, under **Publishing access**, require two-factor authentication and disallow tokens, so nothing reaches users without your 2FA.
7. **Tag and push:**

   ```bash
   git tag -a v1.0.0 -m v1.0.0
   git push --atomic origin main v1.0.0
   ```

   The workflow sees 1.0.0 already on npm, skips the publish and creates the GitHub release.
8. **Try it as a user would**, in a fresh terminal: `claude plugin marketplace add Philcartmell/diagram-studio`, `claude plugin install diagram-studio@diagram-studio`, restart, and run `/diagram-studio:azure`.

If you would rather publish with a token than with trusted publishing, create a granular access token on npmjs.com with publish rights to `diagram-studio`, store it as the repository secret `NPM_TOKEN`, and add `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the publish step.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: the full suite on Linux with Node 20, 22 and 24, and on Windows and macOS with Node 24, then the version check and a dry-run pack. Windows and macOS minutes cost more than Linux on a private repository, so they run on one Node version only. `scripts/dist/` is built by `npm ci` (`prepare`) and on publish, never committed.
