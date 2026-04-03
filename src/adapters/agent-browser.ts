import { execFile } from "child_process";
import { writeFile } from "fs/promises";
import { promisify } from "util";
import type {
  AssertionResult,
  QAAssertion,
  QAStep,
  QATarget,
  QAWaitCondition,
  StepEvidence,
} from "../types.js";
import { ensureParent } from "../utils.js";
import type {
  BrowserAdapter,
  BrowserAdapterOptions,
  EvidenceCapturePaths,
  PrepareSessionOptions,
} from "./browser-adapter.js";
import {
  parseCommandPayload,
  parseAccessibility,
  parseBoolean,
  parseConsoleEvents,
  parseNetworkEvents,
  parsePageErrors,
  parsePerformance,
  parseScalar,
} from "./agent-browser-parse.js";
import { evaluateBrowserAssertion } from "./agent-browser-evaluator.js";
import {
  buildAccessibilityAuditScript,
  buildPerformanceScript,
  buildTargetActionScript,
  buildTargetStateScript,
  buildWaitFunctionScript,
} from "./dom-scripts.js";
import {
  buildFindArgs,
  normalizeEvalPayload,
} from "./agent-browser-targets.js";
import {
  AGENT_BROWSER_EXECUTABLE,
  buildSessionNameArgs,
  encodeScript,
  formatExecFailure,
  SLOW_REQUEST_THRESHOLD_MS,
} from "./agent-browser-cli.js";

const exec = promisify(execFile);

export class AgentBrowserAdapter implements BrowserAdapter {
  constructor(private readonly options: BrowserAdapterOptions) {}

  async verify(): Promise<void> {
    await this.run(["--version"]);
  }

  async prepareSession(options: PrepareSessionOptions): Promise<void> {
    await this.run([
      "set",
      "viewport",
      String(options.viewport.width),
      String(options.viewport.height),
    ]);
    await this.run(["open", options.startUrl]);
    await this.run(["wait", "--load", "networkidle"]);
  }

  async runStep(step: QAStep): Promise<void> {
    if (isPassiveStep(step)) return;
    if (step.kind === "waitFor")
      return this.waitFor(step.condition, step.timeoutMs);
    if (step.kind === "eval")
      return this.evaluate(step.script, step.expectContains).then(
        () => undefined,
      );
    await this.runInteractiveStep(step);
  }

  async captureEvidence(paths: EvidenceCapturePaths): Promise<StepEvidence> {
    await this.captureScreenshot(paths.screenshotPath);
    const snapshotRaw = await this.runJson(["snapshot", "-i"]);
    await ensureParent(paths.snapshotPath);
    await writeFile(
      paths.snapshotPath,
      JSON.stringify(parseCommandPayload(snapshotRaw), null, 2),
      "utf8",
    );
    const [urlRaw, consoleRaw, networkRaw, errorRaw, a11yRaw, perfRaw] =
      await Promise.all([
        this.runJson(["get", "url"]),
        this.runJson(["console", "--clear"]),
        this.runJson(["network", "requests", "--clear"]),
        this.runJson(["errors", "--clear"]),
        this.evaluate(buildAccessibilityAuditScript()),
        this.evaluate(buildPerformanceScript()),
      ]);
    const networkEvents = parseNetworkEvents(networkRaw);
    const slowRequests = networkEvents.filter(
      (entry) =>
        !entry.ok ||
        (typeof entry.durationMs === "number" &&
          entry.durationMs >= SLOW_REQUEST_THRESHOLD_MS),
    );
    return {
      actualUrl: parseScalar(urlRaw),
      consoleEvents: parseConsoleEvents(consoleRaw),
      networkEvents,
      pageErrors: parsePageErrors(errorRaw),
      accessibility: parseAccessibility(normalizeEvalPayload(a11yRaw)),
      performance: parsePerformance(
        normalizeEvalPayload(perfRaw),
        slowRequests,
      ),
      artifacts: {
        screenshotPath: paths.screenshotPath,
        snapshotPath: paths.snapshotPath,
      },
      raw: {
        snapshot: snapshotRaw,
        url: urlRaw,
        console: consoleRaw,
        network: networkRaw,
        errors: errorRaw,
        accessibility: a11yRaw,
        performance: perfRaw,
      },
    };
  }

  async evaluateAssertion(
    assertion: QAAssertion,
    evidence: StepEvidence,
    outputDir: string,
    stepKey: string,
  ): Promise<AssertionResult> {
    return evaluateBrowserAssertion(
      {
        evaluateBoolean: this.evaluateBoolean.bind(this),
        targetState: this.targetState.bind(this),
      },
      assertion,
      evidence,
      { outputDir, stepKey },
    );
  }

  async finalize(): Promise<void> {
    await this.run(["close"]).catch(() => undefined);
  }

  private async targetState(
    target: QATarget,
    state: "visible" | "enabled",
  ): Promise<boolean> {
    if (target.kind === "css" || target.kind === "ref") {
      const raw = await this.run([
        "is",
        state,
        target.kind === "css" ? target.selector : target.ref,
      ]);
      return parseBoolean(raw);
    }
    return this.evaluateBoolean(buildTargetStateScript(target, state));
  }

  private async clickTarget(target: QATarget): Promise<void> {
    if (target.kind === "css") {
      await this.runAndWait(["click", target.selector]);
      return;
    }
    if (target.kind === "ref") {
      await this.runAndWait(["click", target.ref]);
      return;
    }
    await this.semanticAction(target, "click");
  }

