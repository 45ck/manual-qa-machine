import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import { join } from "path";
import type {
  QAFlow,
  QAStep,
  StepResult,
  ConsoleEntry,
  NetworkEntry,
  QAReport,
} from "./types.js";

const exec = promisify(execFile);

export interface RunnerOptions {
  /** Directory to save screenshots and report */
  outputDir: string;
  /** Wait time between steps in ms (default: 1000) */
  stepDelay?: number;
}

/** Run an agent-browser CLI command and return stdout */
async function ab(...args: string[]): Promise<string> {
  const { stdout } = await exec("agent-browser", args, {
    timeout: 30_000,
  });
  return stdout.trim();
}

export class QARunner {
  private currentStep = 0;
  private consoleEntries: ConsoleEntry[] = [];
  private networkEntries: NetworkEntry[] = [];
  private currentUrl = "about:blank";

  constructor(private options: RunnerOptions) {
    this.options.stepDelay ??= 1000;
  }

  async connect(): Promise<void> {
    // agent-browser manages its own daemon — just verify it's available
    await ab("--version");
  }

  async disconnect(): Promise<void> {
    // agent-browser daemon stays resident; nothing to tear down
  }

  async runFlow(flow: QAFlow): Promise<QAReport> {
    await mkdir(this.options.outputDir, { recursive: true });

    const startTime = Date.now();
    const results: StepResult[] = [];

    // Navigate to starting URL
    await ab("open", flow.url);
    this.currentUrl = flow.url;

    // Wait for page load
    await this.delay(2000);

    // Capture initial state
    await this.captureScreenshot("00-initial.png");
    results.push(this.makeResult(0, "initial", `Load ${flow.url}`));

    // Collect baseline errors
    await this.collectErrors(0);

    // Execute each step
    for (let i = 0; i < flow.steps.length; i++) {
      this.currentStep = i + 1;
      const step = flow.steps[i];
      const result = await this.executeStep(step, i + 1);
      results.push(result);
      await this.delay(this.options.stepDelay!);
    }

    const duration = Date.now() - startTime;
    const hasErrors = results.some((r) => r.status === "fail");
    const hasWarnings = results.some((r) => r.status === "warning");

    return {
      flowName: flow.name,
      baseUrl: flow.url,
      date: new Date().toISOString(),
      steps: results,
      consoleErrors: this.consoleEntries,
      networkErrors: this.networkEntries,
      duration,
      result: hasErrors ? "fail" : hasWarnings ? "issues" : "pass",
    };
  }

  private async executeStep(step: QAStep, num: number): Promise<StepResult> {
    const startTime = Date.now();
    const description =
      step.description ?? `${step.action} ${step.target ?? ""}`.trim();
    const observations: string[] = [];

    let status = await this.tryAction(step, observations);

    if (step.wait && step.action !== "wait") await this.delay(step.wait);

    const screenshotPath = await this.stepScreenshot(step, num, description);
    status = await this.checkStepErrors(num, status, observations);

    return {
      stepNumber: num,
      action: step.action,
      description,
      url: this.currentUrl,
      status,
      screenshotPath,
      consoleErrors: this.consoleEntries.filter((e) => e.step === num),
      networkErrors: this.networkEntries.filter((e) => e.step === num),
      observations,
      duration: Date.now() - startTime,
    };
  }

  private async tryAction(
    step: QAStep,
    observations: string[],
  ): Promise<StepResult["status"]> {
    try {
      await this.performAction(step);
      return "pass";
    } catch (err) {
      observations.push(`Error: ${(err as Error).message}`);
      return "fail";
    }
  }

