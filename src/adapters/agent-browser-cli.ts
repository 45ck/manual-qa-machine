import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";

export const SLOW_REQUEST_THRESHOLD_MS = 1500;
export const AGENT_BROWSER_EXECUTABLE = resolveAgentBrowserExecutable();

export function buildSessionNameArgs(sessionName?: string): string[] {
  return sessionName ? ["--session-name", sessionName] : [];
}

export function encodeScript(script: string): string {
  return Buffer.from(script, "utf8").toString("base64");
}

export function formatExecFailure(errorArgs: string[], error: unknown): string {
  const parts = [`agent-browser ${errorArgs.join(" ")}`];
  if (error instanceof Error) {
    parts.push(error.message);
  }
  const stderr = readExecBuffer(error, "stderr");
  if (stderr) parts.push(stderr);
  return parts.join(": ");
}

function readExecBuffer(
  error: unknown,
  key: "stderr" | "stdout",
): string | undefined {
  if (!error || typeof error !== "object" || !(key in error)) return undefined;
  const value = (error as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveAgentBrowserExecutable(): string {
  if (process.env.AGENT_BROWSER_BIN) return process.env.AGENT_BROWSER_BIN;
  if (process.platform !== "win32") return "agent-browser";
  return resolveWindowsExecutable() ?? "agent-browser";
}

function resolveWindowsExecutable(): string | undefined {
  try {
    const shimPath = execFileSync("where.exe", ["agent-browser.cmd"], {
      encoding: "utf8",
      windowsHide: true,
    })
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.trim();
    if (!shimPath) return undefined;
    const executable = join(
      dirname(shimPath),
      "node_modules",
      "agent-browser",
      "bin",
      windowsBinaryName(),
    );
    return existsSync(executable) ? executable : undefined;
  } catch {
    return undefined;
  }
}

function windowsBinaryName(): string {
  return process.arch === "arm64"
    ? "agent-browser-win32-arm64.exe"
    : "agent-browser-win32-x64.exe";
}
