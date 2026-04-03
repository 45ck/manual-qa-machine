import type { Viewport } from "./types.js";
import type { QAFlow } from "./types.js";

export interface LegacyQAStep {
  action: "navigate" | "click" | "type" | "scroll" | "wait" | "assert" | "eval";
  target?: string;
  value?: string;
  wait?: number;
  screenshot?: boolean;
  description?: string;
}

export interface LegacyQAFlow {
  name: string;
  url: string;
  steps: LegacyQAStep[];
  viewports?: Viewport[];
}

export interface LoadedFlow {
  flow: QAFlow;
  warnings: string[];
}
