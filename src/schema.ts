import { z } from "zod";
import type { QAFlow } from "./types.js";
import type { LegacyQAFlow, LoadedFlow } from "./legacy-types.js";
import { compileLegacyFlow } from "./legacy.js";
import { DEFAULT_POLICIES, DEFAULT_VIEWPORTS } from "./types.js";

const viewportSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const targetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("role"),
    role: z.string().min(1),
    name: z.string().min(1),
    exact: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("text"),
    text: z.string().min(1),
    exact: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("label"),
    text: z.string().min(1),
    exact: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("placeholder"),
    text: z.string().min(1),
    exact: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("css"),
    selector: z.string().min(1),
  }),
  z.object({
    kind: z.literal("ref"),
    ref: z.string().regex(/^@e\d+$/),
  }),
]);

const waitConditionSchema: z.ZodType = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("duration"),
    ms: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("url"),
    pattern: z.string().min(1),
  }),
  z.object({
    kind: z.literal("text"),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal("element"),
    target: targetSchema,
    state: z.enum(["visible", "hidden", "detached"]).optional(),
  }),
  z.object({
    kind: z.literal("function"),
    expression: z.string().min(1),
  }),
  z.object({
    kind: z.literal("load"),
    state: z.enum(["load", "domcontentloaded", "networkidle"]),
  }),
]);

const assertionSchema: z.ZodType = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("textPresent"),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal("urlContains"),
    value: z.string().min(1),
  }),
  z.object({
    kind: z.literal("elementVisible"),
    target: targetSchema,
  }),
  z.object({
    kind: z.literal("elementEnabled"),
    target: targetSchema,
  }),
  z.object({
    kind: z.literal("requestOccurred"),
    urlContains: z.string().min(1),
    method: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("noCriticalA11yViolations"),
  }),
  z.object({
    kind: z.literal("visualDiffBelow"),
    baselinePath: z.string().min(1),
    threshold: z.number().min(0).max(1),
  }),
]);

const stepSchema: z.ZodType = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("navigate"),
    url: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("click"),
    target: targetSchema,
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("type"),
    target: targetSchema,
    value: z.string(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("select"),
    target: targetSchema,
    value: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("press"),
    key: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("scroll"),
    direction: z.enum(["up", "down", "left", "right"]),
    pixels: z.number().int().positive().optional(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("waitFor"),
    condition: waitConditionSchema,
    timeoutMs: z.number().int().positive().optional(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("assert"),
    assertion: assertionSchema,
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("snapshot"),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("screenshot"),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("eval"),
    script: z.string().min(1),
    expectContains: z.string().optional(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("checkpoint"),
    name: z.string().min(1),
  }),
]);

const policySchema = z.object({
  consoleErrors: z
    .object({
      max: z.number().int().nonnegative(),
      allowMessages: z.array(z.string()).default([]),
    })
    .default(DEFAULT_POLICIES.consoleErrors),
  networkFailures: z
    .object({
      max: z.number().int().nonnegative(),
      allowUrls: z.array(z.string()).default([]),
    })
    .default(DEFAULT_POLICIES.networkFailures),
  pageErrors: z
    .object({
      max: z.number().int().nonnegative(),
      allowMessages: z.array(z.string()).default([]),
    })
    .default(DEFAULT_POLICIES.pageErrors),
  performance: z
    .object({
      maxPageLoadMs: z.number().positive().optional(),
      maxDomContentLoadedMs: z.number().positive().optional(),
      maxLargestContentfulPaintMs: z.number().positive().optional(),
    })
    .default(DEFAULT_POLICIES.performance),
  accessibility: z
    .object({
      maxCritical: z.number().int().nonnegative(),
    })
    .default(DEFAULT_POLICIES.accessibility),
});

const canonicalFlowSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  startUrl: z.string().min(1),
  sessionMode: z.enum(["fresh", "reuse"]).default("reuse"),
  sessionName: z.string().min(1).optional(),
  viewports: z.array(viewportSchema).default(DEFAULT_VIEWPORTS),
  steps: z.array(stepSchema).default([]),
  assertions: z.array(assertionSchema).default([]),
  policies: policySchema.default(DEFAULT_POLICIES),
});

const legacyStepSchema = z.object({
  action: z.enum([
    "navigate",
    "click",
    "type",
    "scroll",
    "wait",
    "assert",
    "eval",
  ]),
  target: z.string().optional(),
  value: z.string().optional(),
  wait: z.number().int().nonnegative().optional(),
  screenshot: z.boolean().optional(),
  description: z.string().optional(),
});

const legacyFlowSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  steps: z.array(legacyStepSchema).default([]),
  viewports: z.array(viewportSchema).optional(),
});

function parseCanonicalFlow(input: unknown): QAFlow {
  return canonicalFlowSchema.parse(input) as QAFlow;
}

function parseLegacyFlow(input: unknown): LegacyQAFlow {
  return legacyFlowSchema.parse(input) as LegacyQAFlow;
}

function looksCanonical(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  return "formatVersion" in input || "startUrl" in input;
}

export function loadFlow(input: unknown): LoadedFlow {
  if (looksCanonical(input)) {
    return { flow: parseCanonicalFlow(input), warnings: [] };
  }
  const legacyFlow = parseLegacyFlow(input);
  return compileLegacyFlow(legacyFlow);
}

export function validateFlow(input: unknown): QAFlow {
  return loadFlow(input).flow;
}
