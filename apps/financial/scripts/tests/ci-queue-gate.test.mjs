import assert from "node:assert/strict";
import { test } from "node:test";
import { checkQueueGate } from "../../../../scripts/ci-queue-gate.mjs";

const contexts = ["check", "visual", "blog-check", "blog-visual", "zboard-check", "zboard-visual"];
const rules = [
  { type: "merge_queue" },
  { type: "required_status_checks", parameters: {
    required_status_checks: contexts.map(context => ({ context, integration_id: 15368 })),
  } },
];

test("PR admission requires the protected queue and all six GitHub Actions contexts", () => {
  assert.match(checkQueueGate("pull_request", "skipped", rules), /admitted/);
  assert.throws(() => checkQueueGate("pull_request", "skipped", rules.slice(1)), /merge_queue/);
  assert.throws(() => checkQueueGate("pull_request", "skipped", [rules[0], {
    type: "required_status_checks", parameters: {
      required_status_checks: contexts.slice(0, 4).map(context => ({ context, integration_id: 15368 })),
    },
  }]), /zboard-check/);
});

test("merge group requires a successful full job", () => {
  assert.match(checkQueueGate("merge_group", "success"), /passed/);
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    assert.throws(() => checkQueueGate("merge_group", result), /did not pass/);
  }
});
