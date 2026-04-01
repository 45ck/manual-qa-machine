#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readFile } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { QARunner } from "./runner.js";
import { writeReport } from "./reporter.js";
import type { QAFlow } from "./types.js";

const exec = promisify(execFile);

async function checkAgentBrowser(): Promise<void> {
  try {
    await exec("agent-browser", ["--version"]);
  } catch {
    console.error("agent-browser not found. Install it:");
    console.error("  npm install -g @anthropic-ai/agent-browser");
    console.error("  # or: cargo install agent-browser");
    process.exit(1);
  }
}

const argv = await yargs(hideBin(process.argv))
  .scriptName("mqm")
  .usage("$0 <command> [options]")
  .command("run", "Run a QA flow", (y) =>
    y
      .option("url", {
        alias: "u",
        type: "string",
        description: "URL to test",
      })
      .option("flow", {
        alias: "f",
        type: "string",
        description: "Path to a .qa.json flow file",
      })
      .option("name", {
        alias: "n",
        type: "string",
        description: "Name for this QA run",
        default: "qa-run",
      })
      .option("output", {
        alias: "o",
        type: "string",
        description: "Output directory for report",
      })
      .option("delay", {
        alias: "d",
        type: "number",
        description: "Delay between steps in ms",
        default: 1000,
      }),
  )
  .command("screenshot", "Take a screenshot of a URL", (y) =>
    y
      .option("url", {
        alias: "u",
        type: "string",
        description: "URL to screenshot",
        demandOption: true,
      })
      .option("output", {
        alias: "o",
        type: "string",
        description: "Output file path",
        default: "screenshot.png",
      }),
  )
  .demandCommand(1, "Specify a command: run or screenshot")
  .help()
  .version()
  .parse();

const command = (argv as Record<string, unknown>)._ as string[];

if (command[0] === "run") {
  await runCommand(argv as unknown as RunArgs);
} else if (command[0] === "screenshot") {
  await screenshotCommand(argv as unknown as ScreenshotArgs);
}

interface RunArgs {
  url?: string;
  flow?: string;
  name: string;
  output?: string;
  delay: number;
}

interface ScreenshotArgs {
  url: string;
  output: string;
}

async function runCommand(args: RunArgs): Promise<void> {
  await checkAgentBrowser();

  let flow: QAFlow;

  if (args.flow) {
    const content = await readFile(args.flow, "utf-8");
    flow = JSON.parse(content) as QAFlow;
  } else if (args.url) {
    flow = {
      name: args.name,
      url: args.url,
      steps: [
        {
          action: "navigate",
          target: args.url,
          screenshot: true,
          description: `Navigate to ${args.url}`,
        },
      ],
    };
  } else {
    console.error("Provide either --url or --flow");
    process.exit(1);
  }

  const date = new Date().toISOString().slice(0, 10);
  const slug = flow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const outputDir = args.output ?? join("qa-reports", `${date}-${slug}`);

  console.log(`Running QA flow: ${flow.name}`);
  console.log(`URL: ${flow.url}`);
  console.log(`Steps: ${flow.steps.length}`);
  console.log(`Output: ${outputDir}`);
  console.log("");

  const runner = new QARunner({
    outputDir,
    stepDelay: args.delay,
  });

  try {
    await runner.connect();
    console.log("agent-browser ready");

    const report = await runner.runFlow(flow);
    const reportPath = await writeReport(report, outputDir);

    console.log("");
    console.log(`Result: ${report.result.toUpperCase()}`);
    console.log(`Steps: ${report.steps.length}`);
    console.log(
      `Errors: ${report.consoleErrors.length} console, ${report.networkErrors.length} network`,
    );
    console.log(`Report: ${reportPath}`);
    console.log(`Duration: ${(report.duration / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    console.error("");
    console.error("Make sure agent-browser is installed and accessible");
    process.exit(1);
  } finally {
    await runner.disconnect();
  }
}

async function screenshotCommand(args: ScreenshotArgs): Promise<void> {
  await checkAgentBrowser();

  try {
    await exec("agent-browser", ["open", args.url]);
    // Wait for page load
    await new Promise((r) => setTimeout(r, 2000));
    await exec("agent-browser", ["screenshot", args.output]);
    console.log(`Screenshot saved: ${args.output}`);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
