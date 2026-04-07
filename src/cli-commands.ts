import { execFile } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { promisify } from "util";
import { AgentBrowserAdapter } from "./adapters/agent-browser.js";
import { writeExploreReportFiles } from "./explore-reporter.js";
import type { ExploratoryConfig } from "./explore-types.js";
import { Explorer } from "./explorer.js";
import { initProject } from "./init.js";
import { promoteFinding } from "./promoter.js";
import { writeReportFiles } from "./reporter.js";
import { QARunner } from "./runner.js";
import { loadFlow } from "./schema.js";
import type { CertificationReport, Verdict } from "./types.js";
import { DEFAULT_VIEWPORTS } from "./types.js";
import { durationMs, ensureParent, nowIso, writeJsonFile } from "./utils.js";

const execAsync = promisify(execFile);

export interface InitArgs {
  "base-url"?: string;
  force?: boolean;
}

export interface ExploreArgs {
  cdp?: number;
  headed?: boolean;
  output?: string;
  session?: "fresh" | "reuse";
  url: string;
  objectives?: string;
  depth?: number;
  timeout?: number;
  "max-interactions"?: number;
  scope?: string;
  exclude?: string;
}

export interface PromoteArgs {
  finding: string;
  target?: "flow" | "playwright";
  certify?: boolean;
  runs?: number;
  threshold?: number;
  force?: boolean;
  output?: string;
}

export async function initCommand(args: InitArgs): Promise<void> {
  const created = await initProject({
    targetDir: process.cwd(),
    baseUrl: args["base-url"] ?? "http://localhost:3000",
    force: args.force ?? false,
  });
  if (created.length === 0) {
    console.log("All files already exist. Use --force to overwrite.");
    return;
  }
  console.log(`Created ${created.length} file(s):`);
  for (const file of created) console.log(`  ${file}`);
}

export async function exploreCommand(
  args: ExploreArgs,
  defaultOutputDir: (name: string) => string,
  setExitCode: (verdict: Verdict) => void,
): Promise<void> {
  const outputDir = resolve(args.output ?? defaultOutputDir("explore"));
  const config: ExploratoryConfig = {
    startUrl: args.url,
    objectives: args.objectives ? [{ description: args.objectives }] : [],
    maxDepth: args.depth ?? 20,
    timeoutMs: args.timeout ?? 300_000,
    maxInteractions: args["max-interactions"] ?? 100,
    viewport: DEFAULT_VIEWPORTS[0],
    sessionMode: args.session ?? "reuse",
    scopePatterns: args.scope ? [args.scope] : [],
    excludePatterns: args.exclude ? [args.exclude] : [],
    auditAccessibility: true,
    auditPerformance: true,
  };
  const explorer = new Explorer({
    outputDir,
    cdpPort: args.cdp,
    headed: args.headed,
  });
  const report = await explorer.explore(config);
  await writeExploreReportFiles(report, outputDir);
  console.log(`Explore: ${report.startUrl}`);
  console.log(`Verdict: ${report.verdict}`);
  console.log(`Pages visited: ${report.coverage.pagesVisited}`);
  console.log(`Interactions: ${report.coverage.interactionsConducted}`);
  console.log(`Findings: ${report.findings.length}`);
  console.log(`Output: ${outputDir}`);
  setExitCode(report.verdict);
}

export async function smokeCommand(): Promise<void> {
  try {
    const { stdout, stderr } = await execAsync(
      "npx",
      ["playwright", "test", "tests/smoke", "--reporter=line"],
      { timeout: 300_000, windowsHide: true },
    );
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    if (execError.stdout) console.log(execError.stdout);
    if (execError.stderr) console.error(execError.stderr);
    process.exitCode = 1;
  }
}

