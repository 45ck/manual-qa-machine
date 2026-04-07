import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { ensureParent } from "./utils.js";

export interface InitOptions {
  targetDir: string;
  baseUrl: string;
  force: boolean;
}

export async function initProject(options: InitOptions): Promise<string[]> {
  const created: string[] = [];

  const files: Array<{ path: string; content: string }> = [
    {
      path: join(options.targetDir, "mqm.config.json"),
      content: buildMqmConfig(options.baseUrl),
    },
    {
      path: join(options.targetDir, "playwright.config.ts"),
      content: PLAYWRIGHT_CONFIG,
    },
    {
      path: join(options.targetDir, "tests", "smoke", ".gitkeep"),
      content: "",
    },
    {
      path: join(options.targetDir, "tests", "regression", ".gitkeep"),
      content: "",
    },
    {
      path: join(options.targetDir, "tests", "auth.setup.ts"),
      content: AUTH_SETUP,
    },
    {
      path: join(options.targetDir, "qa", "flows", ".gitkeep"),
      content: "",
    },
    {
      path: join(options.targetDir, "qa", "reports", ".gitkeep"),
      content: "",
    },
    {
      path: join(options.targetDir, "qa", "evidence", ".gitkeep"),
      content: "",
    },
    {
      path: join(options.targetDir, "qa", "findings", ".gitkeep"),
      content: "",
    },
    {
      path: join(options.targetDir, ".claude", "agents", "qa-orchestrator.md"),
      content: AGENT_ORCHESTRATOR,
    },
    {
      path: join(options.targetDir, ".claude", "agents", "qa-explorer.md"),
      content: AGENT_EXPLORER,
    },
    {
      path: join(options.targetDir, ".claude", "agents", "qa-promoter.md"),
      content: AGENT_PROMOTER,
    },
    {
      path: join(options.targetDir, ".claude", "agents", "qa-healer.md"),
      content: AGENT_HEALER,
    },
  ];

  for (const file of files) {
    if (existsSync(file.path) && !options.force) {
      continue;
    }
    await ensureParent(file.path);
    await writeFile(file.path, file.content, "utf8");
    created.push(file.path);
  }

  return created;
}

function buildMqmConfig(baseUrl: string): string {
  const config = {
    baseUrl,
    auth: { strategy: "none" },
    viewports: [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 375, height: 812 },
    ],
    explore: {
      maxDepth: 20,
      timeoutMs: 300_000,
      maxInteractions: 100,
      scopePatterns: [] as string[],
      excludePatterns: [] as string[],
    },
    smoke: {
      routes: ["/", "/login", "/dashboard"],
    },
    promote: {
      stabilityRuns: 3,
      stabilityThreshold: 1.0,
      autoPromoteThreshold: 0.8,
    },
  };
  return JSON.stringify(config, null, 2) + "\n";
}

const PLAYWRIGHT_CONFIG = `import { defineConfig } from "@playwright/test";
import { readFileSync } from "fs";

const mqmConfig = JSON.parse(readFileSync("./mqm.config.json", "utf8"));

export default defineConfig({
  testDir: "./tests",
  baseURL: mqmConfig.baseUrl,
  projects: mqmConfig.viewports.map((vp: { name: string; width: number; height: number }) => ({
    name: vp.name,
    use: { viewport: { width: vp.width, height: vp.height } },
  })),
  reporter: [["html"], ["json", { outputFile: "qa/reports/playwright-results.json" }]],
  use: {
    screenshot: "on",
    trace: "on-first-retry",
  },
});
`;

const AUTH_SETUP = `import { test as setup } from "@playwright/test";

setup("authenticate", async ({ page }) => {
  // Configure authentication here if needed.
  // See: https://playwright.dev/docs/auth
});
`;

const AGENT_ORCHESTRATOR = `---
name: QA Orchestrator
description: Decides what QA action to take — explore, smoke, promote, or heal
tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# QA Orchestrator

You are the QA orchestrator. Your job is to decide what QA action to take based on the current state of the project.

## Decision Flow

1. Check if \`qa/findings/\` has unprocessed findings → run \`mqm promote\`
2. Check if Playwright tests are failing → run \`mqm heal\`
3. Check if there's been a recent explore run → if not, run \`mqm explore\`
4. Otherwise → run \`mqm smoke\`

## Commands

- \`mqm explore <baseUrl>\` — Run exploratory QA
- \`mqm smoke\` — Run Playwright smoke tests
- \`mqm promote <finding-id>\` — Promote a finding to a regression test
- \`mqm heal\` — Attempt to heal failing tests
- \`mqm report\` — Generate a summary report

## Guidelines

- Always check \`mqm.config.json\` for the base URL and configuration
- Review existing findings before starting new exploration
- Prefer promoting stable findings before exploring for new ones
- Never skip the stability check when promoting findings
`;

const AGENT_EXPLORER = `---
name: QA Explorer
description: Explores web applications to find bugs, accessibility issues, and broken flows
tools:
  - Bash
  - Read
  - Write
  - Glob
---

# QA Explorer

You are a QA explorer. Your job is to explore a web application and find issues.

## How to Explore

1. Read \`mqm.config.json\` for the base URL and explore settings
2. Run: \`mqm explore <baseUrl> --depth <maxDepth> --timeout <timeoutMs>\`
3. Review the exploratory report at \`qa/reports/explore-report.md\`
4. Verify findings are reasonable and assign proper severity

## What to Look For

- Console errors and uncaught exceptions
- Broken links and navigation dead ends
- Network failures (4xx, 5xx responses)
- Accessibility violations (missing alt text, labels, ARIA)
- Performance issues (slow page loads, large contentful paint)
- Forms that don't validate or submit properly
- Pages that crash or hang

## After Exploring

- Review each finding in \`qa/findings/\`
- Recommend which findings should be promoted to regression tests
- Flag any false positives for dismissal
`;

const AGENT_PROMOTER = `---
name: QA Promoter
description: Converts stable findings into Playwright tests or QAFlow files
tools:
  - Bash
  - Read
  - Write
  - Glob
---

# QA Promoter

You promote exploratory findings into permanent regression tests.

## Workflow

1. List available findings: \`ls qa/findings/\`
2. Review a finding: read its JSON file
3. Promote: \`mqm promote <finding-path> --target playwright --certify\`
4. Review the generated test and refine if needed
5. Move promoted tests to the appropriate directory

## Promotion Targets

- **playwright** (preferred): Generates a Playwright spec in \`tests/regression/\`
- **flow**: Generates a QAFlow JSON in \`qa/flows/\`

## Quality Checks

- Always use \`--certify\` to verify stability
- Review generated locators — prefer \`getByRole\` or \`getByLabel\` over text selectors
- Ensure assertions match the original finding
- Run the promoted test manually once to verify
`;

const AGENT_HEALER = `---
name: QA Healer
description: Inspects failing tests and proposes safe repairs
tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# QA Healer

You fix broken Playwright tests by inspecting failures and proposing targeted repairs.

## Workflow

1. Run \`npx playwright test --reporter=json\` to identify failures
2. For each failing test:
   a. Read the test source
   b. Read the trace/screenshot if available
   c. Identify the root cause (changed locator, changed text, changed URL, etc.)
   d. Propose a minimal fix
   e. Apply the fix
   f. Rerun the specific test to verify

## Rules

- Never blindly mutate tests — always understand WHY the test is failing
- Prefer updating locators over removing assertions
- If a feature was intentionally changed, update the test to match
- If a test is fundamentally broken, flag it for human review
- Always rerun after fixing to verify the repair works
- Keep a log of what was changed and why
`;
