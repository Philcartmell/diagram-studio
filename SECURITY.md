# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Use GitHub's private reporting: the repository's **Security** tab → **Report a vulnerability**. Only the maintainer sees the report, and we can fix it before it's disclosed.

Include what you found, how to reproduce it (a spec, a command, or a file), and what an attacker could do with it.

## Scope

- The `diagram-studio` npm package (the engine and CLI in `engine/`)
- The `diagram-studio` Claude Code plugin (`plugins/diagram-studio/`)
- The release workflow that publishes them (`.github/workflows/`)

Fixes go into the latest 1.x release.

## How releases are protected

Releases are published to npm only from this repository's release workflow, using npm trusted publishing with provenance. Each version on npm links to the commit and workflow run that built it. Only repository admins can push the `v*` tags that trigger a release.
