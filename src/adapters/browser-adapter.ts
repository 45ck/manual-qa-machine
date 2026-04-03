import type {
  AssertionResult,
  QAAssertion,
  QAStep,
  StepEvidence,
  Viewport,
} from "../types.js";

export interface PrepareSessionOptions {
  startUrl: string;
  viewport: Viewport;
}

export interface EvidenceCapturePaths {
  screenshotPath: string;
  snapshotPath: string;
}

export interface BrowserAdapter {
  verify(): Promise<void>;
  prepareSession(options: PrepareSessionOptions): Promise<void>;
  runStep(step: QAStep): Promise<void>;
  captureEvidence(paths: EvidenceCapturePaths): Promise<StepEvidence>;
  evaluateAssertion(
    assertion: QAAssertion,
    evidence: StepEvidence,
    outputDir: string,
    stepKey: string,
  ): Promise<AssertionResult>;
  finalize(): Promise<void>;
}

export interface BrowserAdapterOptions {
  cdpPort?: number;
  headed?: boolean;
  sessionId: string;
  sessionName?: string;
}
