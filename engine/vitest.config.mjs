import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const tests = fileURLToPath(new URL('./tests', import.meta.url));

// Tests live in tests/ and exercise the compiled scripts/dist/ (what ships). Themes
// and icons they create go to a scratch user folder, never the real one.
export default defineConfig({
  test: {
    dir: tests,
    include: ['**/*.test.mjs'],
    testTimeout: 180000,
    hookTimeout: 180000,
    pool: 'forks',
    env: { DIAGRAM_STUDIO_HOME: `${tests}/.tmp/user` },
  },
});
