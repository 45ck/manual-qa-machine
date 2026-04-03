import type { QATarget } from "../types.js";

export function buildFindArgs(
  target: Exclude<QATarget, { kind: "css" | "ref" }>,
  action: "click" | "fill",
  value?: string,
): string[] {
  const actionArgs = action === "fill" ? [action, value ?? ""] : [action];
  if (target.kind === "text") {
    return [
      "find",
      "text",
      target.text,
      ...actionArgs,
      ...(target.exact ? ["--exact"] : []),
    ];
  }
  if (target.kind === "label") {
    return [
      "find",
      "label",
      target.text,
      ...actionArgs,
      ...(target.exact ? ["--exact"] : []),
    ];
  }
  if (target.kind === "placeholder") {
    return [
      "find",
      "placeholder",
      target.text,
      ...actionArgs,
      ...(target.exact ? ["--exact"] : []),
    ];
  }
  return [
    "find",
    "role",
    target.role,
    ...actionArgs,
    "--name",
    target.name,
    ...(target.exact ? ["--exact"] : []),
  ];
}

export function normalizeEvalPayload(raw: string): string {
  return raw.trim().replace(/^"|"$/g, "").replace(/\\"/g, '"');
}
