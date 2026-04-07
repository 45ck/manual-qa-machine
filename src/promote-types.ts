import type { Verdict } from "./types.js";

export type PromotionTarget = "flow" | "playwright";
export type PromotionStatus =
  | "promoted"
  | "unstable"
  | "rejected"
  | "needs_review";

export interface PromotionDecision {
  gate: "auto" | "human";
  reason: string;
  suggestedTarget: PromotionTarget;
  confidence: number;
}

export interface StabilityResult {
  totalRuns: number;
  passCount: number;
  passRate: number;
  stable: boolean;
  stabilityThreshold: number;
  runs: { attempt: number; verdict: Verdict; reportPath?: string }[];
}

export interface PromotionResult {
  findingId: string;
  target: PromotionTarget;
  status: PromotionStatus;
  outputPath: string;
  stability?: StabilityResult;
  decision: PromotionDecision;
  promotedAt: string;
}

export interface PromoteOptions {
  findingPath: string;
  target?: PromotionTarget;
  certify: boolean;
  runs: number;
  threshold: number;
  force: boolean;
  outputDir: string;
}
