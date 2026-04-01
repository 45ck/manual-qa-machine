#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { QARunner } from './runner.js';
import { writeReport } from './reporter.js';
import type { QAFlow, QAStep } from './types.js';

const argv = await yargs(hideBin(process.argv))
  .scriptName('mqm')
  .usage('$0 <command> [options]')
  .command('run', 'Run a QA flow', (yargs) =>
    yargs
      .option('url', {
        alias: 'u',
        type: 'string',
        description: 'URL to test',
      })
      .option('flow', {
        alias: 'f',
        type: 'string',
        description: 'Path to a .qa.yml or .qa.json flow file',
      })
      .option('name', {
        alias: 'n',
        type: 'string',
        description: 'Name for this QA run',
        default: 'qa-run',
      })
      .option('chrome-url', {
        type: 'string',
        description: 'Chrome remote debugging URL',
        default: 'http://localhost:9222',
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        description: 'Output directory for report and screenshots',
      })
      .option('delay', {
        alias: 'd',
        type: 'number',
        description: 'Delay between steps in ms',
        default: 1000,
      })
  )
  .command('screenshot', 'Take a single screenshot of a URL', (yargs) =>
    yargs
      .option('url', {
        alias: 'u',
        type: 'string',
        description: 'URL to screenshot',
        demandOption: true,
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        description: 'Output file path',
        default: 'screenshot.png',
      })
      .option('chrome-url', {
        type: 'string',
        description: 'Chrome remote debugging URL',
        default: 'http://localhost:9222',
      })
  )
  .demandCommand(1, 'Specify a command: run or screenshot')
  .help()
  .version()
  .parse();

const command = (argv as any)._[0];

if (command === 'run') {
  await runCommand(argv as any);
} else if (command === 'screenshot') {
  await screenshotCommand(argv as any);
}

async function runCommand(args: {
  url?: string;
  flow?: string;
  name: string;
  chromeUrl: string;
  output?: string;
  delay: number;
}) {
  let flow: QAFlow;

  if (args.flow) {
    // Load flow from file
    const content = await readFile(args.flow, 'utf-8');
    if (args.flow.endsWith('.json')) {
      flow = JSON.parse(content);
    } else {
      // Basic YAML parsing for simple flows (avoid adding a yaml dep)
      console.error(
        'YAML flow files require the yaml package. Use JSON format or pipe through a YAML-to-JSON converter.'
      );
      process.exit(1);
    }
  } else if (args.url) {
    // Simple URL-only run — just navigate and screenshot
    flow = {
      name: args.name,
      url: args.url,
      steps: [
        {
          action: 'navigate',
          target: args.url,
          screenshot: true,
          description: `Navigate to ${args.url}`,
        },
      ],
    };
  } else {
    console.error('Provide either --url or --flow');
    process.exit(1);
  }

  const date = new Date().toISOString().slice(0, 10);
  const slug = flow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const outputDir = args.output ?? join('qa-reports', `${date}-${slug}`);

  console.log(`Running QA flow: ${flow.name}`);
  console.log(`URL: ${flow.url}`);
  console.log(`Steps: ${flow.steps.length}`);
  console.log(`Output: ${outputDir}`);
  console.log('');

  const runner = new QARunner({
    chromeUrl: args.chromeUrl,
    outputDir,
    stepDelay: args.delay,
  });

  try {
    await runner.connect();
    console.log('Connected to Chrome');

    const report = await runner.runFlow(flow);
    const reportPath = await writeReport(report, outputDir);

    console.log('');
    console.log(`Result: ${report.result.toUpperCase()}`);
    console.log(`Steps: ${report.steps.length}`);
    console.log(
      `Errors: ${report.consoleErrors.length} console, ${report.networkErrors.length} network`
    );
    console.log(`Report: ${reportPath}`);
    console.log(`Duration: ${(report.duration / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    console.error('');
    console.error('Make sure Chrome is running with --remote-debugging-port=9222');
    process.exit(1);
  } finally {
    await runner.disconnect();
  }
}

async function screenshotCommand(args: {
  url: string;
  output: string;
  chromeUrl: string;
}) {
  const runner = new QARunner({
    chromeUrl: args.chromeUrl,
    outputDir: '.',
    stepDelay: 0,
  });

  try {
    await runner.connect();
    const flow: QAFlow = {
      name: 'screenshot',
      url: args.url,
      steps: [],
    };
    await runner.runFlow(flow);
    console.log(`Screenshot saved: ${args.output}`);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  } finally {
    await runner.disconnect();
  }
}
