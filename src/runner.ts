import { mkdir } from "fs/promises";
import { join, resolve } from "path";
import type {
  BrowserAdapter,
  BrowserAdapterOptions,
} from "./adapters/browser-adapter.js";
import { AgentBrowserAdapter } from "./adapters/agent-browser.js";
import {
  classifyRunVerdict,
  classifyStepVerdict,
  combineRunVerdicts,
  evaluatePolicies,
} from "./policies.js";
import type {
  QAFlow,
  QAReport,
  QAStep,
  StepEvidence,
  StepResult,
  Viewport,
  ViewportRun,
} from "./types.js";
import { DEFAULT_VIEWPORTS } from "./types.js";
import { durationMs, nowIso, slugify } from "./utils.js";

type AdapterFactory = (options: BrowserAdapterOptions) => BrowserAdapter;

export interface RunnerOptions {
  outputDir: string;
  cdpPort?: number;
  headed?: boolean;
  adapterFactory?: AdapterFactory;
}

export class QARunner {
  private readonly adapterFactory: AdapterFactory;

  constructor(private readonly options: RunnerOptions) {
    this.adapterFactory =
      options.adapterFactory ??
      ((adapterOptions) => new AgentBrowserAdapter(adapterOptions));
  }

  async runFlow(flow: QAFlow, warnings: string[] = []): Promise<QAReport> {
    const startedAtIso = nowIso();
    const startedAt = Date.now();
    const outputDir = resolve(this.options.outputDir);
    await mkdir(outputDir, { recursive: true });
    const runs = [];
    const viewports =
      flow.viewports.length > 0 ? flow.viewports : DEFAULT_VIEWPORTS;
    for (const [index, viewport] of viewports.entries()) {
      runs.push(await this.runViewport(flow, viewport, outputDir, index));
    }
    return {
      flowId: flow.id,
      flowName: flow.name,
      startedAt: startedAtIso,
      finishedAt: nowIso(),
      durationMs: durationMs(startedAt),
      verdict: combineRunVerdicts(runs),
      session: {
        mode: flow.sessionMode,
        name:
          flow.sessionMode === "reuse"
            ? buildSessionPersistenceName(flow)
            : "fresh-per-viewport",
      },
      warnings,
      runs,
      artifactDir: outputDir,
    };
  }

  private async runViewport(
    flow: QAFlow,
    viewport: Viewport,
    outputDir: string,
    viewportIndex: number,
  ): Promise<ViewportRun> {
    const startedAtIso = nowIso();
    const startedAt = Date.now();
    const artifactsDir = join(outputDir, "artifacts", slugify(viewport.name));
    await mkdir(artifactsDir, { recursive: true });
    const adapter = this.adapterFactory({
      cdpPort: this.options.cdpPort,
      headed: this.options.headed,
      ...buildSessionOptions(flow, viewport, viewportIndex),
    });
    const steps = [];
    try {
      await adapter.verify();
      await adapter.prepareSession({ startUrl: flow.startUrl, viewport });
      steps.push(
        await this.captureStepWithFallback(adapter, artifactsDir, {
          index: 0,
          step: initialStep(flow.startUrl),
        }),
      );
      for (const [index, step] of flow.steps.entries()) {
        steps.push(
          await this.executeStep(adapter, artifactsDir, index + 1, step),
        );
      }
      const finalEvidence = steps.at(-1)?.evidence ?? emptyEvidence();
      const assertionResults = [];
      for (const assertion of flow.assertions) {
        assertionResults.push(
          await adapter.evaluateAssertion(
            assertion,
            finalEvidence,
            artifactsDir,
            `viewport-${viewportIndex}-final`,
          ),
        );
      }
      const policyResults = evaluatePolicies(flow, steps);
      return {
        viewport,
        verdict: classifyRunVerdict(steps, assertionResults, policyResults),
        startedAt: startedAtIso,
        finishedAt: nowIso(),
        durationMs: durationMs(startedAt),
        steps,
        assertionResults,
        policyResults,
      };
    } finally {
      await adapter.finalize().catch(() => undefined);
    }
  }

