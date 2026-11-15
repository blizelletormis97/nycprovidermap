/**
 * Seed script to fetch NYS Office of Mental Health (OMH) licensed and funded
 * mental health programs for Manhattan + Bronx.
 * Source: https://data.ny.gov/Human-Services/Local-Mental-Health-Programs/6nvr-tbv8
 * Run with: bun run src/lib/seed-omh.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { isInManhattanOrBronx } from "./geo-utils";
import { formatPhone, titleCaseAddress } from "./seed-utils";

import type { CachedProvider } from "@/types/providers";

interface OmhProgram {
  agency_name?: string;
  facility_name?: string;
  program_name?: string;
  populations_served?: string;
  program_phone?: string;
  agency_phone?: string;
  program_address_1?: string;
  program_address_2?: string;
  program_city?: string;
  program_zip?: string;
  program_county?: string;
  program_type_description?: string;
  program_category_description?: string;
  georeference?: { type: "Point"; coordinates: [number, number] };
}

const API_URL = "https://data.ny.gov/resource/6nvr-tbv8.json";

/** Map an OMH program type/category to the map's service category. */
export function categorizeOmhProgram(type: string, category: string): string {
  const t = type.toUpperCase();
  const c = category.toUpperCase();

  if (c === "INPATIENT") return "Inpatient Psychiatric";
  if (c === "EMERGENCY/CRISIS" || t.includes("CRISIS")) return "Crisis Services";
  if (c === "RESIDENTIAL") return "Mental Health Housing";
  if (t.includes("ASSERTIVE COMMUNITY TREATMENT") || t.includes("INTENSIVE MOBILE") || t.includes("SAFE OPTIONS")
    || t.includes("CRITICAL TIME INTERVENTION") || t.includes("MOBILE INTEGRATION") || t.includes("ONTRACKNY")) {
    return "Intensive Community Treatment";
  }
  if (t.includes("CFTSS") || t.includes("CHILDREN") || t.includes("YOUTH") || t.includes("HEALTHYSTEPS")
    || t.includes("SCHOOL MENTAL HEALTH") || t.includes("FAMILY PEER")) {
    return "Children & Family Services";
  }
  if (c === "OUTPATIENT" || t.includes("CCBHC") || t.includes("CERTIFIED COMMUNITY BEHAVIORAL")) return "Mental Health Clinic";
  if (t.includes("CARE MANAGEMENT") || t.includes("CARE COORDINATION") || t.includes("TRANSITION MANAGEMENT")) return "MH Care Management";
  if (t.includes("EMPLOYMENT") || t.includes("VOCATIONAL")) return "MH Employment Services";
  return "Peer & Recovery Support";
}

async function main() {
  console.log("Fetching OMH programs (New York + Bronx counties)...");
  const where = encodeURIComponent("program_county in('New York','Bronx')");
  const res = await fetch(`${API_URL}?$limit=10000&$where=${where}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const rows: OmhProgram[] = await res.json();
  console.log(`  Fetched ${rows.length} programs`);

  const cached: CachedProvider[] = [];
  const seen = new Set<string>();
  const skipped = { noCoords: 0, outside: 0, duplicates: 0 };

  for (const row of rows) {
    const coords = row.georeference?.coordinates;
    if (!coords || isNaN(coords[0]) || isNaN(coords[1])) { skipped.noCoords++; continue; }
    const [lng, lat] = coords;
    if (!isInManhattanOrBronx(lat, lng)) { skipped.outside++; continue; }

    const type = row.program_type_description ?? "";
    const key = `${row.agency_name}|${row.program_name}|${type}|${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(key)) { skipped.duplicates++; continue; }
    seen.add(key);

    const zip = row.program_zip?.slice(0, 5);
    const address = [titleCaseAddress(row.program_address_1), titleCaseAddress(row.program_address_2), row.program_city, "NY", zip]
      .filter(Boolean).join(", ");

    const detail = [type, row.program_name && row.program_name !== type ? row.program_name : null,
      row.populations_served ? `Serves: ${row.populations_served}` : null]
      .filter(Boolean).join(" · ");

    cached.push({
      source: "omh",
      name: row.agency_name || row.facility_name || "Unknown Agency",
      services: [categorizeOmhProgram(type, row.program_category_description ?? "")],
      detail,
      address,
      county: row.program_county,
      phone: formatPhone(row.program_phone || row.agency_phone),
      lat,
      lng,
    });
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nSaved ${cached.length} programs`, skipped);
  const counts = new Map<string, number>();
  for (const p of cached) counts.set(p.services[0], (counts.get(p.services[0]) ?? 0) + 1);
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  writeFileSync(join(process.cwd(), "src/data/omh-geocoded.json"), JSON.stringify(cached, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
