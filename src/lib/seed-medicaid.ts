/**
 * Seed script to fetch Medicaid-enrolled IDD (OPWDD) provider sites for the
 * whole state (OPWDD Regions 1-5).
 * Source: https://health.data.ny.gov/Health/Medicaid-Enrolled-Provider-Listing/keti-qx5t
 * Run with: bun run src/lib/seed-medicaid.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { countyName, getRegion } from "./geo-utils";
import { MEDICAID_IDD_TYPES } from "./constants";
import { cleanAddress, cleanPhone, isStreetAddress, titleCaseAddress } from "./seed-utils";

import type { CachedProvider } from "@/types/providers";

interface MedicaidProvider {
  mmis_id?: string;
  mmis_name?: string;
  profession_or_service?: string;
  service_address?: string;
  city?: string;
  zip_code?: string;
  county?: string;
  telephone?: string;
  latitude?: string;
  longitude?: string;
}

const API_URL = "https://health.data.ny.gov/resource/keti-qx5t.json";

async function main() {
  console.log("Fetching Medicaid-enrolled IDD providers from NY Health Data...");
  const types = Object.keys(MEDICAID_IDD_TYPES).map((t) => `'${t}'`).join(",");
  const where = `profession_or_service in(${types}) AND state='NY' AND latitude IS NOT NULL`;
  const select = "mmis_id,mmis_name,profession_or_service,service_address,city,zip_code,county,telephone,latitude,longitude";
  const res = await fetch(`${API_URL}?$limit=50000&$select=${select}&$where=${encodeURIComponent(where)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const rows: MedicaidProvider[] = await res.json();
  console.log(`  Fetched ${rows.length} rows`);

  const cached: CachedProvider[] = [];
  const seen = new Set<string>();
  const skipped = { outsideArea: 0, duplicates: 0, noStreetAddress: 0 };

  for (const row of rows) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const region = getRegion(lat, lng, row.county);
    if (!region) { skipped.outsideArea++; continue; }

    const service = MEDICAID_IDD_TYPES[row.profession_or_service ?? ""];
    const key = `${row.mmis_id}|${service}|${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(key)) { skipped.duplicates++; continue; }
    seen.add(key);

    const { street, notes } = cleanAddress(row.service_address);
    if (!isStreetAddress(street)) { skipped.noStreetAddress++; continue; }

    const zip = row.zip_code?.slice(0, 5);
    const address = [titleCaseAddress(street), titleCaseAddress(row.city), "NY", zip]
      .filter(Boolean).join(", ");

    cached.push({
      source: "medicaid",
      name: row.mmis_name || "Unknown Provider",
      services: [service],
      detail: [...notes, row.mmis_id ? `Medicaid ID ${row.mmis_id}` : null].filter(Boolean).join(" · "),
      ...(notes.includes("Billing enrollment (rate set)") ? { office: true } : {}),
      address,
      region,
      county: countyName(row.county),
      phone: cleanPhone(row.telephone),
      lat,
      lng,
    });
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\nSaved ${cached.length} sites`, skipped);
  const counts = new Map<string, number>();
  for (const p of cached) counts.set(`${p.region} / ${p.services[0]}`, (counts.get(`${p.region} / ${p.services[0]}`) ?? 0) + 1);
  for (const [k, v] of [...counts].sort()) console.log(`  ${k}: ${v}`);
  writeFileSync(join(process.cwd(), "src/data/medicaid-geocoded.json"), JSON.stringify(cached, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
