import { execFile } from "child_process";
import { mkdir } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import type {
  BrowserAdapter,
  BrowserAdapterOptions,
} from "./adapters/browser-adapter.js";
import { AgentBrowserAdapter } from "./adapters/agent-browser.js";
import {
  AGENT_BROWSER_EXECUTABLE,
  encodeScript,
  formatExecFailure,
} from "./adapters/agent-browser-cli.js";
import {
  buildLinkExtractionScript,
  buildInteractiveElementsScript,
} from "./adapters/dom-scripts.js";
import { heuristicDecision } from "./explore-decision.js";
import { detectFindings } from "./explore-detector.js";
import type { DetectFindingsOptions } from "./explore-detector.js";
import {
  buildExploreState,
  buildReport,
  buildReproSteps,
  captureEvidenceSafe,
  formatAction,
  isInScope,
  normalizeEvalOutput,
  normalizeUrl,
  shouldTerminate,
  updateVisitTracking,
} from "./explore-helpers.js";
import type { ExploreContext } from "./explore-helpers.js";
import type {
  ExploratoryConfig,
  ExploratoryReport,
  InteractiveElement,
  LinkInfo,
  NextAction,
  DecisionFunction,
} from "./explore-types.js";
import { DEFAULT_VIEWPORTS } from "./types.js";
import { parseJson, slugify } from "./utils.js";

export { heuristicDecision } from "./explore-decision.js";
export { isInScope, normalizeUrl, buildReproSteps } from "./explore-helpers.js";

const exec = promisify(execFile);

export interface ExplorerOptions {
  outputDir: string;
  cdpPort?: number;
  headed?: boolean;
  adapterFactory?: (options: BrowserAdapterOptions) => BrowserAdapter;
  decisionFunction?: DecisionFunction;
}

export class Explorer {
  private readonly adapterFactory: (
    options: BrowserAdapterOptions,
  ) => BrowserAdapter;
  private readonly decisionFunction: DecisionFunction;

  constructor(private readonly options: ExplorerOptions) {
    this.adapterFactory =
      options.adapterFactory ??
      ((adapterOptions) => new AgentBrowserAdapter(adapterOptions));
    this.decisionFunction = options.decisionFunction ?? heuristicDecision;
  }

  async explore(config: ExploratoryConfig): Promise<ExploratoryReport> {
    const startedAtIso = new Date().toISOString();
    const startedAt = Date.now();
    const { artifactsDir } = await this.prepareOutputDirs(startedAt);

    const viewport = config.viewport ?? DEFAULT_VIEWPORTS[0];
    const sessionId = `explore-${slugify(config.startUrl)}-${Date.now()}`;
    const adapter = this.adapterFactory({
      cdpPort: this.options.cdpPort,
      headed: this.options.headed,
      sessionId,
    });

    const ctx: ExploreContext = {
      config,
      adapter,
      sessionId,
      artifactsDir,
      startedAt,
      interactions: [],
      allFindings: [],
      pagesVisited: new Set<string>(),
      triedElements: new Set<string>(),
      consecutiveNoNewPages: 0,
    };

    try {
      await adapter.verify();
      await adapter.prepareSession({ startUrl: config.startUrl, viewport });
      ctx.pagesVisited.add(normalizeUrl(config.startUrl));
      await this.runExplorationLoop(ctx);
    } finally {
      await adapter.finalize().catch(() => undefined);
    }

    return buildReport(ctx, config, startedAtIso, startedAt);
  }

  // -----------------------------------------------------------------------
  // Exploration loop
  // -----------------------------------------------------------------------

  private async prepareOutputDirs(
    startedAt: number,
  ): Promise<{ outputDir: string; artifactsDir: string }> {
    const outputDir = join(this.options.outputDir, `explore-${startedAt}`);
    await mkdir(outputDir, { recursive: true });
    const artifactsDir = join(outputDir, "artifacts");
    await mkdir(artifactsDir, { recursive: true });
    return { outputDir, artifactsDir };
  }

