import type { BrowserAdapter } from "./adapters/browser-adapter.js";
import type {
  ExploratoryConfig,
  ExploratoryFinding,
  ExploratoryReport,
  ExploreInteraction,
  ExploreState,
  InteractiveElement,
  LinkInfo,
  NextAction,
  ReproStep,
} from "./explore-types.js";
import type { StepEvidence } from "./types.js";
import { durationMs, nowIso, slugify } from "./utils.js";

// ---------------------------------------------------------------------------
// Internal context used by the exploration loop
// ---------------------------------------------------------------------------

export interface ExploreContext {
  config: ExploratoryConfig;
  adapter: BrowserAdapter;
  sessionId: string;
  artifactsDir: string;
  startedAt: number;
  interactions: ExploreInteraction[];
  allFindings: ExploratoryFinding[];
  pagesVisited: Set<string>;
  triedElements: Set<string>;
  consecutiveNoNewPages: number;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    let normalized = parsed.href;
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

export function isInScope(
  url: string,
  scopePatterns: string[],
  excludePatterns: string[],
): boolean {
  for (const pattern of excludePatterns) {
    if (urlMatchesPattern(url, pattern)) return false;
  }
  if (scopePatterns.length === 0) return true;
  for (const pattern of scopePatterns) {
    if (urlMatchesPattern(url, pattern)) return true;
  }
  return false;
}

function urlMatchesPattern(url: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}$`, "i").test(url);
  } catch {
    return url.includes(pattern);
  }
}

// ---------------------------------------------------------------------------
// Repro-step helpers
// ---------------------------------------------------------------------------

export function buildReproSteps(
  interactions: ExploreInteraction[],
): ReproStep[] {
  return interactions.map((interaction, index) => ({
    index,
    instruction: interaction.action,
    actionKind: parseActionKind(interaction.action),
    target: extractTarget(interaction.action),
    screenshotPath: interaction.screenshotPath,
  }));
}

function parseActionKind(action: string): ReproStep["actionKind"] {
  if (action.startsWith("navigate")) return "navigate";
  if (action.startsWith("click")) return "click";
  if (action.startsWith("type") || action.startsWith("fill")) return "type";
  if (action.startsWith("scroll")) return "scroll";
  if (action.startsWith("back")) return "back";
  if (action.startsWith("press")) return "press";
  if (action.startsWith("hover")) return "hover";
  return "navigate";
}

function extractTarget(action: string): string | undefined {
  const urlMatch = action.match(/https?:\/\/\S+/);
  if (urlMatch) return urlMatch[0];
  const selectorMatch = action.match(/:\s*(.+)$/);
  if (selectorMatch) return selectorMatch[1].trim();
  return undefined;
}

// ---------------------------------------------------------------------------
// Exploration loop helpers
// ---------------------------------------------------------------------------

export function shouldTerminate(
  ctx: ExploreContext,
  interactionCount: number,
): boolean {
  if (interactionCount >= ctx.config.maxInteractions) return true;
  if (ctx.pagesVisited.size >= ctx.config.maxDepth) return true;
  if (durationMs(ctx.startedAt) >= ctx.config.timeoutMs) return true;
  if (ctx.consecutiveNoNewPages >= 3) return true;
  return false;
}

export async function captureEvidenceSafe(
  adapter: BrowserAdapter,
  paths: { screenshotPath: string; snapshotPath: string },
): Promise<StepEvidence> {
  try {
    return await adapter.captureEvidence(paths);
  } catch {
    return emptyEvidence();
  }
}

export function updateVisitTracking(
  ctx: ExploreContext,
  currentUrl: string,
): void {
  const normalizedCurrent = normalizeUrl(currentUrl);
  const prevSize = ctx.pagesVisited.size;
  ctx.pagesVisited.add(normalizedCurrent);
  if (ctx.pagesVisited.size === prevSize) {
    ctx.consecutiveNoNewPages++;
  } else {
    ctx.consecutiveNoNewPages = 0;
  }
}

export interface BuildExploreStateOptions {
  ctx: ExploreContext;
  currentUrl: string;
  scopedLinks: LinkInfo[];
  interactiveElements: InteractiveElement[];
  interactionCount: number;
}

export function buildExploreState(
  options: BuildExploreStateOptions,
): ExploreState {
  return {
    url: options.currentUrl,
    links: options.scopedLinks,
    interactiveElements: options.interactiveElements,
    evidence: emptyEvidence(),
    pagesVisited: options.ctx.pagesVisited,
    interactionCount: options.interactionCount,
  };
}

// ---------------------------------------------------------------------------
// Report / action formatting
// ---------------------------------------------------------------------------

export function buildReport(
  ctx: ExploreContext,
  config: ExploratoryConfig,
  startedAtIso: string,
  startedAt: number,
): ExploratoryReport {
  const visitedUrls = [...ctx.pagesVisited];
  const verdict = computeVerdict(ctx.allFindings);
  return {
    id: `explore-${slugify(config.startUrl)}-${startedAt}`,
    startUrl: config.startUrl,
    startedAt: startedAtIso,
    finishedAt: nowIso(),
    durationMs: durationMs(startedAt),
    config,
    interactions: ctx.interactions,
    findings: ctx.allFindings,
    coverage: {
      pagesVisited: ctx.pagesVisited.size,
      uniqueUrls: visitedUrls,
      unvisitedLinks: [],
      interactionsConducted: ctx.interactions.length,
      coveragePlateau: ctx.consecutiveNoNewPages >= 3,
    },
    verdict,
  };
}

export function formatAction(action: NextAction): string {
  const parts: string[] = [action.kind];
  if (action.target) parts.push(action.target);
  if (action.value) parts.push(`"${action.value}"`);
  return parts.join(" ");
}

function computeVerdict(
  findings: ExploratoryFinding[],
): "pass" | "pass_with_warnings" | "fail" {
  const hasCriticalOrMajor = findings.some(
    (f) => f.severity === "critical" || f.severity === "major",
  );
  if (hasCriticalOrMajor) return "fail";
  const hasMinorOrInfo = findings.some(
    (f) => f.severity === "minor" || f.severity === "info",
  );
  if (hasMinorOrInfo) return "pass_with_warnings";
  return "pass";
}

// ---------------------------------------------------------------------------
// Evidence / eval helpers
// ---------------------------------------------------------------------------

export function normalizeEvalOutput(raw: string): string {
  return raw.trim().replace(/^"|"$/g, "").replace(/\\"/g, '"');
}

export function emptyEvidence(): StepEvidence {
  return {
    actualUrl: "",
    consoleEvents: [],
    networkEvents: [],
    pageErrors: [],
    accessibility: [],
    artifacts: {},
    raw: {},
  };
}
