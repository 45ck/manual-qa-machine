import type { ExploratoryFinding, FindingCategory } from "./explore-types.js";
import type { PromotionDecision } from "./promote-types.js";

export function decidePromotion(
  finding: ExploratoryFinding,
): PromotionDecision {
  const hasReproSteps = finding.reproSteps.length >= 2;

  if (!hasReproSteps) {
    return {
      gate: "human",
      reason: "Insufficient reproduction steps",
      suggestedTarget: "playwright",
      confidence: 0.3,
    };
  }

  const rules: Record<FindingCategory, () => PromotionDecision> = {
    console_error: () => decideConsoleError(finding),
    network_failure: () => decideNetworkFailure(finding),
    a11y_violation: () => decideA11yViolation(),
    page_error: () => decidePageError(),
    dead_end: () => decideDeadEnd(),
    navigation_issue: () => decideNavigationIssue(),
    performance_issue: () => decidePerformanceIssue(),
  };

  return rules[finding.category]();
}

function decideConsoleError(finding: ExploratoryFinding): PromotionDecision {
  if (finding.evidence.consoleErrors.length > 0) {
    return {
      gate: "auto",
      reason:
        "Console error with specific message and reproducible steps — high confidence for automated gate",
      suggestedTarget: "playwright",
      confidence: 0.9,
    };
  }
  return {
    gate: "human",
    reason:
      "Console error without a specific message — needs human review to determine significance",
    suggestedTarget: "playwright",
    confidence: 0.5,
  };
}

function decideNetworkFailure(finding: ExploratoryFinding): PromotionDecision {
  if (finding.evidence.networkFailures.length > 0) {
    return {
      gate: "auto",
      reason:
        "Network failure with specific URL and reproducible steps — high confidence for automated gate",
      suggestedTarget: "playwright",
      confidence: 0.9,
    };
  }
  return {
    gate: "human",
    reason:
      "Network failure without a specific URL — needs human review to confirm",
    suggestedTarget: "playwright",
    confidence: 0.5,
  };
}

function decideA11yViolation(): PromotionDecision {
  return {
    gate: "auto",
    reason:
      "Accessibility violation detected — deterministic check suitable for automated gate",
    suggestedTarget: "playwright",
    confidence: 0.85,
  };
}

function decidePageError(): PromotionDecision {
  return {
    gate: "auto",
    reason:
      "Page error (uncaught exception) with reproducible steps — suitable for automated regression gate",
    suggestedTarget: "playwright",
    confidence: 0.8,
  };
}

function decideDeadEnd(): PromotionDecision {
  return {
    gate: "human",
    reason:
      "Dead-end detected — user flow may be subjective and requires human judgment",
    suggestedTarget: "flow",
    confidence: 0.5,
  };
}

function decideNavigationIssue(): PromotionDecision {
  return {
    gate: "human",
    reason:
      "Navigation issue detected — flow correctness should be verified by a human before promotion",
    suggestedTarget: "flow",
    confidence: 0.6,
  };
}

function decidePerformanceIssue(): PromotionDecision {
  return {
    gate: "human",
    reason:
      "Performance issue detected — thresholds and environment variability require human review",
    suggestedTarget: "playwright",
    confidence: 0.6,
  };
}