  private async stepScreenshot(
    step: QAStep,
    num: number,
    description: string,
  ): Promise<string | undefined> {
    if (step.screenshot === false) return undefined;
    const padded = String(num).padStart(2, "0");
    const slug = description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40);
    return this.captureScreenshot(`${padded}-${slug}.png`);
  }

  private async checkStepErrors(
    num: number,
    status: StepResult["status"],
    observations: string[],
  ): Promise<StepResult["status"]> {
    const { consoleErrors, networkErrors } = await this.collectErrors(num);
    let result = status;
    if (consoleErrors > 0) {
      if (result === "pass") result = "warning";
      observations.push(`${consoleErrors} console error(s) detected`);
    }
    if (networkErrors > 0) {
      if (result === "pass") result = "warning";
      observations.push(`${networkErrors} failed network request(s)`);
    }
    return result;
  }

  private async performAction(step: QAStep): Promise<void> {
    switch (step.action) {
      case "navigate":
        return this.doNavigate(step.target!);
      case "click":
        return this.doClick(step.target!);
      case "type":
        return this.doType(step.target!, step.value ?? "");
      case "scroll":
        return this.doScroll(step.target);
      case "wait":
        return this.doWait(step.wait);
      case "assert":
        return this.doAssert(step.target ?? "");
    }
  }

  private async doNavigate(url: string): Promise<void> {
    await ab("open", url);
    this.currentUrl = url;
    await this.delay(1500);
  }

  private async doClick(selector: string): Promise<void> {
    const snapshot = await ab("snapshot", "-i");
    const ref = this.findRef(snapshot, selector);
    if (ref) {
      await ab("click", ref);
    } else {
      await ab(
        "execute",
        `document.querySelector('${this.escapeSelector(selector)}')?.click()`,
      );
    }
    await this.delay(500);
  }

  private async doType(selector: string, value: string): Promise<void> {
    const snapshot = await ab("snapshot", "-i");
    const ref = this.findRef(snapshot, selector);
    if (ref) {
      await ab("type", value);
    } else {
      const escaped = this.escapeSelector(selector);
      const val = this.escapeJS(value);
      await ab(
        "execute",
        `(() => { const el = document.querySelector('${escaped}'); if(el){el.value='${val}'; el.dispatchEvent(new Event('input',{bubbles:true}))} })()`,
      );
    }
  }

  private async doScroll(target?: string): Promise<void> {
    await ab("scroll", target === "up" ? "up" : "down");
    await this.delay(300);
  }

  private async doWait(ms?: number): Promise<void> {
    await this.delay(ms ?? 2000);
  }

  private async doAssert(text: string): Promise<void> {
    const source = await ab("source");
    if (!source.includes(text)) {
      throw new Error(`Assertion failed: "${text}" not found`);
    }
  }

  private async captureScreenshot(filename: string): Promise<string> {
    const filepath = join(this.options.outputDir, filename);
    await ab("screenshot", filepath);
    return filename;
  }

  private async collectErrors(
    stepNum: number,
  ): Promise<{ consoleErrors: number; networkErrors: number }> {
    const consoleErrors = await this.collectConsoleErrors(stepNum);
    const networkErrors = await this.collectNetworkErrors(stepNum);
    return { consoleErrors, networkErrors };
  }

  private async collectConsoleErrors(stepNum: number): Promise<number> {
    try {
      const output = await ab("console");
      const lines = output
        .split("\n")
        .filter((l) => l.includes("[error]") || l.includes("[warning]"));
      let count = 0;
      for (const line of lines) {
        if (this.consoleEntries.some((e) => e.message === line)) continue;
        const level = line.includes("[error]") ? "error" : "warning";
        this.consoleEntries.push({ level, message: line, step: stepNum });
        if (level === "error") count++;
      }
      return count;
    } catch {
      return 0;
    }
  }

  private async collectNetworkErrors(stepNum: number): Promise<number> {
    try {
      const output = await ab("network", "requests");
      const failed = output.split("\n").filter((l) => /\b[45]\d{2}\b/.test(l));
      let count = 0;
      for (const line of failed) {
        if (this.networkEntries.some((e) => e.url === line)) continue;
        const status = line.match(/\b([45]\d{2})\b/);
        const method = line.match(
          /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/,
        );
        this.networkEntries.push({
          status: status ? parseInt(status[1]) : 0,
          method: method ? method[1] : "GET",
          url: line.trim(),
          step: stepNum,
        });
        count++;
      }
      return count;
    } catch {
      return 0;
    }
  }

  /** Search snapshot output for an interactive ref matching a selector */
  private findRef(snapshot: string, selector: string): string | null {
    // snapshot -i output has lines like: [@ref=42] <button>Click me</button>
    // Try to match by id, class, text, or tag
    const lines = snapshot.split("\n");
    const selectorLower = selector.toLowerCase();

    for (const line of lines) {
      const refMatch = line.match(/@ref=(\d+)/);
      if (!refMatch) continue;

      const lineLower = line.toLowerCase();
      if (
        lineLower.includes(selectorLower) ||
        lineLower.includes(selectorLower.replace(/^[#.]/, ""))
      ) {
        return `@${refMatch[1]}`;
      }
    }
    return null;
  }

  private makeResult(
    num: number,
    action: string,
    description: string,
  ): StepResult {
    return {
      stepNumber: num,
      action,
      description,
      url: this.currentUrl,
      status: "pass",
      consoleErrors: [],
      networkErrors: [],
      observations: [],
      duration: 0,
    };
  }

  private escapeSelector(sel: string): string {
    return sel.replace(/'/g, "\\'");
  }

  private escapeJS(str: string): string {
    return str.replace(/'/g, "\\'").replace(/\n/g, "\\n");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
