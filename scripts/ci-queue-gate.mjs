import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredContexts = ['check', 'visual', 'blog-check', 'blog-visual', 'zboard-check', 'zboard-visual'];

export function checkQueueGate(event, result, rules = []) {
  if (event === 'pull_request') {
    const queue = rules.some(rule => rule.type === 'merge_queue');
    const checks = rules.filter(rule => rule.type === 'required_status_checks')
      .flatMap(rule => rule.parameters?.required_status_checks ?? []);
    const missing = requiredContexts.filter(context => !checks.some(check =>
      check.context === context && check.integration_id === 15368));
    if (!queue || missing.length) throw new Error(`PR admission requires the protected merge queue and all GitHub Actions checks; missing: ${missing.join(', ') || 'merge_queue'}`);
    return 'PR admitted; full acceptance runs on the merge group.';
  }
  if (!['merge_group', 'workflow_dispatch'].includes(event)) throw new Error(`Unexpected CI event: ${event}`);
  if (result !== 'success') throw new Error(`Full check did not pass: ${result || 'missing'}`);
  return 'Full check passed for the integrated commit.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.CI_EVENT;
  const rules = event === 'pull_request'
    ? JSON.parse(readFileSync(`${process.env.RUNNER_TEMP}/main-rules.json`, 'utf8')) : [];
  console.log(checkQueueGate(event, process.env.CI_RESULT, rules));
}
