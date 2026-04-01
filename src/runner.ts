import type { Browser, Page, CDPSession } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  QAFlow,
  QAStep,
  StepResult,
  ConsoleEntry,
  NetworkEntry,
  QAReport,
} from './types.js';

export interface RunnerOptions {
  /** Chrome remote debugging URL (default: http://localhost:9222) */
  chromeUrl?: string;
  /** Directory to save screenshots and report */
  outputDir: string;
  /** Wait time between steps in ms (default: 1000) */
  stepDelay?: number;
}

export class QARunner {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private consoleEntries: ConsoleEntry[] = [];
  private networkEntries: NetworkEntry[] = [];
  private currentStep = 0;

  constructor(private options: RunnerOptions) {
    this.options.chromeUrl ??= 'http://localhost:9222';
    this.options.stepDelay ??= 1000;
  }

  async connect(): Promise<void> {
    this.browser = await puppeteer.connect({
      browserURL: this.options.chromeUrl,
    });

    const pages = await this.browser.pages();
    this.page = pages[0] ?? (await this.browser.newPage());

    // Capture console messages
    this.page.on('console', (msg) => {
      const level = msg.type() as ConsoleEntry['level'];
      if (level === 'error' || level === 'warning') {
        this.consoleEntries.push({
          level,
          message: msg.text(),
          source: msg.location()?.url,
          step: this.currentStep,
        });
      }
    });

    // Capture failed network requests
    this.page.on('response', (response) => {
      const status = response.status();
      if (status >= 400) {
        this.networkEntries.push({
          status,
          method: response.request().method(),
          url: response.url(),
          step: this.currentStep,
        });
      }
    });
  }

  async disconnect(): Promise<void> {
    this.browser?.disconnect();
  }

  async runFlow(flow: QAFlow): Promise<QAReport> {
    await mkdir(this.options.outputDir, { recursive: true });

    const startTime = Date.now();
    const results: StepResult[] = [];

    // Take initial screenshot
    const initialResult = await this.captureState(0, 'initial', `Load ${flow.url}`);
    results.push(initialResult);

    // Navigate to starting URL
    await this.page!.goto(flow.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.screenshot('00-initial.png');

    // Execute each step
    for (let i = 0; i < flow.steps.length; i++) {
      this.currentStep = i + 1;
      const step = flow.steps[i];
      const result = await this.executeStep(step, i + 1);
      results.push(result);

      // Delay between steps
      await this.delay(this.options.stepDelay!);
    }

    const duration = Date.now() - startTime;
    const hasErrors = results.some((r) => r.status === 'fail');
    const hasWarnings = results.some((r) => r.status === 'warning');

    const report: QAReport = {
      flowName: flow.name,
      baseUrl: flow.url,
      date: new Date().toISOString(),
      steps: results,
      consoleErrors: this.consoleEntries,
      networkErrors: this.networkEntries,
      duration,
      result: hasErrors ? 'fail' : hasWarnings ? 'issues' : 'pass',
    };

    return report;
  }

  private async executeStep(step: QAStep, num: number): Promise<StepResult> {
    const startTime = Date.now();
    const description =
      step.description ?? `${step.action} ${step.target ?? ''}`.trim();
    const observations: string[] = [];
    let status: StepResult['status'] = 'pass';

    try {
      switch (step.action) {
        case 'navigate':
          await this.page!.goto(step.target!, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          break;

        case 'click':
          await this.page!.waitForSelector(step.target!, { timeout: 10000 });
          await this.page!.click(step.target!);
          break;

        case 'type':
          await this.page!.waitForSelector(step.target!, { timeout: 10000 });
          await this.page!.type(step.target!, step.value ?? '');
          break;

        case 'scroll':
          await this.page!.evaluate(
            (selector) => {
              const el = selector
                ? document.querySelector(selector)
                : window;
              el?.scrollBy?.(0, 500);
            },
            step.target ?? null
          );
          break;

        case 'wait':
          await this.delay(step.wait ?? 2000);
          break;

        case 'assert': {
          const content = await this.page!.content();
          if (!content.includes(step.target ?? '')) {
            status = 'fail';
            observations.push(
              `Assertion failed: expected text "${step.target}" not found on page`
            );
          }
          break;
        }
      }

      // Wait after action if specified
      if (step.wait && step.action !== 'wait') {
        await this.delay(step.wait);
      }
    } catch (err) {
      status = 'fail';
      observations.push(`Error: ${(err as Error).message}`);
    }

    // Screenshot
    const padded = String(num).padStart(2, '0');
    const slug = description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40);
    const screenshotName = `${padded}-${slug}.png`;
    let screenshotPath: string | undefined;

    if (step.screenshot !== false) {
      screenshotPath = await this.screenshot(screenshotName);
    }

    // Check for new console errors at this step
    const stepConsoleErrors = this.consoleEntries.filter(
      (e) => e.step === num && e.level === 'error'
    );
    if (stepConsoleErrors.length > 0) {
      if (status === 'pass') status = 'warning';
      observations.push(
        `${stepConsoleErrors.length} console error(s) detected`
      );
    }

    // Check for network errors at this step
    const stepNetworkErrors = this.networkEntries.filter(
      (e) => e.step === num
    );
    if (stepNetworkErrors.length > 0) {
      if (status === 'pass') status = 'warning';
      observations.push(
        `${stepNetworkErrors.length} failed network request(s)`
      );
    }

    return {
      stepNumber: num,
      action: step.action,
      description,
      url: this.page!.url(),
      status,
      screenshotPath,
      consoleErrors: stepConsoleErrors,
      networkErrors: stepNetworkErrors,
      observations,
      duration: Date.now() - startTime,
    };
  }

  private async screenshot(filename: string): Promise<string> {
    const filepath = join(this.options.outputDir, filename);
    await this.page!.screenshot({ path: filepath, fullPage: false });
    return filename;
  }

  private async captureState(
    num: number,
    action: string,
    description: string
  ): Promise<StepResult> {
    return {
      stepNumber: num,
      action,
      description,
      url: this.page?.url() ?? 'about:blank',
      status: 'pass',
      consoleErrors: [],
      networkErrors: [],
      observations: [],
      duration: 0,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
