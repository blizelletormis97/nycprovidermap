/**
 * Safety checks for the weekly automatic data refresh (.github/workflows/refresh-data.yml).
 *
 * Compares each src/data/*-geocoded.json with the version last published (git HEAD):
 *   - a file whose content is the same apart from the order of keys is put back exactly as it was, so a refresh
 *     with no real changes publishes nothing
 *   - every provider must have a name, an address, a map area and coordinates inside New York State
 *   - no source may lose more than 10% of its providers in one refresh (a sign the source was down or changed format)
 *
 * Prints a plain-language summary (also written to $GITHUB_STEP_SUMMARY when set) and exits with code 1 if a check
 * fails, so the workflow publishes nothing and opens an issue instead.
 *
 * Run with: bun run src/lib/check-data.ts
 */

import { execFileSync } from "child_process";
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

import type { CachedProvider } from "@/types/providers";

const MAX_DROP = 0.1;
const NY = { minLat: 40.45, maxLat: 45.05, minLng: -79.8, maxLng: -71.8 };
const dataDir = join(process.cwd(), "src/data");

/** JSON with object keys sorted, so key order never counts as a change */
const canonical = (value: unknown): string => JSON.stringify(value, (_k, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

function published(file: string): string | null {
  try {
    return execFileSync("git", ["show", `HEAD:src/data/${file}`], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // a new source, not published yet
  }
}

/** Identify a provider across refreshes: source, listed name and address */
const key = (p: CachedProvider) => `${p.source}|${(p.listedName ?? p.name).toUpperCase()}|${p.address.toUpperCase()}`;

const lines: string[] = [];
const problems: string[] = [];
let changedFiles = 0;

for (const file of readdirSync(dataDir).filter((f) => f.endsWith("-geocoded.json")).sort()) {
  const nowText = readFileSync(join(dataDir, file), "utf-8");
  const now: CachedProvider[] = JSON.parse(nowText);
  const beforeText = published(file);
  const before: CachedProvider[] = beforeText ? JSON.parse(beforeText) : [];

  if (beforeText && canonical(now) === canonical(before)) {
    if (nowText !== beforeText) writeFileSync(join(dataDir, file), beforeText); // only the key order differed
    lines.push(`- ${file}: no changes (${now.length} providers)`);
    continue;
  }
  changedFiles++;

  const bad = now.filter((p) => !p.name?.trim() || !p.address?.trim() || !p.region
    || !(p.lat >= NY.minLat && p.lat <= NY.maxLat && p.lng >= NY.minLng && p.lng <= NY.maxLng));
  if (bad.length) problems.push(`${file}: ${bad.length} providers with a missing name, address or area, or placed outside New York (e.g. ${bad.slice(0, 3).map((p) => p.name || "(no name)").join("; ")})`);
  if (before.length && now.length < before.length * (1 - MAX_DROP)) {
    problems.push(`${file}: dropped from ${before.length} to ${now.length} providers (more than ${MAX_DROP * 100}%); the source may have been down or changed format`);
  }

  const beforeKeys = new Map(before.map((p) => [key(p), p]));
  const nowKeys = new Map(now.map((p) => [key(p), p]));
  const added = [...nowKeys.keys()].filter((k) => !beforeKeys.has(k));
  const removed = [...beforeKeys.keys()].filter((k) => !nowKeys.has(k));
  const changed = [...nowKeys.keys()].filter((k) => beforeKeys.has(k) && canonical(nowKeys.get(k)) !== canonical(beforeKeys.get(k)));
  lines.push(`- ${file}: ${before.length} -> ${now.length} providers (${added.length} added, ${removed.length} removed, ${changed.length} updated)`);
  const sample = (label: string, keys: string[], from: Map<string, CachedProvider>) => {
    for (const k of keys.slice(0, 5)) lines.push(`  - ${label}: ${from.get(k)!.name}, ${from.get(k)!.address}`);
    if (keys.length > 5) lines.push(`  - ...and ${keys.length - 5} more ${label.toLowerCase()}`);
  };
  sample("Added", added, nowKeys);
  sample("Removed", removed, beforeKeys);
}

const summary = [
  problems.length ? "## Data refresh stopped: safety checks failed" : changedFiles ? "## Data refresh: changes found" : "## Data refresh: no changes",
  "",
  ...lines,
  ...(problems.length ? ["", "### Problems", ...problems.map((p) => `- ${p}`), "", "Nothing was published; the live map keeps last week's data."] : []),
].join("\n");

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
writeFileSync(join(process.cwd(), "refresh-summary.md"), `${summary}\n`);
process.exit(problems.length ? 1 : 0);
