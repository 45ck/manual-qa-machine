import type { SessionMode, StepEvidence, Verdict, Viewport } from "./types.js";

export interface ExploratoryConfig {
  startUrl: string;
  objectives: { description: string }[];
  maxDepth: number;
  timeoutMs: number;
  maxInteractions: number;
  viewport: Viewport;
  sessionMode: SessionMode;
  scopePatterns: string[];
  excludePatterns: string[];
  auditAccessibility: boolean;
  auditPerformance: boolean;
}

export type FindingCategory =
  | "console_error"
  | "network_failure"
  | "a11y_violation"
  | "page_error"
  | "dead_end"
  | "performance_issue"
  | "navigation_issue";

export type FindingSeverity = "critical" | "major" | "minor" | "info";

export interface ReproStep {
  index: number;
  instruction: string;
  actionKind:
    | "navigate"
    | "click"
    | "type"
    | "scroll"
    | "press"
    | "back"
    | "hover";
  target?: string;
  value?: string;
  screenshotPath?: string;
}

export interface ExploratoryFinding {
  id: string;
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  url: string;
  reproSteps: ReproStep[];
  evidence: {
    url: string;
    screenshotPath?: string;
    snapshotPath?: string;
    consoleErrors: string[];
    networkFailures: string[];
    a11yViolations: string[];
    pageErrors: string[];
  };
  confidence: number;
  createdAt: string;
}

export interface ExploreInteraction {
  index: number;
  action: string;
  url: string;
  screenshotPath?: string;
  snapshotPath?: string;
  evidence: StepEvidence;
  findings: ExploratoryFinding[];
}

export interface CoverageMap {
  pagesVisited: Map<string, { visitCount: number; title: string }>;
  unvisitedLinks: Set<string>;
  interactiveElementsTried: number;
  totalInteractiveElements: number;
}

export interface ExploratoryReport {
  id: string;
  startUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  config: ExploratoryConfig;
  interactions: ExploreInteraction[];
  findings: ExploratoryFinding[];
  coverage: {
    pagesVisited: number;
    uniqueUrls: string[];
    unvisitedLinks: string[];
    interactionsConducted: number;
    coveragePlateau: boolean;
  };
  verdict: Verdict;
}

export interface LinkInfo {
  href: string;
  text: string;
  visible: boolean;
}

export interface InteractiveElement {
  index: number;
  tag: string;
  type?: string;
  role?: string;
  text: string;
  name?: string;
  selector: string;
  ref?: string;
  inputType?: string;
}

export type NextActionKind =
  | "navigate"
  | "click"
  | "type"
  | "scroll"
  | "back"
  | "done";

export interface NextAction {
  kind: NextActionKind;
  target?: string;
  value?: string;
  reason: string;
}

export type DecisionFunction = (
  state: ExploreState,
  history: ExploreInteraction[],
) => NextAction;

export interface ExploreState {
  url: string;
  links: LinkInfo[];
  interactiveElements: InteractiveElement[];
  evidence: StepEvidence;
  pagesVisited: Set<string>;
  interactionCount: number;
}
