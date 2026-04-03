import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function resolveOutputPath(...parts: string[]): string {
  return resolve(...parts);
}

export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function writeJsonFile(
  path: string,
  value: unknown,
): Promise<void> {
  await ensureParent(path);
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function durationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortJson(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, sortJson(nestedValue)]),
  );
}
