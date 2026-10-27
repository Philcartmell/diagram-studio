#!/usr/bin/env node
// One version for the whole repository: the npm engine (engine/) and the Claude Code
// plugin (plugins/diagram-studio/) are versioned and released together, and every
// skill in the plugin pins the engine version it was released with.
//
//   node tools/release.mjs <x.y.z>          set the version everywhere and date the changelog
//   node tools/release.mjs check [v<x.y.z>] check every version agrees (and matches the tag)
//   node tools/release.mjs notes v<x.y.z>   print that version's changelog section
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  pkg: 'engine/package.json',
  lock: 'engine/package-lock.json',
  plugin: 'plugins/diagram-studio/.claude-plugin/plugin.json',
  agentPlugin: 'plugins/diagram-studio/plugin.json',
  skills: 'plugins/diagram-studio/skills',
  changelog: 'CHANGELOG.md',
};
const SEMVER = /^\d+\.\d+\.\d+$/;
// The sentences in each skill that carry the engine version.
const SKILL_PINS = [
  /released together with engine version (\d+\.\d+\.\d+)/,
  /reports (\d+\.\d+\.\d+) or a later \d+\.x version/,
  /npx -y diagram-studio@(\d+\.\d+\.\d+)/,
];

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
/** Every skill's SKILL.md, relative to the repository root. */
const skillFiles = () =>
  fs
    .readdirSync(path.join(ROOT, FILES.skills))
    .sort()
    .map((d) => `${FILES.skills}/${d}/SKILL.md`)
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

/** Every place the version appears, with the value found there. */
function versions() {
  const lock = JSON.parse(read(FILES.lock));
  return [
    [FILES.pkg, JSON.parse(read(FILES.pkg)).version],
    [`${FILES.lock} (version)`, lock.version],
    [`${FILES.lock} (packages[""])`, lock.packages[''].version],
    [FILES.plugin, JSON.parse(read(FILES.plugin)).version],
    [FILES.agentPlugin, JSON.parse(read(FILES.agentPlugin)).version],
    ...skillFiles().flatMap((f) => {
      const skill = read(f);
      return SKILL_PINS.map((re, i) => [`${f} (pin ${i + 1})`, skill.match(re)?.[1] ?? 'missing']);
    }),
  ];
}

function changelogSection(version) {
  const lines = read(FILES.changelog).split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
  if (start < 0) return undefined;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function check(tag) {
  const found = versions();
  const want = tag ? tag.replace(/^v/, '') : found[0][1];
  const wrong = found.filter(([, v]) => v !== want);
  if (wrong.length) fail(`Versions disagree (expected ${want}):\n${wrong.map(([f, v]) => `  ${f}: ${v}`).join('\n')}\nRun: node tools/release.mjs ${want}`);
  if (tag && !changelogSection(want)) fail(`CHANGELOG.md has no "## ${want}" section. Run: node tools/release.mjs ${want}`);
  console.log(`All versions are ${want}.`);
}

function setVersion(version) {
  if (!SEMVER.test(version)) fail(`"${version}" is not a version like 1.2.3.`);

  // Date the release in the changelog: "## Unreleased" becomes "## <version> (<date>)".
  // Checked before anything is written, so a refusal leaves every file as it was.
  let log = read(FILES.changelog);
  if (!changelogSection(version)) {
    const m = log.match(/^## Unreleased\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    if (!m || !m[1].trim()) fail('CHANGELOG.md has nothing under "## Unreleased". Write the release notes there first.');
    const date = new Date().toISOString().slice(0, 10);
    log = log.replace(/^## Unreleased\n/m, `## Unreleased\n\n## ${version} (${date})\n`);
  }

  const pkg = JSON.parse(read(FILES.pkg));
  pkg.version = version;
  write(FILES.pkg, JSON.stringify(pkg, null, 2) + '\n');
  const lock = JSON.parse(read(FILES.lock));
  lock.version = version;
  lock.packages[''].version = version;
  write(FILES.lock, JSON.stringify(lock, null, 2) + '\n');
  for (const f of [FILES.plugin, FILES.agentPlugin]) write(f, read(f).replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
  const major = version.split('.')[0];
  for (const f of skillFiles()) {
    write(
      f,
      read(f)
        .replace(SKILL_PINS[0], `released together with engine version ${version}`)
        .replace(SKILL_PINS[1], `reports ${version} or a later ${major}.x version`)
        .replace(SKILL_PINS[2], `npx -y diagram-studio@${version}`),
    );
  }
  write(FILES.changelog, log);
  check();
  // Annotated tag, pushed by name: `git push --follow-tags` skips lightweight tags.
  console.log(`Next: git commit -am "Release v${version}" && git tag -a v${version} -m v${version} && git push --atomic origin main v${version}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'check') check(arg);
else if (cmd === 'notes') {
  const notes = arg && changelogSection(arg.replace(/^v/, ''));
  if (!notes) fail(`No changelog section for ${arg ?? '(no version given)'}.`);
  console.log(notes);
} else if (cmd && SEMVER.test(cmd)) setVersion(cmd);
else fail('Usage: node tools/release.mjs <x.y.z> | check [v<x.y.z>] | notes v<x.y.z>');
