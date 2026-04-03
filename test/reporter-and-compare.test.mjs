import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

const { compareReports, generateMarkdownReport, writeReportFiles } =
  await import("../dist/index.js");

function sampleReport(verdict = "pass") {
  return {
    flowId: "signup-smoke",
    flowName: "Signup Smoke",
    startedAt: "2026-04-02T00:00:00.000Z",
    finishedAt: "2026-04-02T00:00:05.000Z",
    durationMs: 5000,
    verdict,
    session: { mode: "fresh", name: "fresh-session" },
    warnings: [],
    artifactDir: "/tmp/qa",
    runs: [
      {
        viewport: { name: "desktop", width: 1440, height: 900 },
        verdict,
        startedAt: "2026-04-02T00:00:00.000Z",
        finishedAt: "2026-04-02T00:00:05.000Z",
        durationMs: 5000,
        assertionResults: [],
        policyResults: [],
        steps: [
          {
            index: 0,
            name: "initial load",
            kind: "checkpoint",
            verdict,
            durationMs: 100,
            assertions: [],
            notes: [],
            evidence: {
              actualUrl: "https://example.com",
              consoleEvents: [],
              networkEvents: [],
              pageErrors: [],
              accessibility: [],
              performance: {
                loadMs: 1000,
                domContentLoadedMs: 500,
                largestContentfulPaintMs: 700,
                slowRequests: [],
              },
              artifacts: {
                screenshotPath: "/tmp/qa/desktop-0.png",
                snapshotPath: "/tmp/qa/desktop-0.snapshot.json",
              },
              raw: {},
            },
          },
        ],
      },
    ],
  };
}

test("generateMarkdownReport renders viewport and policy sections", () => {
  const markdown = generateMarkdownReport(
    sampleReport("pass_with_warnings"),
    process.cwd(),
  );
  assert.match(markdown, /Viewport: desktop/i);
  assert.match(markdown, /\*\*Verdict:\*\* pass_with_warnings/i);
  assert.match(markdown, /Performance:/i);
  assert.match(markdown, /Snapshot:/i);
});

test("writeReportFiles emits structured accessibility and performance artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "mqm-"));

  await writeReportFiles(sampleReport("pass"), root);

  const [accessibility, performance] = await Promise.all([
    readFile(join(root, "accessibility.json"), "utf8"),
    readFile(join(root, "performance.json"), "utf8"),
  ]);

  assert.equal(JSON.parse(accessibility).length, 0);
  assert.equal(JSON.parse(performance).length, 1);
});

test("compareReports writes image and snapshot diff artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "mqm-"));
  const baselineDir = join(root, "baseline");
  const candidateDir = join(root, "candidate");
  const compareDir = join(root, "compare");
  const artifactsDir = join(root, "artifacts");
  const baselinePng = join(artifactsDir, "baseline.png");
  const candidatePng = join(artifactsDir, "candidate.png");
  const baselineSnapshot = join(artifactsDir, "baseline.snapshot.json");
  const candidateSnapshot = join(artifactsDir, "candidate.snapshot.json");

  await mkdir(artifactsDir, { recursive: true });
  await writePng(baselinePng, [255, 0, 0]);
  await writePng(candidatePng, [0, 0, 255]);
  await writeFile(
    baselineSnapshot,
    JSON.stringify({ page: "baseline", title: "Signup" }, null, 2),
    "utf8",
  );
  await writeFile(
    candidateSnapshot,
    JSON.stringify({ page: "candidate", title: "Signup" }, null, 2),
    "utf8",
  );
  await writeReportFiles(
    reportWithArtifacts("pass", baselinePng, baselineSnapshot),
    baselineDir,
  );
  await writeReportFiles(
    reportWithArtifacts("fail", candidatePng, candidateSnapshot),
    candidateDir,
  );

  const result = await compareReports(
    join(baselineDir, "qa-report.json"),
    join(candidateDir, "qa-report.json"),
    compareDir,
  );

  assert.equal(result.verdictChanged, true);
  assert.equal(result.artifacts[0].snapshotChanged, true);
  const markdown = await readFile(
    join(compareDir, "compare-report.md"),
    "utf8",
  );
  assert.match(markdown, /QA Compare Report/);
  assert.match(markdown, /snapshot changed/i);
});

function reportWithArtifacts(verdict, screenshotPath, snapshotPath) {
  const report = sampleReport(verdict);
  report.runs[0].steps[0].evidence.artifacts = { screenshotPath, snapshotPath };
  return report;
}

async function writePng(path, rgb) {
  const image = new PNG({ width: 1, height: 1 });
  image.data[0] = rgb[0];
  image.data[1] = rgb[1];
  image.data[2] = rgb[2];
  image.data[3] = 255;
  await writeFile(path, PNG.sync.write(image));
}
