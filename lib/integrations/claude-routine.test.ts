import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClaudeJob,
  isRoutineFailure,
  isRoutineSuccess,
  signJobId,
  validateRoutineUrl,
  verifyJobSignature,
} from "./claude-routine";

process.env.INTEGRATIONS_MASTER_KEY = "x".repeat(40);

const GOOD = "https://api.anthropic.com/v1/claude_code/routines/trig_01Hyx/fire";

test("validateRoutineUrl accepts the Anthropic fire endpoint", () => {
  assert.equal(validateRoutineUrl(GOOD), GOOD);
});

test("validateRoutineUrl rejects other hosts, http and other paths", () => {
  assert.throws(() => validateRoutineUrl("https://evil.com/v1/claude_code/routines/a/fire"));
  assert.throws(() => validateRoutineUrl(GOOD.replace("https", "http")));
  assert.throws(() => validateRoutineUrl("https://api.anthropic.com/v1/messages"));
});

test("verifyJobSignature accepts its own signature and rejects tampering", () => {
  const sig = signJobId("job-1");
  assert.equal(verifyJobSignature("job-1", sig), true);
  assert.equal(verifyJobSignature("job-2", sig), false);
  assert.equal(verifyJobSignature("job-1", "short"), false);
});

test("buildClaudeJob embeds a signed callback and the demo URL", () => {
  const job = buildClaudeJob({
    jobId: "job-1",
    demoUrl: "https://net.example/acme/",
    callbackBaseUrl: "https://app.example",
    dryRun: false,
    lead: { placeId: "abc", name: "Acme" },
  });
  const cb = new URL(job.options.callback_url);
  assert.equal(cb.pathname, "/api/webhooks/claude-demo");
  assert.equal(cb.searchParams.get("job"), "job-1");
  assert.equal(verifyJobSignature("job-1", cb.searchParams.get("sig")!), true);
  assert.equal(job.demo_url, "https://net.example/acme/");
  assert.equal(job.options.dry_run, false);
});

test("routine completion statuses map to ready", () => {
  for (const status of ["completed", "DONE", " success ", "ready"]) {
    assert.equal(isRoutineSuccess(status), true, status);
    assert.equal(isRoutineFailure(status), false, status);
  }
});

test("routine failure statuses are failures, never ready", () => {
  for (const status of ["failed", "Error"]) {
    assert.equal(isRoutineFailure(status), true, status);
    assert.equal(isRoutineSuccess(status), false, status);
  }
});

test("unfinished or unknown statuses are neither ready nor failed", () => {
  for (const status of ["needs_credentials", "", undefined, null, 42]) {
    assert.equal(isRoutineSuccess(status), false, String(status));
    assert.equal(isRoutineFailure(status), false, String(status));
  }
});
