import type {
  AssertionResult,
  QAAssertion,
  QATarget,
  StepEvidence,
} from "../types.js";
import {
  buildAssertionResult,
  evaluateRequestAssertion,
} from "./agent-browser-assertions.js";
import { buildTextPresenceScript } from "./dom-scripts.js";
import { diffImages } from "../diff.js";

export interface BrowserAssertionContext {
  evaluateBoolean(script: string): Promise<boolean>;
  targetState(target: QATarget, state: "visible" | "enabled"): Promise<boolean>;
}

export interface BrowserAssertionOptions {
  outputDir: string;
  stepKey: string;
}

export async function evaluateBrowserAssertion(
  context: BrowserAssertionContext,
  assertion: QAAssertion,
  evidence: StepEvidence,
  options: BrowserAssertionOptions,
): Promise<AssertionResult> {
  switch (assertion.kind) {
    case "textPresent":
      return buildAssertionResult(
        assertion.kind,
        await context.evaluateBoolean(buildTextPresenceScript(assertion.text)),
        `Expected page text to include "${assertion.text}".`,
      );
    case "urlContains":
      return buildAssertionResult(
        assertion.kind,
        evidence.actualUrl.includes(assertion.value),
        `Expected URL to include "${assertion.value}".`,
      );
    case "elementVisible":
      return buildAssertionResult(
        assertion.kind,
        await context.targetState(assertion.target, "visible"),
        "Expected target to be visible.",
      );
    case "elementEnabled":
      return buildAssertionResult(
        assertion.kind,
        await context.targetState(assertion.target, "enabled"),
        "Expected target to be enabled.",
      );
    case "requestOccurred":
      return evaluateRequestAssertion(assertion, evidence.networkEvents);
    case "noCriticalA11yViolations":
      return buildAssertionResult(
        assertion.kind,
        evidence.accessibility.filter((issue) => issue.severity === "critical")
          .length === 0,
        "Expected no critical accessibility violations.",
      );
    case "visualDiffBelow":
      return evaluateDiffAssertion(
        assertion,
        evidence,
        options.outputDir,
        options.stepKey,
      );
  }
}

async function evaluateDiffAssertion(
  assertion: Extract<QAAssertion, { kind: "visualDiffBelow" }>,
  evidence: StepEvidence,
  outputDir: string,
  stepKey: string,
): Promise<AssertionResult> {
  const screenshotPath = evidence.artifacts.screenshotPath;
  if (!screenshotPath) {
    return buildAssertionResult(
      assertion.kind,
      false,
      "No screenshot was captured for diff comparison.",
    );
  }
  const diffPath = `${outputDir}\\${stepKey}-diff.png`;
  const result = await diffImages(
    assertion.baselinePath,
    screenshotPath,
    diffPath,
  );
  evidence.artifacts.diffPath = diffPath;
  return buildAssertionResult(
    assertion.kind,
    result.mismatchRatio <= assertion.threshold,
    `Expected visual diff ratio <= ${assertion.threshold}, got ${result.mismatchRatio.toFixed(4)}.`,
  );
}
