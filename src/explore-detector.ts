import type { StepEvidence } from "./types.js";
import type {
  ExploratoryFinding,
  FindingCategory,
  FindingSeverity,
  InteractiveElement,
  LinkInfo,
  ReproStep,
} from "./explore-types.js";
import { nowIso } from "./utils.js";

/** Lookup table for default severity by finding category. */
const SEVERITY_BY_CATEGORY: Record<FindingCategory, FindingSeverity> = {
  page_error: "critical",
  a11y_violation: "critical",
  console_error: "major",
  network_failure: "major",
  performance_issue: "major",
  dead_end: "minor",
  navigation_issue: "minor",
};

/**
 * Classify the severity for a given finding category.
 * For network_failure, the optional `detail` is the HTTP status code as a string.
 */
export function classifyFindingSeverity(
  category: FindingCategory,
  detail?: string,
): FindingSeverity {
  if (category === "network_failure" && detail) {
    const status = parseInt(detail, 10);
    if (!isNaN(status) && status >= 500) return "critical";
  }
  return SEVERITY_BY_CATEGORY[category] ?? "info";
}

function buildEvidence(
  url: string,
  evidence: StepEvidence,
): ExploratoryFinding["evidence"] {
  return {
    url,
    screenshotPath: evidence.artifacts.screenshotPath,
    snapshotPath: evidence.artifacts.snapshotPath,
    consoleErrors: evidence.consoleEvents
      .filter((e) => e.level === "error" || e.level === "assert")
      .map((e) => e.message),
    networkFailures: evidence.networkEvents
      .filter((e) => !e.ok || (e.status !== undefined && e.status >= 400))
      .map((e) => e.url),
    a11yViolations: evidence.accessibility
      .filter((a) => a.severity === "critical")
      .map((a) => a.message),
    pageErrors: evidence.pageErrors.map((e) => e.message),
  };
}

/** Options for {@link detectFindings}. */
export interface DetectFindingsOptions {
  evidence: StepEvidence;
  url: string;
  links: LinkInfo[];
  interactiveElements: InteractiveElement[];
  reproSteps: ReproStep[];
  idPrefix: string;
}

/** Shared context passed to each detection helper. */
interface DetectionContext {
  evidence: StepEvidence;
  url: string;
  reproSteps: ReproStep[];
  idPrefix: string;
  evidencePayload: ExploratoryFinding["evidence"];
  timestamp: string;
}

function detectConsoleErrors(ctx: DetectionContext): ExploratoryFinding[] {
  const consoleErrors = ctx.evidence.consoleEvents.filter(
    (e) => e.level === "error" || e.level === "assert",
  );
  return consoleErrors.map((event, i) => ({
    id: `${ctx.idPrefix}-console_error-${i}`,
    title: `Console error: ${event.message.slice(0, 120)}`,
    category: "console_error" as const,
    severity: classifyFindingSeverity("console_error"),
    url: ctx.url,
    reproSteps: ctx.reproSteps,
    evidence: ctx.evidencePayload,
    confidence: 0.9,
    createdAt: ctx.timestamp,
  }));
}

function detectNetworkFailures(ctx: DetectionContext): ExploratoryFinding[] {
  const networkFailures = ctx.evidence.networkEvents.filter(
    (e) => !e.ok || (e.status !== undefined && e.status >= 400),
  );
  return networkFailures.map((event, i) => {
    const statusStr =
      event.status !== undefined ? String(event.status) : undefined;
    return {
      id: `${ctx.idPrefix}-network_failure-${i}`,
      title: `Network failure: ${event.method} ${event.url.slice(0, 120)} (${event.status ?? "no response"})`,
      category: "network_failure" as const,
      severity: classifyFindingSeverity("network_failure", statusStr),
      url: ctx.url,
      reproSteps: ctx.reproSteps,
      evidence: ctx.evidencePayload,
      confidence: 0.95,
      createdAt: ctx.timestamp,
    };
  });
}

