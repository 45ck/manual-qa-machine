import type {
  AssertionResult,
  PolicyResult,
  QAFlow,
  StepResult,
  Verdict,
  ViewportRun,
} from "./types.js";

export function evaluatePolicies(
  flow: QAFlow,
  steps: StepResult[],
): PolicyResult[] {
  return [
    consolePolicy(flow, steps),
    networkPolicy(flow, steps),
    pageErrorPolicy(flow, steps),
    performancePolicy(flow, steps),
    accessibilityPolicy(flow, steps),
  ];
}

export function classifyStepVerdict(
  step: StepResult,
  actionFailed: boolean,
): Verdict {
  if (
    !step.evidence.artifacts.screenshotPath ||
    !step.evidence.artifacts.snapshotPath
  ) {
    return "inconclusive";
  }
  if (actionFailed || step.assertions.some((assertion) => !assertion.passed)) {
    return "fail";
  }
  if (
    step.evidence.consoleEvents.some((event) =>
      isConsoleErrorEvent(event.level),
    ) ||
    step.evidence.networkEvents.some((event) => !event.ok) ||
    step.evidence.pageErrors.length > 0 ||
    step.evidence.accessibility.some((issue) => issue.severity === "critical")
  ) {
    return "pass_with_warnings";
  }
  return "pass";
}

export function classifyRunVerdict(
  steps: StepResult[],
  assertions: AssertionResult[],
  policies: PolicyResult[],
): Verdict {
  if (steps.some((step) => step.verdict === "inconclusive"))
    return "inconclusive";
  if (
    policies.some((policy) => !policy.passed) ||
    assertions.some((assertion) => !assertion.passed)
  ) {
    return "fail";
  }
  if (steps.some((step) => step.verdict === "fail")) return "fail";
  if (steps.some((step) => step.verdict === "pass_with_warnings"))
    return "pass_with_warnings";
  return "pass";
}

export function combineRunVerdicts(runs: ViewportRun[]): Verdict {
  if (runs.some((run) => run.verdict === "fail")) return "fail";
  if (runs.some((run) => run.verdict === "inconclusive")) return "inconclusive";
  if (runs.some((run) => run.verdict === "pass_with_warnings"))
    return "pass_with_warnings";
  return "pass";
}

function consolePolicy(flow: QAFlow, steps: StepResult[]): PolicyResult {
  const disallowed = steps.flatMap((step) =>
    step.evidence.consoleEvents.filter(
      (event) =>
        isConsoleErrorEvent(event.level) &&
        !flow.policies.consoleErrors.allowMessages?.some((value) =>
          event.message.includes(value),
        ),
    ),
  );
  return policyResult(
    "consoleErrors",
    disallowed.length <= flow.policies.consoleErrors.max,
    `Console error policy failed with ${disallowed.length} event(s).`,
  );
}

function isConsoleErrorEvent(level: string): boolean {
  return ["assert", "error"].includes(level.toLowerCase());
}

function networkPolicy(flow: QAFlow, steps: StepResult[]): PolicyResult {
  const disallowed = steps.flatMap((step) =>
    step.evidence.networkEvents.filter(
      (event) =>
        !event.ok &&
        !flow.policies.networkFailures.allowUrls?.some((value) =>
          event.url.includes(value),
        ),
    ),
  );
  return policyResult(
    "networkFailures",
    disallowed.length <= flow.policies.networkFailures.max,
    `Network failure policy failed with ${disallowed.length} request(s).`,
  );
}

function pageErrorPolicy(flow: QAFlow, steps: StepResult[]): PolicyResult {
  const disallowed = steps.flatMap((step) =>
    step.evidence.pageErrors.filter(
      (error) =>
        !flow.policies.pageErrors.allowMessages?.some((value) =>
          error.message.includes(value),
        ),
    ),
  );
  return policyResult(
    "pageErrors",
    disallowed.length <= flow.policies.pageErrors.max,
    `Page error policy failed with ${disallowed.length} error(s).`,
  );
}

function performancePolicy(flow: QAFlow, steps: StepResult[]): PolicyResult {
  const snapshots = steps
    .map((step) => step.evidence.performance)
    .filter(Boolean);
  const pageLoadFailed =
    flow.policies.performance.maxPageLoadMs !== undefined &&
    snapshots.some(
      (snapshot) =>
        (snapshot?.loadMs ?? 0) > flow.policies.performance.maxPageLoadMs!,
    );
  const domFailed =
    flow.policies.performance.maxDomContentLoadedMs !== undefined &&
    snapshots.some(
      (snapshot) =>
        (snapshot?.domContentLoadedMs ?? 0) >
        flow.policies.performance.maxDomContentLoadedMs!,
    );
  const lcpFailed =
    flow.policies.performance.maxLargestContentfulPaintMs !== undefined &&
    snapshots.some(
      (snapshot) =>
        (snapshot?.largestContentfulPaintMs ?? 0) >
        flow.policies.performance.maxLargestContentfulPaintMs!,
    );
  return policyResult(
    "performance",
    !(pageLoadFailed || domFailed || lcpFailed),
    "Performance policy failed.",
  );
}

function accessibilityPolicy(flow: QAFlow, steps: StepResult[]): PolicyResult {
  const criticalIssues = steps.flatMap((step) =>
    step.evidence.accessibility.filter(
      (issue) => issue.severity === "critical",
    ),
  );
  return policyResult(
    "accessibility",
    criticalIssues.length <= flow.policies.accessibility.maxCritical,
    `Accessibility policy failed with ${criticalIssues.length} critical issue(s).`,
  );
}

function policyResult(
  kind: PolicyResult["kind"],
  passed: boolean,
  message: string,
): PolicyResult {
  return { kind, passed, message: passed ? "Passed." : message };
}
