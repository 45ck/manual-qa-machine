import type { QAAssertion, QAStep, QATarget } from "./types.js";
import type { QAFlow } from "./types.js";
import type { LegacyQAFlow, LegacyQAStep, LoadedFlow } from "./legacy-types.js";
import { DEFAULT_POLICIES, DEFAULT_VIEWPORTS } from "./types.js";
import { slugify } from "./utils.js";

function targetFromString(value: string, preferText = false): QATarget {
  if (/^@e\d+$/.test(value)) return { kind: "ref", ref: value };
  if (!preferText && looksLikeCssSelector(value)) {
    return { kind: "css", selector: value };
  }
  return { kind: "text", text: value };
}

function looksLikeCssSelector(value: string): boolean {
  return /^[#.[]/.test(value) || value.includes(">") || value.includes(":");
}

function compileLegacyStep(step: LegacyQAStep, warnings: string[]): QAStep {
  const handlers: Record<LegacyQAStep["action"], () => QAStep> = {
    navigate: () => ({
      kind: "navigate",
      name: step.description,
      url: step.target ?? "",
    }),
    click: () => ({
      kind: "click",
      name: step.description,
      target: targetFromString(step.target ?? "", false),
    }),
    type: () => ({
      kind: "type",
      name: step.description,
      target: targetFromString(step.target ?? "", false),
      value: step.value ?? "",
    }),
    scroll: () => ({
      kind: "scroll",
      name: step.description,
      direction: normalizeDirection(step.target),
    }),
    wait: () => ({
      kind: "waitFor",
      name: step.description,
      condition: {
        kind: "duration",
        ms: step.wait ?? normalizeWait(step.target),
      },
    }),
    assert: () => ({
      kind: "assert",
      name: step.description,
      assertion: { kind: "textPresent", text: step.target ?? "" },
    }),
    eval: () => ({
      kind: "eval",
      name: step.description,
      script: step.target ?? "",
      expectContains: step.value,
    }),
  };
  const handler = handlers[step.action];
  if (handler) return handler();
  warnings.push(`Ignored unknown legacy action: ${String(step.action)}`);
  return { kind: "checkpoint", name: step.description ?? "legacy-step" };
}

function normalizeDirection(value?: string): "up" | "down" | "left" | "right" {
  if (value === "up" || value === "left" || value === "right") return value;
  return "down";
}

function normalizeWait(value?: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

function extractFlowAssertions(flow: LegacyQAFlow): QAAssertion[] {
  return flow.steps
    .filter(
      (step) => step.action === "assert" && typeof step.target === "string",
    )
    .map((step) => ({
      kind: "textPresent" as const,
      text: step.target!,
    }));
}

function collectWarnings(flow: LegacyQAFlow): string[] {
  const warnings: string[] = [];
  for (const step of flow.steps) {
    if (step.screenshot === false) {
      warnings.push(
        `Legacy step "${step.description ?? step.action}" disabled screenshots; canonical runs always capture evidence.`,
      );
    }
  }
  warnings.push(
    "Loaded a legacy flow and compiled it into the canonical QAFlow model.",
  );
  return warnings;
}

export function compileLegacyFlow(input: LegacyQAFlow): LoadedFlow {
  const warnings = collectWarnings(input);
  const steps = input.steps.map((step) => compileLegacyStep(step, warnings));
  const flow: QAFlow = {
    formatVersion: 1,
    id: slugify(input.name),
    name: input.name,
    startUrl: input.url,
    sessionMode: "reuse",
    viewports: input.viewports ?? DEFAULT_VIEWPORTS,
    steps,
    assertions: extractFlowAssertions(input),
    policies: DEFAULT_POLICIES,
  };
  return { flow, warnings };
}
