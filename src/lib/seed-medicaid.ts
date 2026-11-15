/**
 * Seed script to fetch Medicaid-enrolled IDD (OPWDD) provider sites for the
 * service area (the five NYC boroughs, Nassau, Suffolk).
 * Source: https://health.data.ny.gov/Health/Medicaid-Enrolled-Provider-Listing/keti-qx5t
 * Run with: bun run src/lib/seed-medicaid.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { getRegion } from "./geo-utils";
import { MEDICAID_IDD_TYPES, TARGET_COUNTIES } from "./constants";
import { formatPhone, titleCaseAddress } from "./seed-utils";

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

// Program notes the listing appends to addresses, mapped to a readable label for the popup
const ADDRESS_NOTES: [RegExp, string | null][] = [
  [/\bAHRH REGION \d+ RATE SET\b/gi, "Billing enrollment (rate set)"],
  [/\bSUPP?ORTIVE IRA\b/gi, "Supportive IRA"],
  [/\bSUPP?ORTIVE(\s+\d+\s+SITES)?\b/gi, "Supportive IRA"],
  [/\b(GROUP|SUPPL INDIV|INDIV)\s+DAY HAB\b/gi, "Day habilitation"],
  [/\bOMRDD DT\b/gi, "Day treatment"],
  [/#\s*SUPVD\b/gi, "Supervised residence"],
];

const STREET_SUFFIX = /\b(ST|AVE|RD|PLZ|BLVD|PL|LN|DR|CT|HWY|HW|PKWY|CRES|WAY|TPKE|TER|CIR|SQ)\b(\s+(#|APT|STE|FL|RM)\s*\S+)*/i;

/**
 * Clean an address from the Medicaid listing, e.g. "61 FLORENCE ST # C7123461 # SUPVD" or
 * "133 SHORE RD RD ICF". Returns the cleaned street address plus any program notes found in it.
 */
export function cleanAddress(raw = ""): { street: string; notes: string[] } {
  const notes = new Set<string>();
  let s = raw;
  for (const [pattern, label] of ADDRESS_NOTES) {
    if (pattern.test(s) && label) notes.add(label);
    pattern.lastIndex = 0;
    s = s.replace(pattern, " ");
  }
  s = s.replace(/#\s*C\d+/gi, " ");

  // "1980 MORRIS AVE MORRIS AVE ICF" -> cut everything after the street suffix (and unit)
  if (/\bICF\b/i.test(s)) {
    const match = s.match(STREET_SUFFIX);
    s = match?.index != null ? s.slice(0, match.index + match[0].length) : s.replace(/\bICF\b.*$/i, "");
  }

  s = s.replace(/#\s*(?=#|$)/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s#,]+|[\s#,]+$/g, "").trim();
  return { street: s, notes: [...notes] };
}

/** True when the cleaned address looks like a real street address (not a PO box or "10 SITES"). */
function isStreetAddress(street: string): boolean {
  return /^\d/.test(street) && !/\bPO BOX\b|\bSITES\b/i.test(street);
}

/** The listing puts site codes in the phone field for many OPWDD sites; keep only real phone numbers. */
function cleanPhone(raw?: string): string | undefined {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (digits.length !== 10 || !/^[2-9]\d{2}[2-9]/.test(digits)) return undefined;
  return formatPhone(digits);
}

async function main() {
  console.log("Fetching Medicaid-enrolled IDD providers from NY Health Data...");
  const types = Object.keys(MEDICAID_IDD_TYPES).map((t) => `'${t}'`).join(",");
  const counties = TARGET_COUNTIES.map((c) => `'${c}'`).join(",");
  const where = `profession_or_service in(${types}) AND upper(county) in(${counties}) AND latitude IS NOT NULL`;
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
