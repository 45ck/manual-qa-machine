import { execFile } from "child_process";
import { join } from "path";
import { promisify } from "util";
import type { Verdict } from "./types.js";
import type { StabilityResult } from "./promote-types.js";
import { QARunner } from "./runner.js";
import type { QAFlow } from "./types.js";

const exec = promisify(execFile);

type RunEntry = { attempt: number; verdict: Verdict; reportPath?: string };

export interface FlowStabilityOptions {
  flow: QAFlow;
  runs: number;
  threshold: number;
  outputDir: string;
  cdpPort?: number;
  headed?: boolean;
}

export async function checkFlowStability(
  options: FlowStabilityOptions,
): Promise<StabilityResult> {
  const { flow, runs, threshold, outputDir } = options;
  const runResults: RunEntry[] = [];

  for (let attempt = 0; attempt < runs; attempt++) {
    const attemptDir = join(outputDir, `stability-${attempt}`);
    const runner = new QARunner({
      outputDir: attemptDir,
      cdpPort: options.cdpPort,
      headed: options.headed,
    });

    try {
      const report = await runner.runFlow(
        { ...flow, sessionMode: "fresh" },
        [],
      );
      const reportPath = join(attemptDir, "report.json");
      runResults.push({
        attempt,
        verdict: report.verdict,
        reportPath,
      });
    } catch {
      runResults.push({
        attempt,
        verdict: "fail",
      });
    }
  }

  return buildStabilityResult(runResults, runs, threshold);
}

export async function checkPlaywrightStability(
  specPath: string,
  runs: number,
  threshold: number,
): Promise<StabilityResult> {
  const runResults = await collectPlaywrightResults(specPath, runs);

  const totalRuns = runResults.length > 0 ? runResults.length : runs;
  return buildStabilityResult(runResults, totalRuns, threshold);
}

async function collectPlaywrightResults(
  specPath: string,
  runs: number,
): Promise<RunEntry[]> {
  try {
    const { stdout } = await exec("npx", [
      "playwright",
      "test",
      specPath,
      `--repeat-each=${runs}`,
      "--reporter=json",
    ]);

    return parsePlaywrightReport(stdout);
  } catch {
    // Playwright not installed or test run failed — treat all runs as failed.
    return Array.from({ length: runs }, (_, i) => ({
      attempt: i,
      verdict: "fail" as Verdict,
    }));
  }
}

interface PlaywrightJsonReport {
  suites?: {
    specs?: {
      tests?: {
        results?: { status: string }[];
      }[];
    }[];
  }[];
}

function parsePlaywrightReport(stdout: string): RunEntry[] {
  const report: PlaywrightJsonReport = JSON.parse(
    stdout,
  ) as PlaywrightJsonReport;
  const entries: RunEntry[] = [];
  let attempt = 0;

  for (const suite of report.suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        for (const result of results) {
          const verdict: Verdict = result.status === "passed" ? "pass" : "fail";
          entries.push({ attempt, verdict });
          attempt++;
        }
      }
    }
  }

  return entries;
}

function buildStabilityResult(
  runResults: RunEntry[],
  totalRuns: number,
  threshold: number,
): StabilityResult {
  const passCount = runResults.filter(
    (r) => r.verdict === "pass" || r.verdict === "pass_with_warnings",
  ).length;
  const passRate = totalRuns > 0 ? passCount / totalRuns : 0;

  return {
    totalRuns,
    passCount,
    passRate,
    stable: passRate >= threshold,
    stabilityThreshold: threshold,
    runs: runResults,
  };
}
