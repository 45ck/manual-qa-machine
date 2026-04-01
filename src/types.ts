export interface QAStep {
  action: "navigate" | "click" | "type" | "scroll" | "wait" | "assert";
  /** URL for navigate, selector for click/type/scroll, text for assert */
  target?: string;
  /** Value for type action */
  value?: string;
  /** Wait time in ms after action */
  wait?: number;
  /** Take screenshot after this step */
  screenshot?: boolean;
  /** Human-readable description */
  description?: string;
}

export interface QAFlow {
  name: string;
  url: string;
  steps: QAStep[];
  /** Viewport sizes to test at */
  viewports?: Viewport[];
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export interface StepResult {
  stepNumber: number;
  action: string;
  description: string;
  url: string;
  status: "pass" | "fail" | "warning";
  screenshotPath?: string;
  consoleErrors: ConsoleEntry[];
  networkErrors: NetworkEntry[];
  observations: string[];
  duration: number;
}

export interface ConsoleEntry {
  level: "error" | "warning" | "info" | "log";
  message: string;
  source?: string;
  step: number;
}

export interface NetworkEntry {
  status: number;
  method: string;
  url: string;
  step: number;
}

export interface QAReport {
  flowName: string;
  baseUrl: string;
  date: string;
  steps: StepResult[];
  consoleErrors: ConsoleEntry[];
  networkErrors: NetworkEntry[];
  duration: number;
  result: "pass" | "fail" | "issues";
}

export const DEFAULT_VIEWPORTS: Viewport[] = [
  { name: "Desktop", width: 1920, height: 1080 },
  { name: "Tablet", width: 768, height: 1024 },
  { name: "Mobile", width: 375, height: 667 },
];
