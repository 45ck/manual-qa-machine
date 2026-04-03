export type SessionMode = "fresh" | "reuse";

export type Verdict = "pass" | "pass_with_warnings" | "fail" | "inconclusive";

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export interface TargetByRole {
  kind: "role";
  role: string;
  name: string;
  exact?: boolean;
}

export interface TargetByText {
  kind: "text";
  text: string;
  exact?: boolean;
}

export interface TargetByLabel {
  kind: "label";
  text: string;
  exact?: boolean;
}

export interface TargetByPlaceholder {
  kind: "placeholder";
  text: string;
  exact?: boolean;
}

export interface TargetByCss {
  kind: "css";
  selector: string;
}

export interface TargetByRef {
  kind: "ref";
  ref: string;
}

export type QATarget =
  | TargetByRole
  | TargetByText
  | TargetByLabel
  | TargetByPlaceholder
  | TargetByCss
  | TargetByRef;

export interface WaitForDuration {
  kind: "duration";
  ms: number;
}

export interface WaitForUrl {
  kind: "url";
  pattern: string;
}

export interface WaitForText {
  kind: "text";
  text: string;
}

export interface WaitForElement {
  kind: "element";
  target: QATarget;
  state?: "visible" | "hidden" | "detached";
}

export interface WaitForFunction {
  kind: "function";
  expression: string;
}

export interface WaitForLoad {
  kind: "load";
  state: "load" | "domcontentloaded" | "networkidle";
}

export type QAWaitCondition =
  | WaitForDuration
  | WaitForUrl
  | WaitForText
  | WaitForElement
  | WaitForFunction
  | WaitForLoad;

export interface AssertionTextPresent {
  kind: "textPresent";
  text: string;
}

export interface AssertionUrlContains {
  kind: "urlContains";
  value: string;
}

export interface AssertionElementVisible {
  kind: "elementVisible";
  target: QATarget;
}

export interface AssertionElementEnabled {
  kind: "elementEnabled";
  target: QATarget;
}

export interface AssertionRequestOccurred {
  kind: "requestOccurred";
  urlContains: string;
  method?: string;
}

export interface AssertionNoCriticalA11yViolations {
  kind: "noCriticalA11yViolations";
}

export interface AssertionVisualDiffBelow {
  kind: "visualDiffBelow";
  baselinePath: string;
  threshold: number;
}

export type QAAssertion =
  | AssertionTextPresent
  | AssertionUrlContains
  | AssertionElementVisible
  | AssertionElementEnabled
  | AssertionRequestOccurred
  | AssertionNoCriticalA11yViolations
  | AssertionVisualDiffBelow;

export interface NavigateStep {
  kind: "navigate";
  url: string;
  name?: string;
}

export interface ClickStep {
  kind: "click";
  target: QATarget;
  name?: string;
}

export interface TypeStep {
  kind: "type";
  target: QATarget;
  value: string;
  name?: string;
}

export interface SelectStep {
  kind: "select";
  target: QATarget;
  value: string;
  name?: string;
}

export interface PressStep {
  kind: "press";
  key: string;
  name?: string;
}

export interface ScrollStep {
  kind: "scroll";
  direction: "up" | "down" | "left" | "right";
  pixels?: number;
  name?: string;
}

export interface WaitStep {
  kind: "waitFor";
  condition: QAWaitCondition;
  timeoutMs?: number;
  name?: string;
}

export interface AssertStep {
  kind: "assert";
  assertion: QAAssertion;
  name?: string;
}

export interface SnapshotStep {
  kind: "snapshot";
  name?: string;
}

export interface ScreenshotStep {
  kind: "screenshot";
  name?: string;
}

export interface EvalStep {
  kind: "eval";
  script: string;
  expectContains?: string;
  name?: string;
}

export interface CheckpointStep {
  kind: "checkpoint";
  name: string;
}