  private async fillTarget(target: QATarget, value: string): Promise<void> {
    if (target.kind === "css") {
      await this.run(["fill", target.selector, value]);
      return;
    }
    if (target.kind === "ref") {
      await this.run(["fill", target.ref, value]);
      return;
    }
    await this.semanticAction(target, "fill", value);
  }

  private async selectTarget(target: QATarget, value: string): Promise<void> {
    if (target.kind === "css") {
      await this.run(["select", target.selector, value]);
      return;
    }
    if (target.kind === "ref") {
      await this.run(["select", target.ref, value]);
      return;
    }
    await this.evaluate(buildTargetActionScript(target, "select", value));
  }

  private async semanticAction(
    target: Exclude<QATarget, { kind: "css" | "ref" }>,
    action: "click" | "fill",
    value?: string,
  ): Promise<void> {
    const args = buildFindArgs(target, action, value);
    try {
      await this.run(args);
    } catch {
      await this.evaluate(buildTargetActionScript(target, action, value));
    }
    if (action === "click") {
      await this.run(["wait", "--load", "networkidle"]).catch(() => undefined);
    }
  }

  private async runInteractiveStep(
    step: Extract<
      QAStep,
      { kind: "navigate" | "click" | "type" | "select" | "press" | "scroll" }
    >,
  ): Promise<void> {
    switch (step.kind) {
      case "navigate":
        await this.run(["open", step.url]);
        await this.run(["wait", "--load", "networkidle"]);
        return;
      case "click":
        return this.clickTarget(step.target);
      case "type":
        return this.fillTarget(step.target, step.value);
      case "select":
        return this.selectTarget(step.target, step.value);
      case "press":
        return this.run(["press", step.key]).then(() => undefined);
      case "scroll":
        return this.scroll(step.direction, step.pixels);
    }
  }

  private async waitFor(
    condition: QAWaitCondition,
    timeoutMs?: number,
  ): Promise<void> {
    if (condition.kind === "element") {
      await this.waitForElement(condition, timeoutMs);
      return;
    }
    await this.waitForNonElement(condition, timeoutMs);
  }

  private async waitForNonElement(
    condition: Exclude<QAWaitCondition, { kind: "element" }>,
    timeoutMs?: number,
  ): Promise<void> {
    const timeoutArgs = timeoutMs ? ["--timeout", String(timeoutMs)] : [];
    switch (condition.kind) {
      case "duration":
        await this.run(["wait", String(condition.ms), ...timeoutArgs]);
        break;
      case "url":
        await this.run(["wait", "--url", condition.pattern, ...timeoutArgs]);
        break;
      case "text":
        await this.run(["wait", "--text", condition.text, ...timeoutArgs]);
        break;
      case "load":
        await this.run(["wait", "--load", condition.state, ...timeoutArgs]);
        break;
      case "function":
        await this.run(["wait", "--fn", condition.expression, ...timeoutArgs]);
        break;
    }
  }

  private async waitForElement(
    condition: Extract<QAWaitCondition, { kind: "element" }>,
    timeoutMs?: number,
  ): Promise<void> {
    const timeoutArgs = timeoutMs ? ["--timeout", String(timeoutMs)] : [];
    if (condition.target.kind === "css" || condition.target.kind === "ref") {
      await this.run([
        "wait",
        condition.target.kind === "css"
          ? condition.target.selector
          : condition.target.ref,
        "--state",
        condition.state ?? "visible",
        ...timeoutArgs,
      ]);
      return;
    }
    await this.run([
      "wait",
      "--fn",
      buildWaitFunctionScript(condition.target, condition.state ?? "visible"),
      ...timeoutArgs,
    ]);
  }

  private async captureScreenshot(path: string): Promise<void> {
    await ensureParent(path);
    await this.run(["screenshot", "--annotate", path]);
  }

  private async scroll(direction: string, pixels?: number): Promise<void> {
    const args = ["scroll", direction];
    if (typeof pixels === "number") args.push(String(pixels));
    await this.run(args);
  }

  private async runAndWait(args: string[]): Promise<void> {
    await this.run(args);
    await this.run(["wait", "--load", "networkidle"]).catch(() => undefined);
  }

  private async evaluate(
    script: string,
    expectContains?: string,
  ): Promise<string> {
    const raw = await this.run(["eval", "--base64", encodeScript(script)]);
    if (expectContains && !raw.includes(expectContains)) {
      throw new Error(`Eval result did not contain "${expectContains}".`);
    }
    return raw;
  }

  private async evaluateBoolean(script: string): Promise<boolean> {
    return parseBoolean(await this.run(["eval", script]));
  }

  private async runJson(args: string[]): Promise<string> {
    return this.run(args, true);
  }

  private async run(args: string[], json = false): Promise<string> {
    try {
      const { stdout } = await exec(
        AGENT_BROWSER_EXECUTABLE,
        this.buildCommandArgs(args, json),
        {
          timeout: 60_000,
          windowsHide: true,
        },
      );
      return stdout.trim();
    } catch (error) {
      throw new Error(formatExecFailure(args, error), { cause: error });
    }
  }

  private buildCommandArgs(args: string[], json: boolean): string[] {
    return [
      ...(json ? ["--json"] : []),
      ...(this.options.headed ? ["--headed"] : []),
      ...(this.options.cdpPort ? ["--cdp", String(this.options.cdpPort)] : []),
      "--session",
      this.options.sessionId,
      ...buildSessionNameArgs(this.options.sessionName),
      ...args,
    ];
  }
}

function isPassiveStep(
  step: QAStep,
): step is Extract<
  QAStep,
  { kind: "assert" | "snapshot" | "screenshot" | "checkpoint" }
> {
  return ["assert", "snapshot", "screenshot", "checkpoint"].includes(step.kind);
}
