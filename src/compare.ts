import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, join } from "path";
import type { QAReport } from "./types.js";
import type { CompareArtifact, CompareResult } from "./compare-types.js";
import { diffImages } from "./diff.js";
import { parseJson, slugify, stableStringify, writeJsonFile } from "./utils.js";

function pairRuns(report: QAReport): Map<string, QAReport["runs"][number]> {
  return new Map(report.runs.map((run) => [run.viewport.name, run]));
}

function screenshotPath(
  step: QAReport["runs"][number]["steps"][number],
): string | undefined {
  return step.evidence.artifacts.screenshotPath;
}

function snapshotPath(
  step: QAReport["runs"][number]["steps"][number],
): string | undefined {
  return step.evidence.artifacts.snapshotPath;
}

export async function compareReports(
  baselineReportPath: string,
  candidateReportPath: string,
  outputDir: string,
): Promise<CompareResult> {
  const [baseline, candidate] = await loadCompareInputs(
    baselineReportPath,
    candidateReportPath,
  );
  await mkdir(outputDir, { recursive: true });
  const artifacts: CompareArtifact[] = [];
  const baselineRuns = pairRuns(baseline);
  for (const candidateRun of candidate.runs) {
    const baselineRun = baselineRuns.get(candidateRun.viewport.name);
    if (!baselineRun) continue;
    artifacts.push(
      ...(await compareViewportRuns(baselineRun, candidateRun, outputDir)),
    );
  }
  const result: CompareResult = {
    baselineReport: basename(baselineReportPath),
    candidateReport: basename(candidateReportPath),
    verdictChanged: baseline.verdict !== candidate.verdict,
    baselineVerdict: baseline.verdict,
    candidateVerdict: candidate.verdict,
    baselineWarnings: baseline.warnings,
    candidateWarnings: candidate.warnings,
    artifacts,
  };
  await writeJsonFile(join(outputDir, "compare-report.json"), result);
  await writeFile(
    join(outputDir, "compare-report.md"),
    renderCompareMarkdown(result),
    "utf8",
  );
  return result;
}

function renderCompareMarkdown(result: CompareResult): string {
  const lines = [
    "# QA Compare Report",
    "",
    `**Baseline:** ${result.baselineReport}`,
    `**Candidate:** ${result.candidateReport}`,
    `**Baseline Verdict:** ${result.baselineVerdict}`,
    `**Candidate Verdict:** ${result.candidateVerdict}`,
    `**Verdict Changed:** ${result.verdictChanged ? "yes" : "no"}`,
    "",
    "## Artifact Diffs",
    "",
  ];
  if (result.artifacts.length === 0) {
    lines.push("No comparable artifacts were found.");
  }
  for (const artifact of result.artifacts) {
    lines.push(
      `- ${artifact.viewport} step ${artifact.stepIndex}: mismatch ${(artifact.mismatchRatio ?? 0).toFixed(4)}, snapshot ${artifact.snapshotChanged ? "changed" : "matched"}`,
    );
  }
  return lines.join("\n");
}

async function loadCompareInputs(
  baselineReportPath: string,
  candidateReportPath: string,
): Promise<[QAReport, QAReport]> {
  const [baselineRaw, candidateRaw] = await Promise.all([
    readFile(baselineReportPath, "utf8"),
    readFile(candidateReportPath, "utf8"),
  ]);
  const baseline = parseJson<QAReport>(baselineRaw);
  const candidate = parseJson<QAReport>(candidateRaw);
  if (!baseline || !candidate) {
    throw new Error("Both compare inputs must be valid qa-report.json files.");
  }
  return [baseline, candidate];
}

async function compareViewportRuns(
  baselineRun: QAReport["runs"][number],
  candidateRun: QAReport["runs"][number],
  outputDir: string,
): Promise<CompareArtifact[]> {
  const artifacts: CompareArtifact[] = [];
  for (const step of candidateRun.steps) {
    const baselineStep = baselineRun.steps.find(
      (item) => item.index === step.index,
    );
    if (!baselineStep) continue;
    const artifact = await compareStepArtifacts(
      { viewportName: candidateRun.viewport.name, stepIndex: step.index },
      baselineStep,
      step,
      outputDir,
    );
    if (artifact) artifacts.push(artifact);
  }
  return artifacts;
}

async function compareStepArtifacts(
  context: { stepIndex: number; viewportName: string },
  baselineStep: QAReport["runs"][number]["steps"][number],
  candidateStep: QAReport["runs"][number]["steps"][number],
  outputDir: string,
): Promise<CompareArtifact | null> {
  const { stepIndex, viewportName } = context;
  const artifact: CompareArtifact = {
    viewport: viewportName,
    stepIndex,
    baselineImage: screenshotPath(baselineStep),
    candidateImage: screenshotPath(candidateStep),
    baselineSnapshot: snapshotPath(baselineStep),
    candidateSnapshot: snapshotPath(candidateStep),
  };
  await attachImageDiff(artifact, outputDir);
  await attachSnapshotDiff(artifact, outputDir);
  return hasCompareData(artifact) ? artifact : null;
}

async function diffSnapshots(
  baselinePath: string,
  candidatePath: string,
  outputPath: string,
): Promise<{ snapshotChanged: boolean; snapshotDiffPath?: string }> {
  const [baselineRaw, candidateRaw] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(candidatePath, "utf8"),
  ]);
  const baseline = parseJson<unknown>(baselineRaw) ?? baselineRaw;
  const candidate = parseJson<unknown>(candidateRaw) ?? candidateRaw;
  const snapshotChanged =
    stableStringify(baseline) !== stableStringify(candidate);
  if (!snapshotChanged) return { snapshotChanged };
  await writeJsonFile(outputPath, { baseline, candidate });
  return { snapshotChanged, snapshotDiffPath: outputPath };
}

function hasCompareData(artifact: CompareArtifact): boolean {
  return Boolean(
    artifact.diffImage ||
    artifact.baselineSnapshot ||
    artifact.candidateSnapshot ||
    artifact.baselineImage ||
    artifact.candidateImage,
  );
}

async function attachImageDiff(
  artifact: CompareArtifact,
  outputDir: string,
): Promise<void> {
  if (!artifact.baselineImage || !artifact.candidateImage) return;
  const diffName = `${slugify(artifact.viewport)}-${artifact.stepIndex}-diff.png`;
  const diffPath = join(outputDir, diffName);
  const diff = await diffImages(
    artifact.baselineImage,
    artifact.candidateImage,
    diffPath,
  );
  artifact.diffImage = diff.diffPath;
  artifact.mismatchRatio = diff.mismatchRatio;
}

async function attachSnapshotDiff(
  artifact: CompareArtifact,
  outputDir: string,
): Promise<void> {
  if (!artifact.baselineSnapshot || !artifact.candidateSnapshot) return;
  const snapshotDiff = await diffSnapshots(
    artifact.baselineSnapshot,
    artifact.candidateSnapshot,
    join(
      outputDir,
      `${slugify(artifact.viewport)}-${artifact.stepIndex}-snapshot-diff.json`,
    ),
  );
  artifact.snapshotChanged = snapshotDiff.snapshotChanged;
  artifact.snapshotDiffPath = snapshotDiff.snapshotDiffPath;
}
