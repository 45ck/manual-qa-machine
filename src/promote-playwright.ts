import type { ExploratoryFinding, ReproStep } from "./explore-types.js";

export function findingToPlaywrightSpec(finding: ExploratoryFinding): string {
  const lines: string[] = [];
  const preambleListeners: string[] = [];
  const preambleDeclarations: string[] = [];
  const epilogueAssertions: string[] = [];

  buildCategoryInstrumentation(
    finding,
    preambleDeclarations,
    preambleListeners,
    epilogueAssertions,
  );

  lines.push(`import { test, expect } from "@playwright/test";`);
  lines.push(``);
  lines.push(`test(${JSON.stringify(finding.title)}, async ({ page }) => {`);
  lines.push(`  // Auto-generated from finding ${finding.id}`);
  lines.push(`  // Category: ${finding.category}`);
  lines.push(`  // Severity: ${finding.severity}`);
  lines.push(`  // Original URL: ${finding.url}`);
  lines.push(``);

  for (const decl of preambleDeclarations) {
    lines.push(`  ${decl}`);
  }
  if (preambleDeclarations.length > 0) {
    lines.push(``);
  }

  for (const listener of preambleListeners) {
    lines.push(`  ${listener}`);
  }
  if (preambleListeners.length > 0) {
    lines.push(``);
  }

  for (const step of finding.reproSteps) {
    const stepLines = reproStepToPlaywright(step);
    for (const sl of stepLines) {
      lines.push(`  ${sl}`);
    }
  }

  if (epilogueAssertions.length > 0) {
    lines.push(``);
    for (const assertion of epilogueAssertions) {
      lines.push(`  ${assertion}`);
    }
  }

  lines.push(`});`);
  lines.push(``);

  return lines.join("\n");
}

function buildCategoryInstrumentation(
  finding: ExploratoryFinding,
  declarations: string[],
  listeners: string[],
  assertions: string[],
): void {
  switch (finding.category) {
    case "console_error":
      declarations.push(`const errors: string[] = [];`);
      listeners.push(`page.on("console", (msg) => {`);
      listeners.push(`  if (msg.type() === "error") errors.push(msg.text());`);
      listeners.push(`});`);
      assertions.push(`expect(errors).toHaveLength(0);`);
      break;

    case "network_failure":
      declarations.push(`const failedRequests: string[] = [];`);
      listeners.push(`page.on("response", (response) => {`);
      listeners.push(
        `  if (response.status() >= 400) failedRequests.push(response.url());`,
      );
      listeners.push(`});`);
      assertions.push(`expect(failedRequests).toHaveLength(0);`);
      break;

    case "a11y_violation":
      assertions.push(`// TODO: Add @axe-core/playwright for a11y assertions`);
      break;

    case "page_error":
      declarations.push(`const pageErrors: string[] = [];`);
      listeners.push(`page.on("pageerror", (error) => {`);
      listeners.push(`  pageErrors.push(error.message);`);
      listeners.push(`});`);
      assertions.push(`expect(pageErrors).toHaveLength(0);`);
      break;
  }
}

const playwrightStepConverters: Record<
  ReproStep["actionKind"],
  (step: ReproStep) => string[]
> = {
  navigate: (step) => [
    `await page.goto(${JSON.stringify(step.target ?? "")});`,
  ],
  click: (step) => [
    `// Selector may need manual refinement for stability`,
    `await page.getByText(${JSON.stringify(step.target ?? "")}).click();`,
  ],
  type: (step) => [
    `await page.getByLabel(${JSON.stringify(step.target ?? "")}).fill(${JSON.stringify(step.value ?? "")});`,
  ],
  scroll: () => [`await page.mouse.wheel(0, 300);`],
  press: (step) => [
    `await page.keyboard.press(${JSON.stringify(step.value ?? "Enter")});`,
  ],
  back: () => [`await page.goBack();`],
  hover: (step) => [
    `await page.getByText(${JSON.stringify(step.target ?? "")}).hover();`,
  ],
};

function reproStepToPlaywright(step: ReproStep): string[] {
  return playwrightStepConverters[step.actionKind](step);
}
