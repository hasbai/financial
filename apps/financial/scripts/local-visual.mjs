import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repo = resolve(app, '../..');
const manifest = JSON.parse(readFileSync(resolve(app, 'visual-coverage.json'), 'utf8'));
const args = process.argv.slice(2);
const selected = new Set();
let all = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--all') all = true;
  else if (args[i] === '--page' && args[i + 1]) selected.add(args[++i]);
  else throw new Error(`Unknown option: ${args[i]}`);
}

const tracked = execFileSync('git', ['diff', '--name-only', '-z', 'origin/main', '--'], { cwd: repo });
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repo });
const files = [...new Set(Buffer.concat([tracked, untracked]).toString().split('\0').filter(Boolean))];
if (!all && !selected.size) {
  const sources = new Set(manifest.pages.map(page => `apps/financial/${page.source}`));
  const unknownUi = files.filter(file => (file.startsWith('packages/') || file.startsWith('apps/financial/src/') || file.startsWith('apps/financial/e2e/') || file === 'apps/financial/visual-coverage.json') && !sources.has(file));
  if (unknownUi.length) throw new Error(`Shared UI files need explicit --page <source-or-scenario> or --all:\n${unknownUi.join('\n')}`);
  for (const file of files) if (sources.has(file)) selected.add(file.slice('apps/financial/'.length));
}

const ids = new Set();
for (const page of manifest.pages) {
  if (all || selected.has(page.source)) for (const id of page.scenarios ?? []) ids.add(id);
}
for (const value of selected) {
  if (manifest.scenarios.some(scenario => scenario.id === value)) ids.add(value);
  else if (!manifest.pages.some(page => page.source === value)) throw new Error(`Unknown page or scenario: ${value}`);
}
const scenarios = manifest.scenarios.filter(scenario => ids.has(scenario.id));
if (!scenarios.length) {
  console.log('No changed page with a visual scenario.');
  process.exit(0);
}

const runRoot = resolve(app, '.local-visual', new Date().toISOString().replaceAll(':', '-'));
const capture = resolve(runRoot, 'capture');
const review = resolve(runRoot, 'review');
mkdirSync(capture, { recursive: true });
mkdirSync(review, { recursive: true });
const run = (command, commandArgs, env = process.env) => {
  const result = spawnSync(command, commandArgs, { cwd: app, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed (${result.status ?? result.error})`);
};
run('pnpm', ['build']);
run('pnpm', ['exec', 'vite', 'build', '--mode', 'e2e'], {
  ...process.env, VITE_DATA_API_URL: 'http://127.0.0.1:4173/test-api',
});
run('node', ['scripts/prepare-browser-build.mjs']);

const tasks = new Map();
for (const scenario of scenarios) for (const evidence of scenario.evidence ?? []) {
  for (const project of evidence.projects ?? []) {
    const key = JSON.stringify([evidence.spec, evidence.test, project]);
    tasks.set(key, { ...evidence, project });
  }
}
for (const { spec, test, project } of tasks.values()) {
  run('pnpm', ['exec', 'playwright', 'test', spec, '--project', project, '--grep', test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), '--update-snapshots=all'], {
    ...process.env, LOCAL_VISUAL_CAPTURE_DIR: capture,
  });
}

let count = 0;
for (const scenario of scenarios) for (const evidence of scenario.evidence ?? []) {
  for (const project of evidence.projects ?? []) for (const snapshot of evidence.snapshots ?? []) {
    const source = resolve(capture, project, basename(evidence.spec), snapshot);
    if (!existsSync(source)) throw new Error(`Expected local screenshot missing: ${source}`);
    const destination = resolve(review, scenario.id, project, snapshot);
    mkdirSync(resolve(review, scenario.id, project), { recursive: true });
    cpSync(source, destination);
    count++;
  }
}
console.log(`Captured ${count} changed-page screenshots for ${[...ids].join(', ')}: ${review}`);
console.log('Local screenshots are review evidence; merge-queue CI still compares darwin-ci baselines.');
