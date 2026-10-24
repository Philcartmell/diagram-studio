// Rewrites the golden SVG snapshots and PNG baselines after an intended visual change.
// Review the resulting diff (tests/__golden__) before committing it.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', '-u', 'golden'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, UPDATE_GOLDEN: '1' },
});
process.exit(r.status ?? 1);
