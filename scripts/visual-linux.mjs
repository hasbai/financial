import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const image = 'ghcr.io/hasbai/financial-visual-ci@sha256:c9bf5b87b7fe570b8325227127bda13718071021836560c14924a0c2387b7991';
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const app = process.argv[2];
if (!['financial', 'blog', 'zboard'].includes(app)) throw new Error('Usage: node scripts/visual-linux.mjs <financial|blog|zboard> [--all|--page <source-or-scenario>]');
const manifest = JSON.parse(readFileSync(join(repo, 'apps', app, 'visual-coverage.json'), 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: repo });
const paths = bytes => bytes.toString().split('\0').filter(Boolean);
const tracked = () => [...new Set(paths(git('ls-files', '-z', '--cached', '--others', '--exclude-standard')))]
  .filter(path => existsSync(join(repo, path))).sort();
const digest = files => {
  const hash = createHash('sha256');
  for (const path of files) hash.update(path).update('\0').update(readFileSync(join(repo, path)));
  return hash.digest('hex');
};
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item => {
  const path = join(dir, item.name);
  return item.isDirectory() ? walk(path) : [path];
});

const selected = new Set();
let all = false;
const args = process.argv.slice(3);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--all') all = true;
  else if (args[i] === '--page' && args[i + 1]) selected.add(args[++i]);
  else throw new Error('Unknown option: ' + args[i]);
}
if (!all && !selected.size) {
  const files = paths(git('diff', '--name-only', '-z', 'origin/main', '--'))
    .concat(paths(git('ls-files', '-z', '--others', '--exclude-standard')));
  const prefix = `apps/${app}/`;
  const sources = new Set(manifest.pages.map(page => prefix + page.source));
  const unknown = files.filter(path => (path.startsWith('packages/') || path.startsWith(prefix + 'src/')
    || path.startsWith(prefix + 'e2e/') || path === prefix + 'visual-coverage.json') && !sources.has(path));
  if (unknown.length) throw new Error('Shared UI changes need explicit --page or --all:\n' + unknown.join('\n'));
  for (const path of files) if (sources.has(path)) selected.add(path.slice(prefix.length));
  if (!selected.size) { console.log('No changed page with a visual scenario.'); process.exit(0); }
}
const ids = new Set();
for (const page of manifest.pages) if (all || selected.has(page.source)) for (const id of page.scenarios ?? []) ids.add(id);
for (const value of selected) {
  if (manifest.scenarios.some(scenario => scenario.id === value)) ids.add(value);
  else if (!manifest.pages.some(page => page.source === value)) throw new Error('Unknown page or scenario: ' + value);
}
if (!ids.size) { console.log('No changed page with a visual scenario.'); process.exit(0); }

const files = tracked();
const stage = join(repo, '.local-visual', 'linux-workspace');
mkdirSync(stage, { recursive: true });
const indexFile = join(stage, '.source-files.json');
const previous = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
for (const path of previous) if (!files.includes(path) && !path.split('/').includes('..')) rmSync(join(stage, path), { force: true });
for (const path of files) {
  mkdirSync(dirname(join(stage, path)), { recursive: true });
  cpSync(join(repo, path), join(stage, path), { force: true, dereference: false });
}
writeFileSync(indexFile, JSON.stringify(files));
const localRoot = join(stage, 'apps', app, '.local-visual');
const before = new Set(existsSync(localRoot) ? readdirSync(localRoot) : []);
const command = 'pnpm install --frozen-lockfile && node scripts/visual-capture.mjs "$@"';
const result = spawnSync('docker', [
  'run', '--rm', '--init', '--ipc=host', '--platform', 'linux/arm64',
  '--mount', 'type=bind,source=' + stage + ',target=/work',
  '--workdir', '/work', image, 'sh', '-lc', command, 'visual-linux', app, ...ids,
], { cwd: repo, stdio: 'inherit' });
if (result.status !== 0) throw new Error('Pinned Linux visual run failed: ' + (result.status ?? result.error));

const runName = readdirSync(localRoot).filter(name => !before.has(name)).sort().at(-1);
if (!runName) throw new Error('Linux run produced no review images');
const destination = join(repo, 'apps', app, '.local-visual', runName);
cpSync(join(localRoot, runName), destination, { recursive: true });
const review = join(destination, 'review');
const screenshots = new Map();
for (const source of walk(review).filter(path => path.endsWith('.png'))) {
  const parts = relative(review, source).split(sep);
  if (parts.length !== 3) throw new Error('Unexpected review image: ' + source);
  const [id, project, snapshot] = parts;
  const scenario = manifest.scenarios.find(value => value.id === id);
  const evidence = scenario?.evidence?.find(value => value.projects.includes(project) && value.snapshots.includes(snapshot));
  if (!evidence) throw new Error('Unlisted visual evidence: ' + source);
  const baseline = app === 'financial'
    ? `apps/${app}/e2e/__screenshots__/linux-ci-${project}/${evidence.spec.split('/').at(-1)}/${snapshot}`
    : `apps/${app}/e2e/__screenshots__/linux-ci/${project}/${snapshot}`;
  const hash = sha(source);
  if (screenshots.has(baseline) && screenshots.get(baseline).sha256 !== hash) throw new Error('Conflicting candidate: ' + baseline);
  screenshots.set(baseline, { baseline, review: relative(destination, source).replaceAll(sep, '/'), sha256: hash });
}
if (!screenshots.size) throw new Error('Linux run produced no PNG candidates');
writeFileSync(join(destination, 'candidate.json'), JSON.stringify({
  app, image, sourceDigest: digest(files), screenshots: [...screenshots.values()],
}, null, 2) + '\n');
console.log('Review ' + screenshots.size + ' Linux screenshots in ' + review);
console.log('After review: node scripts/import-local-visual.mjs ' + destination + ' --reviewed');
