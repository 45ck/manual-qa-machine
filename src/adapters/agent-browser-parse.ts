import type {
  AccessibilityIssue,
  ConsoleEvent,
  NetworkEvent,
  PageError,
  PerformanceSnapshot,
} from "../types.js";
import { asArray, parseJson } from "../utils.js";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pullList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of [
    "items",
    "entries",
    "logs",
    "requests",
    "errors",
    "data",
    "result",
  ]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readString(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function readNumber(record: JsonRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

function readDuration(record: JsonRecord): number | undefined {
  const direct = readNumber(
    record,
    "durationMs",
    "duration",
    "elapsedMs",
    "responseTime",
  );
  if (direct !== undefined) return direct;
  const timing = record["timing"];
  if (!isRecord(timing)) return undefined;
  return readNumber(timing, "durationMs", "duration", "elapsedMs");
}

export function parseCommandPayload(raw: string): unknown {
  return parseJson<unknown>(raw) ?? raw.trim();
}

export function parseConsoleEvents(raw: string): ConsoleEvent[] {
  const payload = parseCommandPayload(raw);
  return pullList(payload)
    .filter(isRecord)
    .map((entry) => ({
      level: readString(entry, "level", "type") ?? "info",
      message: readString(entry, "message", "text", "value") ?? "",
      location: readString(entry, "location", "source", "url"),
    }))
    .filter((entry) => entry.message.length > 0);
}

export function parseNetworkEvents(raw: string): NetworkEvent[] {
  const payload = parseCommandPayload(raw);
  return pullList(payload)
    .filter(isRecord)
    .map((entry) => {
      const status = readNumber(entry, "status", "statusCode");
      const ok = typeof status === "number" ? status < 400 : Boolean(entry.ok);
      return {
        url: readString(entry, "url", "requestUrl") ?? "",
        method: readString(entry, "method") ?? "GET",
        status,
        ok,
        resourceType: readString(entry, "resourceType", "type"),
        durationMs: readDuration(entry),
      };
    })
    .filter((entry) => entry.url.length > 0);
}

export function parsePageErrors(raw: string): PageError[] {
  const payload = parseCommandPayload(raw);
  return pullList(payload)
    .filter(isRecord)
    .map((entry) => ({
      message: readString(entry, "message", "text", "value") ?? "",
      stack: readString(entry, "stack"),
    }))
    .filter((entry) => entry.message.length > 0);
}

export function parseScalar(raw: string): string {
  const payload = parseCommandPayload(raw);
  if (typeof payload === "string") return payload;
  if (isRecord(payload)) {
    return (
      readString(payload, "value", "url", "text", "result") ??
      JSON.stringify(payload)
    );
  }
  return String(payload);
}

export function parseBoolean(raw: string): boolean {
  const scalar = parseScalar(raw).toLowerCase();
  return scalar === "true" || scalar.includes('"value":true');
}

export function parseAccessibility(raw: string): AccessibilityIssue[] {
  const payload = parseJson<AccessibilityIssue[] | AccessibilityIssue>(raw);
  return asArray(payload).filter(
    (issue): issue is AccessibilityIssue =>
      issue !== null && issue !== undefined,
  );
}

export function parsePerformance(
  raw: string,
  slowRequests: NetworkEvent[],
): PerformanceSnapshot | undefined {
  const payload = parseJson<JsonRecord>(raw);
  if (!payload) return undefined;
  return {
    navigationMs: readNumber(payload, "navigationMs"),
    domContentLoadedMs: readNumber(payload, "domContentLoadedMs"),
    loadMs: readNumber(payload, "loadMs"),
    largestContentfulPaintMs: readNumber(payload, "largestContentfulPaintMs"),
    slowRequests,
  };
}
