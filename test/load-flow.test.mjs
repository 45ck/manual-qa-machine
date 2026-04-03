import assert from "node:assert/strict";
import test from "node:test";

const { loadFlow, DEFAULT_VIEWPORTS } = await import("../dist/index.js");

test("loadFlow compiles legacy flows into the canonical QAFlow model", () => {
  const loaded = loadFlow({
    name: "Signup Smoke",
    url: "https://example.com/signup",
    steps: [
      { action: "type", target: "#email", value: "test@example.com" },
      { action: "click", target: "Create account" },
      { action: "assert", target: "Dashboard" },
    ],
  });

  assert.equal(loaded.flow.formatVersion, 1);
  assert.equal(loaded.flow.startUrl, "https://example.com/signup");
  assert.equal(loaded.flow.steps[0].kind, "type");
  assert.equal(loaded.flow.steps[1].kind, "click");
  assert.equal(loaded.flow.steps[2].kind, "assert");
  assert.deepEqual(loaded.flow.viewports, DEFAULT_VIEWPORTS);
  assert.match(loaded.warnings[0], /legacy flow/i);
});

test("loadFlow accepts canonical flows without rewriting them", () => {
  const loaded = loadFlow({
    formatVersion: 1,
    id: "dashboard-smoke",
    name: "Dashboard Smoke",
    startUrl: "https://example.com/dashboard",
    sessionMode: "fresh",
    viewports: [{ name: "desktop", width: 1440, height: 900 }],
    steps: [{ kind: "checkpoint", name: "ready" }],
    assertions: [{ kind: "textPresent", text: "Dashboard" }],
    policies: {
      consoleErrors: { max: 0, allowMessages: [] },
      networkFailures: { max: 0, allowUrls: [] },
      pageErrors: { max: 0, allowMessages: [] },
      performance: {},
      accessibility: { maxCritical: 0 },
    },
  });

  assert.equal(loaded.flow.id, "dashboard-smoke");
  assert.equal(loaded.flow.sessionMode, "fresh");
  assert.equal(loaded.warnings.length, 0);
});