export type QAStep =
  | NavigateStep
  | ClickStep
  | TypeStep
  | SelectStep
  | PressStep
  | ScrollStep
  | WaitStep
  | AssertStep
  | SnapshotStep
  | ScreenshotStep
  | EvalStep
  | CheckpointStep;

export interface ConsolePolicy {
  max: number;
  allowMessages?: string[];
}

export interface NetworkPolicy {
  max: number;
  allowUrls?: string[];
}

export interface PageErrorPolicy {
  max: number;
  allowMessages?: string[];
}

export interface PerformancePolicy {
  maxPageLoadMs?: number;
  maxDomContentLoadedMs?: number;
  maxLargestContentfulPaintMs?: number;
}

export interface AccessibilityPolicy {
  maxCritical: number;
}

export interface QAPolicySet {
  consoleErrors: ConsolePolicy;
  networkFailures: NetworkPolicy;
  pageErrors: PageErrorPolicy;
  performance: PerformancePolicy;
  accessibility: AccessibilityPolicy;
}

export interface QAFlow {
  formatVersion: 1;
  id: string;
  name: string;
  startUrl: string;
  sessionMode: SessionMode;
  sessionName?: string;
  viewports: Viewport[];
  steps: QAStep[];
  assertions: QAAssertion[];
  policies: QAPolicySet;
}

export interface ConsoleEvent {
  level: string;
  message: string;
  location?: string;
}

export interface NetworkEvent {
  url: string;
  method: string;
  status?: number;
  ok: boolean;
  resourceType?: string;
  durationMs?: number;
}

export interface PageError {
  message: string;
  stack?: string;
}

export interface AccessibilityIssue {
  id: string;
  severity: "critical" | "warning";
  message: string;
  selector?: string;
}

export interface PerformanceSnapshot {
  navigationMs?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  largestContentfulPaintMs?: number;
  slowRequests: NetworkEvent[];
}

export interface StepArtifacts {
  screenshotPath?: string;
  snapshotPath?: string;
  diffPath?: string;
  snapshotDiffPath?: string;
}

export interface StepEvidence {
  actualUrl: string;
  consoleEvents: ConsoleEvent[];
  networkEvents: NetworkEvent[];
  pageErrors: PageError[];
  accessibility: AccessibilityIssue[];
  performance?: PerformanceSnapshot;
  artifacts: StepArtifacts;
  raw: Record<string, unknown>;
}

export interface AssertionResult {
  kind: QAAssertion["kind"];
  passed: boolean;
  message: string;
}

export interface PolicyResult {
  kind:
    | "consoleErrors"
    | "networkFailures"
    | "pageErrors"
    | "performance"
    | "accessibility";
  passed: boolean;
  message: string;
}

export interface StepResult {
  index: number;
  name: string;
  kind: QAStep["kind"];
  verdict: Verdict;
  durationMs: number;
  evidence: StepEvidence;
  assertions: AssertionResult[];
  notes: string[];
}

export interface ViewportRun {
  viewport: Viewport;
  verdict: Verdict;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: StepResult[];
  assertionResults: AssertionResult[];
  policyResults: PolicyResult[];
}

export interface QAReport {
  flowId: string;
  flowName: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  verdict: Verdict;
  session: {
    mode: SessionMode;
    name: string;
  };
  warnings: string[];
  runs: ViewportRun[];
  artifactDir: string;
}

export interface CertificationAttempt {
  attempt: number;
  verdict: Verdict;
  outputDir: string;
  reportPath: string;
}

export interface CertificationReport {
  flowId: string;
  flowName: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  verdict: Verdict;
  attempts: CertificationAttempt[];
}

export const DEFAULT_VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1440, height: 900 },
];

export const DEFAULT_POLICIES: QAPolicySet = {
  consoleErrors: { max: 0, allowMessages: [] },
  networkFailures: { max: 0, allowUrls: [] },
  pageErrors: { max: 0, allowMessages: [] },
  performance: {},
  accessibility: { maxCritical: 0 },
};