  private async executeStep(
    adapter: BrowserAdapter,
    artifactsDir: string,
    index: number,
    step: QAStep,
  ): Promise<StepResult> {
    const startedAt = Date.now();
    const notes: string[] = [];
    let actionFailed = false;
    try {
      await adapter.runStep(step);
    } catch (error) {
      actionFailed = true;
      notes.push((error as Error).message);
    }
    const captured = await this.captureStepWithFallback(adapter, artifactsDir, {
      index,
      step,
      notes,
    });
    const assertions = [...captured.assertions];
    if (step.kind === "assert" && captured.verdict !== "inconclusive") {
      assertions.push(
        await adapter.evaluateAssertion(
          step.assertion,
          captured.evidence,
          artifactsDir,
          buildStepKey(index, step),
        ),
      );
    }
    return {
      ...captured,
      durationMs: durationMs(startedAt),
      notes,
      assertions,
      verdict: classifyStepVerdict({ ...captured, assertions }, actionFailed),
    };
  }

  private async captureStepWithFallback(
    adapter: BrowserAdapter,
    artifactsDir: string,
    context: {
      index: number;
      notes?: string[];
      step: QAStep;
    },
  ): Promise<StepResult> {
    const { index, step } = context;
    const notes = context.notes ?? [];
    try {
      const captured = await this.captureStep(
        adapter,
        artifactsDir,
        index,
        step,
      );
      return { ...captured, verdict: classifyStepVerdict(captured, false) };
    } catch (error) {
      notes.push(`Evidence capture failed: ${(error as Error).message}`);
      return {
        index,
        name: stepName(step),
        kind: step.kind,
        verdict: "inconclusive",
        durationMs: 0,
        evidence: emptyEvidence(),
        assertions: [],
        notes: [...notes],
      };
    }
  }

  private async captureStep(
    adapter: BrowserAdapter,
    artifactsDir: string,
    index: number,
    step: QAStep,
  ): Promise<StepResult> {
    const stepKey = buildStepKey(index, step);
    const evidence = await adapter.captureEvidence({
      screenshotPath: join(artifactsDir, `${stepKey}.png`),
      snapshotPath: join(artifactsDir, `${stepKey}.snapshot.json`),
    });
    return {
      index,
      name: stepName(step),
      kind: step.kind,
      verdict: "pass",
      durationMs: 0,
      evidence,
      assertions: [],
      notes: [],
    };
  }
}

function buildSessionName(flow: QAFlow): string {
  return flow.sessionName ?? `${slugify(flow.id)}-reuse`;
}

function buildSessionOptions(
  flow: QAFlow,
  viewport: Viewport,
  viewportIndex: number,
): BrowserAdapterOptions {
  return {
    sessionId: `${slugify(flow.id)}-${slugify(viewport.name)}-${viewportIndex}-${Date.now()}`,
    sessionName:
      flow.sessionMode === "reuse"
        ? buildSessionPersistenceName(flow)
        : undefined,
  };
}

function buildSessionPersistenceName(flow: QAFlow): string {
  return buildSessionName(flow);
}

function buildStepKey(index: number, step: QAStep): string {
  return `${String(index).padStart(2, "0")}-${slugify(stepName(step))}`;
}

function stepName(step: QAStep): string {
  return step.name ?? defaultStepName(step);
}

function defaultStepName(step: QAStep): string {
  const names: Record<QAStep["kind"], string> = {
    navigate: `navigate ${step.kind === "navigate" ? step.url : ""}`.trim(),
    click: "click target",
    type: "type value",
    select: "select option",
    press: `press ${step.kind === "press" ? step.key : ""}`.trim(),
    scroll: `scroll ${step.kind === "scroll" ? step.direction : ""}`.trim(),
    waitFor: "wait for condition",
    assert:
      `assert ${step.kind === "assert" ? step.assertion.kind : ""}`.trim(),
    eval: "evaluate script",
    snapshot: "capture snapshot",
    screenshot: "capture screenshot",
    checkpoint: step.kind === "checkpoint" ? step.name : "checkpoint",
  };
  return names[step.kind];
}

function initialStep(url: string): QAStep {
  return { kind: "checkpoint", name: `initial load ${url}` };
}

function emptyEvidence(): StepEvidence {
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
