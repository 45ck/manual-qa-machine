#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { AgentBrowserAdapter } from "./adapters/agent-browser.js";
import { compareReports } from "./compare.js";
import { writeReportFiles } from "./reporter.js";
import { QARunner } from "./runner.js";
import { loadFlow } from "./schema.js";
import type { CertificationReport, QAFlow, Verdict } from "./types.js";
import { DEFAULT_POLICIES, DEFAULT_VIEWPORTS } from "./types.js";
import {
  durationMs,
  ensureParent,
  nowIso,
  slugify,
  writeJsonFile,
} from "./utils.js";

interface SharedArgs {
  cdp?: number;
  headed?: boolean;
  output?: string;
  session?: "fresh" | "reuse";
}

interface RunArgs extends SharedArgs {
  flow?: string;
  url?: string;
  name?: string;
}

interface CompareArgs {
  baseline: string;
  candidate: string;
  output?: string;
}

interface ValidateArgs {
  flow: string;
}

interface ScreenshotArgs extends SharedArgs {
  url: string;
  width?: number;
  height?: number;
}

const argv = await yargs(hideBin(process.argv))
  .scriptName("mqm")
  .command("run", "Run a QA flow", (builder) =>
    builder
      .option("flow", {
        type: "string",
        description: "Path to a QA flow JSON file",
      })
      .option("url", {
        type: "string",
        description: "Start URL for a quick smoke run",
      })
      .option("name", {
        type: "string",
        description: "Name for a quick smoke run",
      })
      .option("output", { type: "string", description: "Output directory" })
      .option("headed", {
        type: "boolean",
        default: false,
        description: "Run browser headed",
      })
      .option("cdp", {
        type: "number",
        description: "Connect to an existing browser via CDP",
      })
      .option("session", {
        choices: ["fresh", "reuse"] as const,
        description: "Override flow session mode",
      }),
  )
  .command("validate", "Validate and normalize a flow file", (builder) =>
    builder.option("flow", { type: "string", demandOption: true }),
  )
  .command("certify", "Run a flow three times with fresh sessions", (builder) =>
    builder
      .option("flow", { type: "string", demandOption: true })
      .option("output", { type: "string" })
      .option("headed", { type: "boolean", default: false })
      .option("cdp", { type: "number" }),
  )
  .command("compare", "Compare two qa-report.json files", (builder) =>
    builder
      .option("baseline", { type: "string", demandOption: true })
      .option("candidate", { type: "string", demandOption: true })
      .option("output", { type: "string" }),
  )
  .command(
    "screenshot",
    "Capture a screenshot and snapshot for a URL",
    (builder) =>
      builder
        .option("url", { type: "string", demandOption: true })
        .option("output", { type: "string", description: "PNG output path" })
        .option("width", {
          type: "number",
          description: "Viewport width",
        })
        .option("height", {
          type: "number",
          description: "Viewport height",
        })
        .option("headed", { type: "boolean", default: false })
        .option("cdp", { type: "number" }),
  )
  .demandCommand(1)
  .help()
  .parse();

const command = (argv._[0] ?? "").toString();
try {
  if (command === "run") {
    await runCommand(argv as unknown as RunArgs);
  } else if (command === "validate") {
    await validateCommand(argv as unknown as ValidateArgs);
  } else if (command === "certify") {
    await certifyCommand(argv as unknown as RunArgs);
  } else if (command === "compare") {
    await compareCommand(argv as unknown as CompareArgs);
  } else if (command === "screenshot") {
    await screenshotCommand(argv as unknown as ScreenshotArgs);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}

async function runCommand(args: RunArgs): Promise<void> {
  const { flow, warnings } = await resolveFlow(args);
  const outputDir = resolve(args.output ?? defaultOutputDir(flow.name));
  const runner = new QARunner({
    outputDir,
    cdpPort: args.cdp,
    headed: args.headed,
  });
  if (args.session) flow.sessionMode = args.session;
  const report = await runner.runFlow(flow, warnings);
  await writeReportFiles(report, outputDir);
  printRunSummary(report, outputDir);
  setExitCodeForVerdict(report.verdict);
}

async function validateCommand(args: ValidateArgs): Promise<void> {
  const raw = await readFile(args.flow, "utf8");
  const { flow, warnings } = loadFlow(JSON.parse(raw) as unknown);
  console.log(JSON.stringify({ flow, warnings }, null, 2));
}

async function certifyCommand(args: RunArgs): Promise<void> {
  if (!args.flow) throw new Error("certify requires --flow");
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
    verdict: classifyCertificationVerdict(
      attempts.map((attempt) => attempt.verdict),
    ),
    attempts,
  };
  await writeCertificationFiles(certification, baseOutput);
  console.log(JSON.stringify(certification, null, 2));
  setExitCodeForVerdict(certification.verdict);
}

async function compareCommand(args: CompareArgs): Promise<void> {
  const outputDir = resolve(
    args.output ?? join("qa-reports", `compare-${nowIso().slice(0, 10)}`),
  );
  const result = await compareReports(
    resolve(args.baseline),
    resolve(args.candidate),
    outputDir,
  );
  console.log(JSON.stringify(result, null, 2));
}

async function screenshotCommand(args: ScreenshotArgs): Promise<void> {
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

async function resolveFlow(
  args: RunArgs,
): Promise<{ flow: QAFlow; warnings: string[] }> {
  if (args.flow) {
    const raw = await readFile(args.flow, "utf8");
    return loadFlow(JSON.parse(raw) as unknown);
  }
  if (!args.url) throw new Error("run requires either --flow or --url");
  return {
    flow: {
      formatVersion: 1,
      id: slugify(args.name ?? "quick-run"),
      name: args.name ?? "quick-run",
      startUrl: args.url,
      sessionMode: args.session ?? "reuse",
      viewports: [],
      steps: [],
      assertions: [],
      policies: DEFAULT_POLICIES,
    },
    warnings: [],
  };
}

function defaultOutputDir(name: string): string {
  return join("qa-reports", `${nowIso().slice(0, 10)}-${slugify(name)}`);
}

function printRunSummary(
  report: Awaited<ReturnType<QARunner["runFlow"]>>,
  outputDir: string,
): void {
  console.log(`Flow: ${report.flowName}`);
  console.log(`Verdict: ${report.verdict}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Runs: ${report.runs.length}`);
}

function setExitCodeForVerdict(verdict: Verdict): void {
  if (verdict === "pass" || verdict === "pass_with_warnings") return;
  process.exitCode = verdict === "inconclusive" ? 2 : 1;
}

function classifyCertificationVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.every((verdict) => verdict === "pass")) return "pass";
  if (
    verdicts.every((verdict) =>
      ["pass", "pass_with_warnings"].includes(verdict),
    )
  ) {
    return verdicts.includes("pass_with_warnings")
      ? "pass_with_warnings"
      : "pass";
  }
  if (verdicts.every((verdict) => verdict === "fail")) return "fail";
  return "inconclusive";
}

function buildSnapshotPath(screenshotPath: string): string {
  const extension = /\.[^.]+$/.exec(screenshotPath)?.[0] ?? "";
  return screenshotPath.replace(
    new RegExp(`${escapeRegExp(extension)}$`),
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
      (attempt) =>
        `- Attempt ${attempt.attempt}: ${attempt.verdict} (\`${attempt.reportPath.replaceAll("\\", "/")}\`)`,
    ),
    "",
  ].join("\n");
  await ensureParent(join(outputDir, "certify-report.md"));
  await writeFile(join(outputDir, "certify-report.md"), markdown, "utf8");
}