function detectA11yViolations(ctx: DetectionContext): ExploratoryFinding[] {
  const a11yViolations = ctx.evidence.accessibility.filter(
    (a) => a.severity === "critical",
  );
  return a11yViolations.map((issue, i) => ({
    id: `${ctx.idPrefix}-a11y_violation-${i}`,
    title: `Accessibility violation: ${issue.message.slice(0, 120)}`,
    category: "a11y_violation" as const,
    severity: classifyFindingSeverity("a11y_violation"),
    url: ctx.url,
    reproSteps: ctx.reproSteps,
    evidence: ctx.evidencePayload,
    confidence: 0.85,
    createdAt: ctx.timestamp,
  }));
}

function detectPageErrors(ctx: DetectionContext): ExploratoryFinding[] {
  return ctx.evidence.pageErrors.map((error, i) => ({
    id: `${ctx.idPrefix}-page_error-${i}`,
    title: `Page error: ${error.message.slice(0, 120)}`,
    category: "page_error" as const,
    severity: classifyFindingSeverity("page_error"),
    url: ctx.url,
    reproSteps: ctx.reproSteps,
    evidence: ctx.evidencePayload,
    confidence: 1.0,
    createdAt: ctx.timestamp,
  }));
}

function detectDeadEnds(
  ctx: DetectionContext,
  links: LinkInfo[],
  interactiveElements: InteractiveElement[],
): ExploratoryFinding[] {
  if (links.length > 0 || interactiveElements.length > 0) return [];
  return [
    {
      id: `${ctx.idPrefix}-dead_end-0`,
      title: "Dead end: no links or interactive elements found on page",
      category: "dead_end" as const,
      severity: classifyFindingSeverity("dead_end"),
      url: ctx.url,
      reproSteps: ctx.reproSteps,
      evidence: ctx.evidencePayload,
      confidence: 0.7,
      createdAt: ctx.timestamp,
    },
  ];
}

function detectPerformanceIssues(ctx: DetectionContext): ExploratoryFinding[] {
  if (!ctx.evidence.performance) return [];

  const perf = ctx.evidence.performance;
  const findings: ExploratoryFinding[] = [];
  let perfIndex = 0;

  if (
    perf.largestContentfulPaintMs !== undefined &&
    perf.largestContentfulPaintMs > 4000
  ) {
    findings.push({
      id: `${ctx.idPrefix}-performance_issue-${perfIndex}`,
      title: `Slow LCP: ${Math.round(perf.largestContentfulPaintMs)}ms (threshold 4000ms)`,
      category: "performance_issue",
      severity: classifyFindingSeverity("performance_issue"),
      url: ctx.url,
      reproSteps: ctx.reproSteps,
      evidence: ctx.evidencePayload,
      confidence: 0.8,
      createdAt: ctx.timestamp,
    });
    perfIndex++;
  }

  if (perf.loadMs !== undefined && perf.loadMs > 10000) {
    findings.push({
      id: `${ctx.idPrefix}-performance_issue-${perfIndex}`,
      title: `Slow page load: ${Math.round(perf.loadMs)}ms (threshold 10000ms)`,
      category: "performance_issue",
      severity: classifyFindingSeverity("performance_issue"),
      url: ctx.url,
      reproSteps: ctx.reproSteps,
      evidence: ctx.evidencePayload,
      confidence: 0.8,
      createdAt: ctx.timestamp,
    });
  }

  return findings;
}

/**
 * Detect exploratory findings from step evidence.
 */
export function detectFindings(
  options: DetectFindingsOptions,
): ExploratoryFinding[] {
  const { evidence, url, links, interactiveElements, reproSteps, idPrefix } =
    options;
  const timestamp = nowIso();
  const evidencePayload = buildEvidence(url, evidence);
  const ctx: DetectionContext = {
    evidence,
    url,
    reproSteps,
    idPrefix,
    evidencePayload,
    timestamp,
  };

  return [
    ...detectConsoleErrors(ctx),
    ...detectNetworkFailures(ctx),
    ...detectA11yViolations(ctx),
    ...detectPageErrors(ctx),
    ...detectDeadEnds(ctx, links, interactiveElements),
    ...detectPerformanceIssues(ctx),
  ];
}
