import { mkdir, writeFile } from "fs/promises";
import { join, relative } from "path";
import type { ExploratoryFinding, ExploratoryReport } from "./explore-types.js";
import { writeJsonFile } from "./utils.js";

function relativePath(from: string, target?: string): string | undefined {
  if (!target) return undefined;
  return relative(from, target).replaceAll("\\", "/");
}

function severityOrder(severity: string): number {
  switch (severity) {
    case "critical":
      return 0;
    case "major":
      return 1;
    case "minor":
      return 2;
    case "info":
      return 3;
    default:
      return 4;
  }
}

function groupFindingsBySeverity(
  findings: ExploratoryFinding[],
): Map<string, ExploratoryFinding[]> {
  const groups = new Map<string, ExploratoryFinding[]>();
  const sorted = [...findings].sort(
    (a, b) => severityOrder(a.severity) - severityOrder(b.severity),
  );
  for (const finding of sorted) {
    const existing = groups.get(finding.severity);
    if (existing) {
      existing.push(finding);
    } else {
      groups.set(finding.severity, [finding]);
    }
  }
  return groups;
}

function findingMarkdown(
  finding: ExploratoryFinding,
  reportDir: string,
): string[] {
  const lines: string[] = [];
  lines.push(`#### ${finding.title}`);
  lines.push("");
  lines.push(`- **ID:** ${finding.id}`);
  lines.push(`- **Category:** ${finding.category}`);
  lines.push(`- **Severity:** ${finding.severity}`);
  lines.push(`- **URL:** ${finding.url}`);
  lines.push(`- **Confidence:** ${(finding.confidence * 100).toFixed(0)}%`);

  const screenshot = relativePath(reportDir, finding.evidence.screenshotPath);
  if (screenshot) {
    lines.push(`- **Screenshot:** ![Finding](${screenshot})`);
  }

  if (finding.reproSteps.length > 0) {
    lines.push("");
    lines.push("**Reproduction Steps:**");
    lines.push("");
    for (const step of finding.reproSteps) {
      lines.push(
        `${step.index + 1}. ${step.instruction} (\`${step.actionKind}\`${step.target ? ` on \`${step.target}\`` : ""})`,
      );
    }
  }

  lines.push("");
  return lines;
}

export function generateExploreMarkdown(
  report: ExploratoryReport,
  reportDir: string,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Exploratory QA Report`);
  lines.push("");
  lines.push(`**Report ID:** ${report.id}`);
  lines.push(`**URL:** ${report.startUrl}`);
  lines.push(`**Started:** ${report.startedAt}`);
  lines.push(`**Finished:** ${report.finishedAt}`);
  lines.push(`**Duration:** ${(report.durationMs / 1000).toFixed(1)}s`);
  lines.push(`**Verdict:** ${report.verdict}`);
  lines.push("");

  // Coverage section
  lines.push("## Coverage");
  lines.push("");
  lines.push(`- **Pages visited:** ${report.coverage.pagesVisited}`);
  lines.push(
    `- **Interactions conducted:** ${report.coverage.interactionsConducted}`,
  );
  lines.push(
    `- **Coverage plateau:** ${report.coverage.coveragePlateau ? "yes" : "no"}`,
  );
  lines.push(`- **Unvisited links:** ${report.coverage.unvisitedLinks.length}`);
  lines.push("");

  if (report.coverage.uniqueUrls.length > 0) {
    lines.push("### Pages Visited");
    lines.push("");
    for (const url of report.coverage.uniqueUrls) {
      lines.push(`- ${url}`);
    }
    lines.push("");
  }

  // Findings section
  lines.push("## Findings");
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("No findings detected.");
    lines.push("");
  } else {
    lines.push(`**Total findings:** ${report.findings.length}`);
    lines.push("");

    const grouped = groupFindingsBySeverity(report.findings);
    for (const [severity, findings] of grouped) {
      lines.push(
        `### ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${findings.length})`,
      );
      lines.push("");
      for (const finding of findings) {
        lines.push(...findingMarkdown(finding, reportDir));
      }
    }
  }

  // Verdict
  lines.push("## Verdict");
  lines.push("");
  lines.push(`**${report.verdict}**`);
  lines.push("");

  return lines.join("\n");
}

export async function writeExploreReportFiles(
  report: ExploratoryReport,
  outputDir: string,
): Promise<void> {
  const reportDir = join(outputDir);

  // Write full report JSON
  await writeJsonFile(join(reportDir, "explore-report.json"), report);

  // Write markdown summary
  await writeFile(
    join(reportDir, "explore-report.md"),
    generateExploreMarkdown(report, reportDir),
    "utf8",
  );

  // Write individual finding files
  if (report.findings.length > 0) {
    const findingsDir = join(reportDir, "findings");
    await mkdir(findingsDir, { recursive: true });

    const findingIndex: Record<string, string> = {};
    for (const finding of report.findings) {
      const filePath = join(findingsDir, `${finding.id}.json`);
      await writeJsonFile(filePath, finding);
      findingIndex[finding.id] = relative(reportDir, filePath).replaceAll(
        "\\",
        "/",
      );
    }

    // Write findings index
    await writeJsonFile(join(findingsDir, "index.json"), findingIndex);
  }
}
