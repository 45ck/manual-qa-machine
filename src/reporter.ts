import { writeFile } from "fs/promises";
import { relative, resolve } from "path";
import { writeJsonFile } from "./utils.js";
import type { QAReport, StepResult } from "./types.js";

function relativePath(from: string, target?: string): string | undefined {
  if (!target) return undefined;
  return relative(from, target).replaceAll("\\", "/");
}

function stepCounts(report: QAReport): {
  pass: number;
  warnings: number;
  fail: number;
  inconclusive: number;
} {
  let pass = 0;
  let warnings = 0;
  let fail = 0;
  let inconclusive = 0;
  for (const run of report.runs) {
    for (const step of run.steps) {
      if (step.verdict === "pass") pass += 1;
      if (step.verdict === "pass_with_warnings") warnings += 1;
      if (step.verdict === "fail") fail += 1;
      if (step.verdict === "inconclusive") inconclusive += 1;
    }
  }
  return { pass, warnings, fail, inconclusive };
}

function stepMarkdown(reportDir: string, step: StepResult): string[] {
  const screenshot = relativePath(
    reportDir,
    step.evidence.artifacts.screenshotPath,
  );
  const snapshot = relativePath(
    reportDir,
    step.evidence.artifacts.snapshotPath,
  );
  const diff = relativePath(reportDir, step.evidence.artifacts.diffPath);
  const lines = [
    `### Step ${step.index}: ${step.name}`,
    `**Action:** ${step.kind}`,
    `**Verdict:** ${step.verdict}`,
    `**URL:** ${step.evidence.actualUrl}`,
    `**Duration:** ${step.durationMs}ms`,
    "",
  ];
  if (screenshot) lines.push(`![Step ${step.index}](${screenshot})`, "");
  if (snapshot) lines.push(`**Snapshot:** \`${snapshot}\``, "");
  if (diff) lines.push(`**Visual Diff:** \`${diff}\``, "");
  lines.push(...notesSection(step));
  lines.push(...assertionSection(step));
  lines.push(...evidenceSection(step));
  lines.push("", "---", "");
  return lines;
}

function notesSection(step: StepResult): string[] {
  if (step.notes.length === 0) return [];
  return ["**Notes:**", ...step.notes.map((note) => `- ${note}`), ""];
}

function assertionSection(step: StepResult): string[] {
  if (step.assertions.length === 0) return [];
  return [
    "**Assertions:**",
    ...step.assertions.map(
      (assertion) =>
        `- ${assertion.kind}: ${assertion.passed ? "pass" : assertion.message}`,
    ),
    "",
  ];
}

function evidenceSection(step: StepResult): string[] {
  const consoleErrors = step.evidence.consoleEvents.filter((event) =>
    ["assert", "error"].includes(event.level.toLowerCase()),
  );
  const failedRequests = step.evidence.networkEvents.filter(
    (event) => !event.ok,
  );
  const lines = [
    `**Console Events:** ${step.evidence.consoleEvents.length}`,
    `**Console Errors:** ${consoleErrors.length}`,
    `**Network Events:** ${step.evidence.networkEvents.length}`,
    `**Failed Requests:** ${failedRequests.length}`,
    `**Page Errors:** ${step.evidence.pageErrors.length}`,
    `**Accessibility Issues:** ${step.evidence.accessibility.length}`,
  ];
  if (!step.evidence.performance) return lines;
  lines.push(
    `**Performance:** load=${Math.round(step.evidence.performance.loadMs ?? 0)}ms, dcl=${Math.round(
      step.evidence.performance.domContentLoadedMs ?? 0,
    )}ms, lcp=${Math.round(step.evidence.performance.largestContentfulPaintMs ?? 0)}ms`,
  );
  return lines;
}

export function generateMarkdownReport(
  report: QAReport,
  reportDir: string,
): string {
  const counts = stepCounts(report);
  const lines = [
    `# QA Report: ${report.flowName}`,
    "",
    `**Flow ID:** ${report.flowId}`,
    `**Started:** ${report.startedAt}`,
    `**Finished:** ${report.finishedAt}`,
    `**Duration:** ${(report.durationMs / 1000).toFixed(1)}s`,
    `**Verdict:** ${report.verdict}`,
    `**Session:** ${report.session.mode} (${report.session.name})`,
    "",
    "## Summary",
    "",
    `- Passed steps: ${counts.pass}`,
    `- Warning steps: ${counts.warnings}`,
    `- Failed steps: ${counts.fail}`,
    `- Inconclusive steps: ${counts.inconclusive}`,
    "",
  ];
  if (report.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }
  for (const run of report.runs) {
    lines.push(
      `## Viewport: ${run.viewport.name} (${run.viewport.width}x${run.viewport.height})`,
      "",
    );
    lines.push(`**Verdict:** ${run.verdict}`, "");
    for (const step of run.steps) lines.push(...stepMarkdown(reportDir, step));
    if (run.policyResults.length > 0) {
      lines.push("### Policy Results", "");
      for (const policy of run.policyResults) {
        lines.push(
          `- ${policy.kind}: ${policy.passed ? "pass" : policy.message}`,
        );
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

export async function writeReportFiles(
  report: QAReport,
  outputDir: string,
): Promise<void> {
  const reportDir = resolve(outputDir);
  const accessibility = report.runs.flatMap((run) =>
    run.steps.flatMap((step) => step.evidence.accessibility),
  );
  const performance = report.runs.flatMap((run) =>
    run.steps
      .map((step) => step.evidence.performance)
      .filter((snapshot) => snapshot !== undefined),
  );
  await writeJsonFile(resolve(reportDir, "qa-report.json"), report);
  await writeJsonFile(
    resolve(reportDir, "console.json"),
    report.runs.flatMap((run) =>
      run.steps.flatMap((step) => step.evidence.consoleEvents),
    ),
  );
  await writeJsonFile(
    resolve(reportDir, "network.json"),
    report.runs.flatMap((run) =>
      run.steps.flatMap((step) => step.evidence.networkEvents),
    ),
  );
  await writeJsonFile(
    resolve(reportDir, "page-errors.json"),
    report.runs.flatMap((run) =>
      run.steps.flatMap((step) => step.evidence.pageErrors),
    ),
  );
  await writeJsonFile(resolve(reportDir, "accessibility.json"), accessibility);
  await writeJsonFile(resolve(reportDir, "performance.json"), performance);
  await writeJsonFile(resolve(reportDir, "run-metadata.json"), {
    flowId: report.flowId,
    flowName: report.flowName,
    verdict: report.verdict,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    session: report.session,
  });
  await writeFile(
    resolve(reportDir, "qa-report.md"),
    generateMarkdownReport(report, reportDir),
    "utf8",
  );
}