export async function promoteCommand(
  args: PromoteArgs,
  defaultOutputDir: (name: string) => string,
): Promise<void> {
  const outputDir = resolve(args.output ?? defaultOutputDir("promote"));
  const result = await promoteFinding({
    findingPath: resolve(args.finding),
    target: args.target,
    certify: args.certify ?? false,
    runs: args.runs ?? 3,
    threshold: args.threshold ?? 1.0,
    force: args.force ?? false,
    outputDir,
  });
  console.log(`Finding: ${result.findingId}`);
  console.log(`Target: ${result.target}`);
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.outputPath}`);
  if (result.stability) {
    console.log(
      `Stability: ${result.stability.passCount}/${result.stability.totalRuns} (${(result.stability.passRate * 100).toFixed(0)}%)`,
    );
  }
  if (result.status === "unstable" || result.status === "rejected") {
    process.exitCode = 1;
  }
}

export async function reportCommand(args: { output?: string }): Promise<void> {
  const reportDir = resolve(args.output ?? "qa");
  const findingsDir = join(reportDir, "findings");
  const indexPath = join(findingsDir, "index.json");
  try {
    const raw = await readFile(indexPath, "utf8");
    const index = JSON.parse(raw) as Record<string, string>;
    const findingIds = Object.keys(index);
    console.log(`Findings: ${findingIds.length}`);
    for (const id of findingIds) {
      await printFinding(findingsDir, index[id], id);
    }
  } catch {
    console.log("No findings found. Run `mqm explore` first.");
  }
}

async function printFinding(
  findingsDir: string,
  relativePath: string,
  id: string,
): Promise<void> {
  const findingPath = join(findingsDir, relativePath);
  try {
    const raw = await readFile(findingPath, "utf8");
    const finding = JSON.parse(raw) as {
      title: string;
      severity: string;
      category: string;
    };
    console.log(
      `  [${finding.severity}] ${finding.category}: ${finding.title}`,
    );
  } catch {
    console.log(`  ${id}: (unable to read)`);
  }
}

export interface CertifyArgs {
  flow: string;
  output?: string;
  headed?: boolean;
  cdp?: number;
}

export interface ScreenshotArgs {
  url: string;
  width?: number;
  height?: number;
  output?: string;
  headed?: boolean;
  cdp?: number;
}

export async function certifyCommand(
  args: CertifyArgs,
  defaultOutputDir: (name: string) => string,
  setExitCode: (verdict: Verdict) => void,
): Promise<void> {
  const raw = await readFile(args.flow, "utf8");
  const loaded = loadFlow(JSON.parse(raw) as unknown);
  const baseOutput = resolve(
    args.output ?? defaultOutputDir(`${loaded.flow.name}-certify`),
  );
  const startedAtIso = nowIso();
  const startedAt = Date.now();
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const flow = { ...loaded.flow, sessionMode: "fresh" as const };
    const outputDir = join(baseOutput, `attempt-${attempt}`);
    const runner = new QARunner({
      outputDir,
      cdpPort: args.cdp,
      headed: args.headed,
    });
    const report = await runner.runFlow(flow, loaded.warnings);
    await writeReportFiles(report, outputDir);
    attempts.push({
      attempt,
      verdict: report.verdict,
      outputDir,
      reportPath: join(outputDir, "qa-report.json"),
    });
  }
  const certification: CertificationReport = {
    flowId: loaded.flow.id,
    flowName: loaded.flow.name,
    startedAt: startedAtIso,
    finishedAt: nowIso(),
    durationMs: durationMs(startedAt),
    verdict: classifyCertificationVerdict(attempts.map((a) => a.verdict)),
    attempts,
  };
  await writeCertificationFiles(certification, baseOutput);
  console.log(JSON.stringify(certification, null, 2));
  setExitCode(certification.verdict);
}

export async function screenshotCommand(
  args: ScreenshotArgs,
  defaultOutputDir: (name: string) => string,
): Promise<void> {
  const outputPath = resolve(
    args.output ?? join(defaultOutputDir("screenshot"), "page.png"),
  );
  const adapter = new AgentBrowserAdapter({
    cdpPort: args.cdp,
    headed: args.headed,
    sessionId: `screenshot-${Date.now()}`,
  });
  try {
    await adapter.verify();
    await adapter.prepareSession({
      startUrl: args.url,
      viewport: {
        ...DEFAULT_VIEWPORTS[0],
        width: args.width ?? DEFAULT_VIEWPORTS[0].width,
        height: args.height ?? DEFAULT_VIEWPORTS[0].height,
      },
    });
    const evidence = await adapter.captureEvidence({
      screenshotPath: outputPath,
      snapshotPath: buildSnapshotPath(outputPath),
    });
    console.log(
      JSON.stringify(
        {
          url: evidence.actualUrl,
          screenshot: evidence.artifacts.screenshotPath,
          snapshot: evidence.artifacts.snapshotPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await adapter.finalize().catch(() => undefined);
  }
}

function classifyCertificationVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.every((v) => v === "pass")) return "pass";
  if (verdicts.every((v) => ["pass", "pass_with_warnings"].includes(v))) {
    return verdicts.includes("pass_with_warnings")
      ? "pass_with_warnings"
      : "pass";
  }
  if (verdicts.every((v) => v === "fail")) return "fail";
  return "inconclusive";
}

function buildSnapshotPath(screenshotPath: string): string {
  const ext = /\.[^.]+$/.exec(screenshotPath)?.[0] ?? "";
  return screenshotPath.replace(
    new RegExp(`${escapeRegExp(ext)}$`),
    ".snapshot.json",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeCertificationFiles(
  report: CertificationReport,
  outputDir: string,
): Promise<void> {
  await writeJsonFile(join(outputDir, "certify-report.json"), report);
  const markdown = [
    `# Certification Report: ${report.flowName}`,
    "",
    `**Flow ID:** ${report.flowId}`,
    `**Verdict:** ${report.verdict}`,
    `**Started:** ${report.startedAt}`,
    `**Finished:** ${report.finishedAt}`,
    `**Duration:** ${(report.durationMs / 1000).toFixed(1)}s`,
    "",
    "## Attempts",
    "",
    ...report.attempts.map(
      (a) =>
        `- Attempt ${a.attempt}: ${a.verdict} (\`${a.reportPath.replaceAll("\\", "/")}\`)`,
    ),
    "",
  ].join("\n");
  await ensureParent(join(outputDir, "certify-report.md"));
  await writeFile(join(outputDir, "certify-report.md"), markdown, "utf8");
}
