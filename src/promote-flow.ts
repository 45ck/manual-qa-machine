import type { ExploratoryFinding, ReproStep } from "./explore-types.js";
import type { QAFlow, QAStep, QAAssertion, QAPolicySet } from "./types.js";
import { DEFAULT_POLICIES, DEFAULT_VIEWPORTS } from "./types.js";

export function findingToFlow(finding: ExploratoryFinding): QAFlow {
  const startUrl = resolveStartUrl(finding);
  const steps = finding.reproSteps
    .map(reproStepToQAStep)
    .filter((s): s is QAStep => s !== null);
  const assertions = buildAssertions(finding);
  const policies = buildPolicies(finding);

  return {
    formatVersion: 1,
    id: finding.id,
    name: finding.title,
    startUrl,
    sessionMode: "fresh",
    viewports: DEFAULT_VIEWPORTS,
    steps,
    assertions,
    policies,
  };
}

function resolveStartUrl(finding: ExploratoryFinding): string {
  const navigateStep = finding.reproSteps.find(
    (s) => s.actionKind === "navigate" && s.target,
  );
  return navigateStep?.target ?? finding.url;
}

const qaStepConverters: Record<
  ReproStep["actionKind"],
  (step: ReproStep) => QAStep | null
> = {
  navigate: (step) => ({
    kind: "navigate",
    url: step.target ?? "",
    name: step.instruction,
  }),
  click: (step) => ({
    kind: "click",
    target: { kind: "text", text: step.target ?? "" },
    name: step.instruction,
  }),
  type: (step) => ({
    kind: "type",
    target: { kind: "text", text: step.target ?? "" },
    value: step.value ?? "",
    name: step.instruction,
  }),
  scroll: (step) => ({
    kind: "scroll",
    direction: "down",
    name: step.instruction,
  }),
  press: (step) => ({
    kind: "press",
    key: step.value ?? "Enter",
    name: step.instruction,
  }),
  // These actions don't map cleanly to QAFlow steps; skip them.
  back: () => null,
  hover: () => null,
};

function reproStepToQAStep(step: ReproStep): QAStep | null {
  return qaStepConverters[step.actionKind](step);
}

function buildAssertions(finding: ExploratoryFinding): QAAssertion[] {
  const assertions: QAAssertion[] = [];

  if (finding.category === "a11y_violation") {
    assertions.push({ kind: "noCriticalA11yViolations" });
  }

  // console_error, network_failure, page_error — handled via policies, not assertions.

  return assertions;
}

function buildPolicies(finding: ExploratoryFinding): QAPolicySet {
  switch (finding.category) {
    case "console_error":
      return {
        ...DEFAULT_POLICIES,
        consoleErrors: { max: 0 },
      };

    case "network_failure":
      return {
        ...DEFAULT_POLICIES,
        networkFailures: { max: 0 },
      };

    case "page_error":
      return {
        ...DEFAULT_POLICIES,
        pageErrors: { max: 0 },
      };

    case "a11y_violation":
      return {
        ...DEFAULT_POLICIES,
        accessibility: { maxCritical: 0 },
      };

    default:
      return { ...DEFAULT_POLICIES };
  }
}
