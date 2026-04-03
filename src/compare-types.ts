import type { Verdict } from "./types.js";

export interface CompareArtifact {
  viewport: string;
  stepIndex: number;
  baselineImage?: string;
  candidateImage?: string;
  diffImage?: string;
  mismatchRatio?: number;
  baselineSnapshot?: string;
  candidateSnapshot?: string;
  snapshotChanged?: boolean;
  snapshotDiffPath?: string;
}

export interface CompareResult {
  baselineReport: string;
  candidateReport: string;
  verdictChanged: boolean;
  baselineVerdict: Verdict;
  candidateVerdict: Verdict;
  baselineWarnings: string[];
  candidateWarnings: string[];
  artifacts: CompareArtifact[];
}