  private async runExplorationLoop(ctx: ExploreContext): Promise<void> {
    let interactionCount = 0;

    while (!shouldTerminate(ctx, interactionCount)) {
      const stepKey = String(interactionCount).padStart(3, "0");
      const screenshotPath = join(ctx.artifactsDir, `${stepKey}.png`);
      const snapshotPath = join(ctx.artifactsDir, `${stepKey}.snapshot.json`);

      const evidence = await captureEvidenceSafe(ctx.adapter, {
        screenshotPath,
        snapshotPath,
      });

      const currentUrl = evidence.actualUrl || ctx.config.startUrl;
      updateVisitTracking(ctx, currentUrl);

      const { scopedLinks, interactiveElements } =
        await this.gatherPageInfo(ctx);

      this.recordFindings(ctx, {
        evidence,
        url: currentUrl,
        links: scopedLinks,
        interactiveElements,
        reproSteps: buildReproSteps(ctx.interactions),
        idPrefix: `explore-${stepKey}`,
      });

      const nextAction = this.decisionFunction(
        buildExploreState({
          ctx,
          currentUrl,
          scopedLinks,
          interactiveElements,
          interactionCount,
        }),
        ctx.interactions,
      );

      if (nextAction.kind === "done") {
        ctx.interactions.push({
          index: interactionCount,
          action: `done: ${nextAction.reason}`,
          url: currentUrl,
          screenshotPath,
          snapshotPath,
          evidence,
          findings: [],
        });
        break;
      }

      try {
        await this.executeAction(ctx.adapter, nextAction, ctx.triedElements);
      } catch {
        /* action failed; record and continue */
      }

      ctx.interactions.push({
        index: interactionCount,
        action: formatAction(nextAction),
        url: currentUrl,
        screenshotPath,
        snapshotPath,
        evidence,
        findings: [],
      });
      interactionCount++;
    }
  }

  private async gatherPageInfo(ctx: ExploreContext): Promise<{
    scopedLinks: LinkInfo[];
    interactiveElements: InteractiveElement[];
  }> {
    const links = await this.extractLinks(ctx.sessionId);
    const interactiveElements = await this.extractInteractiveElements(
      ctx.sessionId,
    );
    const scopedLinks = links.filter((link) =>
      isInScope(
        link.href,
        ctx.config.scopePatterns,
        ctx.config.excludePatterns,
      ),
    );
    return { scopedLinks, interactiveElements };
  }

  private recordFindings(
    ctx: ExploreContext,
    options: DetectFindingsOptions,
  ): void {
    const findings = detectFindings(options);
    for (const finding of findings) {
      if (!ctx.allFindings.some((f) => f.id === finding.id)) {
        ctx.allFindings.push(finding);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Browser interaction helpers
  // -----------------------------------------------------------------------

  private async extractLinks(sessionId: string): Promise<LinkInfo[]> {
    try {
      const script = buildLinkExtractionScript();
      const raw = await this.evaluateScript(sessionId, script);
      return parseJson<LinkInfo[]>(normalizeEvalOutput(raw)) ?? [];
    } catch {
      return [];
    }
  }

  private async extractInteractiveElements(
    sessionId: string,
  ): Promise<InteractiveElement[]> {
    try {
      const script = buildInteractiveElementsScript();
      const raw = await this.evaluateScript(sessionId, script);
      return parseJson<InteractiveElement[]>(normalizeEvalOutput(raw)) ?? [];
    } catch {
      return [];
    }
  }

  private async evaluateScript(
    sessionId: string,
    script: string,
  ): Promise<string> {
    const args = [
      ...(this.options.headed ? ["--headed"] : []),
      ...(this.options.cdpPort ? ["--cdp", String(this.options.cdpPort)] : []),
      "--session",
      sessionId,
      "eval",
      "--base64",
      encodeScript(script),
    ];
    try {
      const { stdout } = await exec(AGENT_BROWSER_EXECUTABLE, args, {
        timeout: 60_000,
        windowsHide: true,
      });
      return stdout.trim();
    } catch (error) {
      throw new Error(formatExecFailure(["eval", "--base64", "..."], error), {
        cause: error,
      });
    }
  }

  private async executeAction(
    adapter: BrowserAdapter,
    action: NextAction,
    triedElements: Set<string>,
  ): Promise<void> {
    switch (action.kind) {
      case "navigate":
        await adapter.runStep({
          kind: "navigate",
          url: action.target!,
          name: action.reason,
        });
        break;
      case "click":
        if (action.target) {
          triedElements.add(action.target);
          await adapter.runStep({
            kind: "click",
            target: { kind: "css", selector: action.target },
            name: action.reason,
          });
        }
        break;
      case "type":
        if (action.target) {
          triedElements.add(action.target);
          await adapter.runStep({
            kind: "type",
            target: { kind: "css", selector: action.target },
            value: action.value ?? "",
            name: action.reason,
          });
        }
        break;
      case "scroll":
        await adapter.runStep({
          kind: "scroll",
          direction: "down",
          pixels: 400,
          name: action.reason,
        });
        break;
      case "back":
        await adapter.runStep({
          kind: "press",
          key: "Alt+ArrowLeft",
          name: action.reason,
        });
        break;
    }
  }
}
