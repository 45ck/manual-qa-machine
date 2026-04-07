import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { ExploratoryFinding } from "./explore-types.js";
import type { PromoteOptions, PromotionResult } from "./promote-types.js";
import { decidePromotion } from "./promote-decision.js";
import { findingToFlow } from "./promote-flow.js";
import { findingToPlaywrightSpec } from "./promote-playwright.js";
import {
  checkFlowStability,
  checkPlaywrightStability,
} from "./promote-stability.js";
import { ensureParent, nowIso, slugify, writeJsonFile } from "./utils.js";

export async function promoteFinding(
  options: PromoteOptions,
): Promise<PromotionResult> {
  const raw = await readFile(options.findingPath, "utf8");
  const finding = JSON.parse(raw) as ExploratoryFinding;
  const decision = decidePromotion(finding);

  if (decision.gate === "human" && !options.force) {
    return {
      findingId: finding.id,
      target: options.target ?? decision.suggestedTarget,
      status: "needs_review",
      outputPath: options.outputDir,
      decision,
      promotedAt: nowIso(),
    };
  }

  const target = options.target ?? decision.suggestedTarget;
  const slug = slugify(finding.id);
  const { outputPath, stability } =
    target === "flow"
      ? await promoteAsFlow(finding, slug, options)
      : await promoteAsPlaywright(finding, slug, options);

  const status: PromotionResult["status"] =
    !stability || stability.stable || stability.passRate >= options.threshold
      ? "promoted"
      : "unstable";

  const result: PromotionResult = {
    findingId: finding.id,
    target,
    status,
    outputPath,
    stability,
    decision,
    promotedAt: nowIso(),
  };

  const resultPath = join(options.outputDir, `${slug}.promotion.json`);
  await writeJsonFile(resultPath, result);

  return result;
}

async function promoteAsFlow(
  finding: ExploratoryFinding,
  slug: string,
  options: PromoteOptions,
): Promise<{ outputPath: string; stability?: PromotionResult["stability"] }> {
  const flow = findingToFlow(finding);
  const outputPath = join(options.outputDir, `${slug}.qa.json`);
  await writeJsonFile(outputPath, flow);

  let stability: PromotionResult["stability"];
  if (options.certify) {
    stability = await checkFlowStability({
      flow,
      runs: options.runs,
      threshold: options.threshold,
      outputDir: options.outputDir,
    });
  }

  return { outputPath, stability };
}

async function promoteAsPlaywright(
  finding: ExploratoryFinding,
  slug: string,
  options: PromoteOptions,
): Promise<{ outputPath: string; stability?: PromotionResult["stability"] }> {
  const spec = findingToPlaywrightSpec(finding);
  const outputPath = join(options.outputDir, `${slug}.spec.ts`);
  await ensureParent(outputPath);
  await writeFile(outputPath, spec, "utf8");

  let stability: PromotionResult["stability"];
  if (options.certify) {
    stability = await checkPlaywrightStability(
      outputPath,
      options.runs,
      options.threshold,
    );
  }

  return { outputPath, stability };
}
