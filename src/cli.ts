#!/usr/bin/env node

import { readFile } from "fs/promises";
import { join, resolve } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  certifyCommand,
  exploreCommand,
  initCommand,
  promoteCommand,
  reportCommand,
  screenshotCommand,
  smokeCommand,
} from "./cli-commands.js";
import type {
  CertifyArgs,
  ExploreArgs,
  InitArgs,
  PromoteArgs,
  ScreenshotArgs,
} from "./cli-commands.js";
import { compareReports } from "./compare.js";
import { writeReportFiles } from "./reporter.js";
import { QARunner } from "./runner.js";
import { loadFlow } from "./schema.js";
import type { QAFlow, Verdict } from "./types.js";
import { DEFAULT_POLICIES } from "./types.js";
import { nowIso, slugify } from "./utils.js";

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
        .option("width", { type: "number", description: "Viewport width" })
        .option("height", { type: "number", description: "Viewport height" })
        .option("headed", { type: "boolean", default: false })
        .option("cdp", { type: "number" }),
  )
  .command("init", "Scaffold QA harness into a repo", (builder) =>
    builder
      .option("base-url", {
        type: "string",
        default: "http://localhost:3000",
        description: "Base URL",
      })
      .option("force", {
        type: "boolean",
        default: false,
        description: "Overwrite existing files",
      }),
  )
  .command("explore", "Run exploratory QA on a URL", (builder) =>
    builder
      .option("url", {
        type: "string",
        demandOption: true,
        description: "Start URL to explore",
      })
      .option("objectives", {
        type: "string",
        description: "Exploration objectives",
      })
      .option("depth", {
        type: "number",
        default: 20,
        description: "Max unique pages",
      })
      .option("timeout", {
        type: "number",
        default: 300_000,
        description: "Timeout in ms",
      })
      .option("max-interactions", {
        type: "number",
        default: 100,
        description: "Max interactions",
      })
      .option("scope", { type: "string", description: "URL scope pattern" })
      .option("exclude", { type: "string", description: "URL exclude pattern" })
      .option("output", { type: "string", description: "Output directory" })
      .option("headed", { type: "boolean", default: false })
      .option("cdp", { type: "number" }),
  )
  .command("smoke", "Run Playwright smoke tests")
  .command("promote", "Promote an exploratory finding to a test", (builder) =>
    builder
      .option("finding", {
        type: "string",
        demandOption: true,
        description: "Path to finding JSON",
      })
      .option("target", {
        choices: ["flow", "playwright"] as const,
        description: "Promotion target",
      })
      .option("certify", {
        type: "boolean",
        default: false,
        description: "Run stability check",
      })
      .option("runs", {
        type: "number",
        default: 3,
        description: "Stability runs",
      })
      .option("threshold", {
        type: "number",
        default: 1.0,
        description: "Pass rate threshold",
      })
      .option("force", {
        type: "boolean",
        default: false,
        description: "Skip human gate",
      })
      .option("output", { type: "string", description: "Output directory" }),
  )
  .command("report", "Summarize latest findings and artifacts", (builder) =>
    builder.option("output", {
      type: "string",
      description: "Report directory",
    }),
  )
  .demandCommand(1)
  .help()
  .parse();

const command = (argv._[0] ?? "").toString();
try {
  if (command === "run") await runCommand(argv as unknown as RunArgs);
  else if (command === "validate")
    await validateCommand(argv as unknown as ValidateArgs);
  else if (command === "certify")
    await certifyCommand(
      argv as unknown as CertifyArgs,
      defaultOutputDir,
      setExitCodeForVerdict,
    );
  else if (command === "compare")
    await compareCommand(argv as unknown as CompareArgs);
  else if (command === "screenshot")
    await screenshotCommand(
      argv as unknown as ScreenshotArgs,
      defaultOutputDir,
    );
  else if (command === "init") await initCommand(argv as unknown as InitArgs);
  else if (command === "explore")
    await exploreCommand(
      argv as unknown as ExploreArgs,
      defaultOutputDir,
      setExitCodeForVerdict,
    );
  else if (command === "smoke") await smokeCommand();
  else if (command === "promote")
    await promoteCommand(argv as unknown as PromoteArgs, defaultOutputDir);
  else if (command === "report")
    await reportCommand(argv as unknown as { output?: string });
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
