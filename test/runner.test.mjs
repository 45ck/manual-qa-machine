import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { QARunner, DEFAULT_POLICIES } = await import("../dist/index.js");

function buildFlow(sessionMode = "reuse") {
  return {
    formatVersion: 1,
    id: "signup-smoke",
    name: "Signup Smoke",
    startUrl: "https://example.com/signup",
    sessionMode,
    viewports: [{ name: "desktop", width: 1440, height: 900 }],
    steps: [{ kind: "checkpoint", name: "ready" }],
    assertions: [],
    policies: DEFAULT_POLICIES,
  };
}

function createEvidence(callIndex) {
  return {
    actualUrl:
      callIndex === 0
        ? "https://example.com/signup"
        : "https://example.com/dashboard",
    consoleEvents: [],
    networkEvents: [],
    pageErrors: [],
    accessibility: [],
    artifacts: {
      screenshotPath: `shot-${callIndex}.png`,
      snapshotPath: `shot-${callIndex}.snapshot.json`,
    },
    raw: {},
  };
}

test("runner uses persisted session names only in reuse mode", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "mqm-runner-"));
  const adapterOptions = [];
  const runner = new QARunner({
    outputDir,
    adapterFactory(options) {
      adapterOptions.push(options);
      return createStubAdapter();
    },
  });

  const report = await runner.runFlow(buildFlow("reuse"));

  assert.equal(adapterOptions.length, 1);
  assert.match(adapterOptions[0].sessionId, /signup-smoke-desktop-0-/);
  assert.equal(adapterOptions[0].sessionName, "signup-smoke-reuse");
  assert.equal(report.session.name, "signup-smoke-reuse");
});

test("runner leaves persisted session names unset in fresh mode", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "mqm-runner-"));
  const adapterOptions = [];
  const runner = new QARunner({
    outputDir,
    adapterFactory(options) {
      adapterOptions.push(options);
      return createStubAdapter();
    },
  });

  const report = await runner.runFlow(buildFlow("fresh"));

  assert.equal(adapterOptions.length, 1);
  assert.equal(adapterOptions[0].sessionName, undefined);
  assert.equal(report.session.name, "fresh-per-viewport");
});

test("runner downgrades to inconclusive when evidence capture fails", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "mqm-runner-"));
  let captureCount = 0;
  const runner = new QARunner({
    outputDir,
    adapterFactory() {
      return createStubAdapter({
        async captureEvidence() {
          if (captureCount === 1) {
            captureCount += 1;
            throw new Error("capture broke");
          }
          const evidence = createEvidence(captureCount);
          captureCount += 1;
          return evidence;
        },
      });
    },
  });

  const report = await runner.runFlow(buildFlow("reuse"));
  const failedStep = report.runs[0].steps[1];

  assert.equal(failedStep.verdict, "inconclusive");
  assert.match(failedStep.notes[0], /evidence capture failed/i);
  assert.equal(report.verdict, "inconclusive");
});

test("runner does not treat informational console logs as console errors", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "mqm-runner-"));
  const runner = new QARunner({
    outputDir,
    adapterFactory() {
      return createStubAdapter({
        async captureEvidence() {
          return {
            ...createEvidence(0),
            consoleEvents: [{ level: "info", message: "hello world" }],
          };
        },
      });
    },
  });

  const report = await runner.runFlow(buildFlow("reuse"));

  assert.equal(report.runs[0].steps[0].verdict, "pass");
  assert.equal(report.runs[0].steps[1].verdict, "pass");
});

function createStubAdapter(overrides = {}) {
  return {
    async verify() {},
    async prepareSession() {},
    async runStep() {},
    async captureEvidence() {
      return createEvidence(0);
    },
    async evaluateAssertion(assertion) {
      return { kind: assertion.kind, passed: true, message: "Passed." };
    },
    async finalize() {},
    ...overrides,
  };
}
