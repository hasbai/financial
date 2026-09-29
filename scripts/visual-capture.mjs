import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appName = process.argv[2];
if (!['financial', 'blog', 'zboard'].includes(appName)) throw new Error('Expected financial, blog or zboard');
const app = resolve(repo, 'apps', appName);
const manifest = JSON.parse(readFileSync(resolve(app, 'visual-coverage.json'), 'utf8'));
const ids = new Set(process.argv.slice(3));
const scenarios = manifest.scenarios.filter(scenario => ids.has(scenario.id));
if (!scenarios.length || scenarios.length !== ids.size) throw new Error('Unknown or empty scenario selection');

const runRoot = resolve(app, '.local-visual', new Date().toISOString().replaceAll(':', '-'));
const capture = resolve(runRoot, 'capture');
const review = resolve(runRoot, 'review');
mkdirSync(capture, { recursive: true });
mkdirSync(review, { recursive: true });
const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: app, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.error})`);
};
run('pnpm', ['build']);
const e2eEnv = appName === 'financial'
  ? { VITE_DATA_API_URL: 'http://127.0.0.1:4173/test-api' }
  : appName === 'blog'
    ? { PUBLIC_DATA_API_URL: 'http://127.0.0.1:4180/rest/v1', PUBLIC_ANONYMOUS_AUTH_URL: 'http://127.0.0.1:4180/auth' }
    : {};
run('pnpm', ['exec', 'vite', 'build', '--mode', 'e2e'], { ...process.env, ...e2eEnv });
if (appName !== 'blog') run('node', [appName === 'financial' ? 'scripts/prepare-browser-build.mjs' : '../financial/scripts/prepare-browser-build.mjs']);

const tasks = new Map();
for (const scenario of scenarios) for (const evidence of scenario.evidence ?? []) {
  for (const project of evidence.projects ?? []) {
    const key = JSON.stringify([evidence.spec, evidence.test, project]);
    tasks.set(key, { ...evidence, project });
  }
}
for (const { spec, test, project } of tasks.values()) {
  run('pnpm', ['exec', 'playwright', 'test', spec, '--project', project, '--grep', test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), '--update-snapshots=all'], {
    ...process.env, ...e2eEnv, LOCAL_VISUAL_CAPTURE_DIR: capture,
  });
}

let count = 0;
for (const scenario of scenarios) for (const evidence of scenario.evidence ?? []) {
  for (const project of evidence.projects ?? []) for (const snapshot of evidence.snapshots ?? []) {
    const source = resolve(capture, project, ...(appName === 'financial' ? [basename(evidence.spec)] : []), snapshot);
    if (!existsSync(source)) throw new Error(`Expected screenshot missing: ${source}`);
    const destination = resolve(review, scenario.id, project, snapshot);
    mkdirSync(resolve(review, scenario.id, project), { recursive: true });
    cpSync(source, destination);
    count++;
  }
}
console.log(`Captured ${count} screenshots in ${review}`);
