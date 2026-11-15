/**
 * Seed script to fetch NYS DOH-licensed health facilities (hospitals, clinics,
 * nursing homes, home care agencies, adult care facilities, hospice) for
 * Manhattan + Bronx.
 * Source: https://health.data.ny.gov/Health/Health-Facility-General-Information/vn5v-hh5r
 * Run with: bun run src/lib/seed-health-facilities.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { isInManhattanOrBronx } from "./geo-utils";
import { formatPhone, titleCaseAddress } from "./seed-utils";

import type { CachedProvider } from "@/types/providers";

interface HealthFacility {
  fac_id?: string;
  facility_name?: string;
  description?: string;
  address1?: string;
  address2?: string;
  city?: string;
  fac_zip?: string;
  fac_phone?: string;
  county?: string;
  operator_name?: string;
  main_site_name?: string;
  latitude?: string;
  longitude?: string;
}

const API_URL = "https://health.data.ny.gov/resource/vn5v-hh5r.json";

/** Map the DOH facility description to the map's service category. */
export function categorizeFacility(description: string): string | null {
  const d = description.toUpperCase();
  if (d.startsWith("SCHOOL BASED")) return "School-Based Clinic";
  if (d.includes("DIAGNOSTIC AND TREATMENT") || d.includes("HOSPITAL EXTENSION CLINIC")) return "Community Clinic";
  if (d === "HOSPITAL") return "Hospital";
  if (d.includes("RESIDENTIAL HEALTH CARE")) return "Nursing Home";
  if (d.includes("HOME CARE") || d.includes("HOME HEALTH")) return "Home Health";
  if (d.includes("ADULT HOME") || d.includes("ENRICHED HOUSING") || d.includes("ASSISTED LIVING")) return "Adult Care Facility";
  if (d.includes("ADULT DAY HEALTH")) return "Adult Day Health Care";
  if (d.includes("HOSPICE")) return "Hospice";
  return null;
}

async function main() {
  console.log("Fetching NYS health facilities (New York + Bronx counties)...");
  const where = encodeURIComponent("county in('New York','Bronx')");
  const res = await fetch(`${API_URL}?$limit=10000&$where=${where}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const rows: HealthFacility[] = await res.json();
  console.log(`  Fetched ${rows.length} facilities`);

  const cached: CachedProvider[] = [];
  const skipped = { noCoords: 0, outside: 0, uncategorized: 0 };

  for (const row of rows) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!row.latitude || !row.longitude || isNaN(lat) || isNaN(lng)) { skipped.noCoords++; continue; }
    if (!isInManhattanOrBronx(lat, lng)) { skipped.outside++; continue; }

    const category = categorizeFacility(row.description ?? "");
    if (!category) { skipped.uncategorized++; continue; }

    const address = [titleCaseAddress(row.address1), titleCaseAddress(row.address2), row.city, "NY", row.fac_zip]
      .filter(Boolean).join(", ");

    const detailParts = [row.description];
    if (row.main_site_name && row.main_site_name !== row.facility_name) detailParts.push(`Main site: ${row.main_site_name}`);

    cached.push({
      source: "facilities",
      name: row.facility_name || "Unknown Facility",
      services: [category],
      detail: detailParts.filter(Boolean).join(" · "),
      address,
      county: row.county,
      phone: formatPhone(row.fac_phone),
      lat,
      lng,
    });
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nSaved ${cached.length} facilities`, skipped);
  const counts = new Map<string, number>();
  for (const p of cached) counts.set(p.services[0], (counts.get(p.services[0]) ?? 0) + 1);
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  writeFileSync(join(process.cwd(), "src/data/facilities-geocoded.json"), JSON.stringify(cached, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
