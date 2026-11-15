/**
 * Seed script for the optional evaluations layer: Medicaid-enrolled clinical psychologists (psychological and
 * autism evaluations) and clinical social workers (psychosocial evaluations) in the service area.
 *
 * These clinicians are NOT IDD-specific: the Medicaid listing does not say which of them evaluate people with
 * intellectual or developmental disabilities. The website labels them that way and loads them only on request.
 * Listings at apartment addresses (likely a clinician's home) are left out.
 *
 * Source: https://health.data.ny.gov/Health/Medicaid-Enrolled-Provider-Listing/keti-qx5t
 * Run with: bun run src/lib/seed-clinicians.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { getRegion } from "./geo-utils";
import { MEDICAID_CLINICIAN_TYPES, TARGET_COUNTIES } from "./constants";
import { cleanAddress, cleanPhone, isStreetAddress, titleCaseAddress } from "./seed-utils";

import type { CachedProvider } from "@/types/providers";

interface MedicaidRow {
  npi?: string;
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

const CREDENTIALS: Record<string, string> = {
  PHD: "PhD", PSYD: "PsyD", EDD: "EdD", LCSW: "LCSW", LMSW: "LMSW", LCSWR: "LCSW-R", "LCSW-R": "LCSW-R", CSW: "CSW",
  JR: "Jr", SR: "Sr", II: "II", III: "III", MD: "MD", MS: "MS", MA: "MA",
};

/**
 * The listing writes people as "LAST FIRST MIDDLE" ("COHEN MARTIN S"). Show "Cohen, Martin S", keeping
 * credentials readable. Names that look like organizations are title-cased as they are.
 */
function personName(raw: string): string {
  const word = (w: string) => CREDENTIALS[w.replace(/[.,]/g, "")]
    ?? (w.charAt(0) + w.slice(1).toLowerCase()).replace(/([-'])(\w)/g, (_m, sep, c) => sep + c.toUpperCase());
  const words = raw.trim().split(/\s+/);
  if (words.length < 2 || /\b(INC|LLC|PC|PLLC|CORP|CENTER|SERVICES|ASSOC|GROUP)\b/.test(raw)) return words.map(word).join(" ");
  const [last, ...rest] = words;
  return `${word(last)}, ${rest.map(word).join(" ")}`;
}

async function main() {
  console.log("Fetching Medicaid-enrolled psychologists and clinical social workers...");
  const types = Object.keys(MEDICAID_CLINICIAN_TYPES).map((t) => `'${t}'`).join(",");
  const counties = TARGET_COUNTIES.map((c) => `'${c}'`).join(",");
  const where = `profession_or_service in(${types}) AND upper(county) in(${counties}) AND latitude IS NOT NULL`;
  const select = "npi,mmis_name,profession_or_service,service_address,city,zip_code,county,telephone,latitude,longitude";
  const res = await fetch(`${API_URL}?$limit=50000&$select=${select}&$where=${encodeURIComponent(where)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const rows: MedicaidRow[] = await res.json();
  console.log(`  Fetched ${rows.length} rows`);

  const cached: CachedProvider[] = [];
  const seen = new Set<string>();
  const skipped = { outsideArea: 0, duplicates: 0, noStreetAddress: 0, apartment: 0 };

  for (const row of rows) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const region = getRegion(lat, lng, row.county);
    if (!region) { skipped.outsideArea++; continue; }

    const { street } = cleanAddress(row.service_address);
    if (!isStreetAddress(street)) { skipped.noStreetAddress++; continue; }
    if (/\bAPT\b/i.test(street)) { skipped.apartment++; continue; }

    const service = MEDICAID_CLINICIAN_TYPES[row.profession_or_service ?? ""];
    const key = `${row.npi}|${service}|${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) { skipped.duplicates++; continue; }
    seen.add(key);

    const zip = row.zip_code?.slice(0, 5);
    cached.push({
      source: "clinicians",
      name: personName(row.mmis_name || "Unknown"),
      services: [service],
      // The website explains that clinicians are not IDD-specific; the data only carries the NPI
      ...(row.npi ? { detail: `NPI ${row.npi}` } : {}),
      address: [titleCaseAddress(street), titleCaseAddress(row.city), "NY", zip].filter(Boolean).join(", "),
      region,
      phone: cleanPhone(row.telephone),
      lat,
      lng,
    });
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\nSaved ${cached.length} clinician listings`, skipped);
  const counts = new Map<string, number>();
  for (const p of cached) counts.set(p.services[0], (counts.get(p.services[0]) ?? 0) + 1);
  for (const [k, v] of counts) console.log(`  ${k}: ${v}`);
  writeFileSync(join(process.cwd(), "src/data/clinicians-geocoded.json"), JSON.stringify(cached));
}

main().catch((e) => { console.error(e); process.exit(1); });
