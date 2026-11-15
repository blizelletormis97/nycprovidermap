/**
 * Check that Article 16 clinic addresses are still current.
 *
 * The OPWDD clinic list is dated October 2024. The NY Medicaid Enrolled Provider Listing is updated weekly and includes
 * outpatient clinics, so an address with a Medicaid-enrolled clinic today is treated as confirmed. Other sites get
 * `unconfirmed: true`, which the website shows as "call to confirm the address". Matching ignores ZIP codes,
 * street-type words (Road/Drive) and suite numbers, and accepts either end of a number range ("82-84").
 *
 * Run after seed-article16.ts: bun run src/lib/verify-article16.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { streetTokens } from "./seed-utils";

import type { CachedProvider } from "@/types/providers";

const MEDICAID_URL = "https://health.data.ny.gov/resource/keti-qx5t.json";
const GENERIC = new Set(["ST", "AVE", "RD", "BLVD", "PL", "DR", "LN", "CT", "PKWY", "PLZ", "HWY", "TPKE", "TER", "WAY",
  "CIR", "SQ", "N", "S", "E", "W", "ROUTE", "RTE", "STATE", "US", "COUNTY", "CO", "SUITE", "STE", "FL", "FLOOR", "RM",
  "ROOM", "APT", "UNIT", "BLDG"]);

/** House number(s) + distinctive street words + city, e.g. "2356|NORTH FOREST|GETZVILLE". */
function addressKeys(street: string, city: string): string[] {
  const tokens = streetTokens(street.replace(/,?\s+\b(suite|ste|fl|floor|rm|room|unit|bldg)\b.*$/i, "").replace(/#.*$/, ""));
  const [num, ...rest] = tokens;
  if (!num || !/^\d/.test(num)) return [];
  const core = rest.filter((w) => !GENERIC.has(w)).join(" ");
  const numbers = new Set([num.replace(/-/g, ""), ...num.split("-")]);
  return [...numbers].map((n) => `${n}|${core}|${city.toUpperCase().trim()}`);
}

async function main() {
  const where = "profession_or_service in('OUTPATIENT CLINIC','OUTPATIENT','OPWDD STATE-OPERATED CLINIC') AND state='NY'";
  const res = await fetch(`${MEDICAID_URL}?$limit=50000&$select=service_address,city&$where=${encodeURIComponent(where)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows: { service_address?: string; city?: string }[] = await res.json();
  const current = new Set(rows.flatMap((r) => addressKeys(r.service_address ?? "", r.city ?? "")));
  console.log(`Medicaid-enrolled clinic rows: ${rows.length}`);

  const file = join(process.cwd(), "src/data/article16-geocoded.json");
  const sites: CachedProvider[] = JSON.parse(readFileSync(file, "utf-8"));
  let unconfirmed = 0;
  for (const site of sites) {
    const [street, city] = site.address.split(",").map((s) => s.trim());
    if (addressKeys(street, city).some((k) => current.has(k))) {
      delete site.unconfirmed;
    } else {
      site.unconfirmed = true;
      unconfirmed++;
    }
  }
  writeFileSync(file, JSON.stringify(sites, null, 2));
  console.log(`Confirmed: ${sites.length - unconfirmed} / ${sites.length}; marked "call to confirm": ${unconfirmed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
