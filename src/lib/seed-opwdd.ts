/**
 * Seed script to fetch OPWDD service provider agencies from NY Open Data for the
 * service area (the five NYC boroughs, Nassau, Suffolk).
 * Only agencies offering at least one Medicaid-funded OPWDD service are kept.
 * Source: https://data.ny.gov/Human-Services/Directory-of-Developmental-Disabilities-Service-Pr/ieqx-cqyk
 * Run with: bun run src/lib/seed-opwdd.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { getRegion } from "./geo-utils";
import { OPWDD_MEDICAID_SERVICES, OPWDD_SERVICE_FIELDS, TARGET_COUNTIES } from "./constants";
import { formatPhone, titleCaseAddress } from "./seed-utils";

import type { CachedProvider } from "@/types/providers";

// Raw API response from data.ny.gov
type OpwddProvider = {
  service_provider?: string;
  street_address?: string;
  street_address_line_2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  county?: string;
  url?: { url: string };
  georeference?: { type: "Point"; coordinates: [number, number] };
} & Partial<Record<keyof typeof OPWDD_SERVICE_FIELDS, "Y" | "N">>;

const OPWDD_API_URL = "https://data.ny.gov/resource/ieqx-cqyk.json";

async function fetchOpwddProviders(): Promise<OpwddProvider[]> {
  console.log("Fetching OPWDD providers from NY Open Data...");
  const where = `upper(county) in(${TARGET_COUNTIES.map((c) => `'${c}'`).join(",")})`;
  const res = await fetch(`${OPWDD_API_URL}?$limit=5000&$where=${encodeURIComponent(where)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const providers: OpwddProvider[] = await res.json();
  console.log(`  Fetched ${providers.length} providers from API`);
  return providers;
}

function extractServices(provider: OpwddProvider): string[] {
  return Object.entries(OPWDD_SERVICE_FIELDS)
    .filter(([field]) => provider[field as keyof typeof OPWDD_SERVICE_FIELDS] === "Y")
    .map(([, displayName]) => displayName);
}

async function main() {
  const providers = await fetchOpwddProviders();
  const cached: CachedProvider[] = [];
  const seen = new Set<string>();
  const skipped = { noCoords: 0, outsideArea: 0, noMedicaidServices: 0, duplicates: 0 };

  for (const provider of providers) {
    const coords = provider.georeference?.coordinates;
    if (!coords || isNaN(coords[0]) || isNaN(coords[1])) { skipped.noCoords++; continue; }
    const [lng, lat] = coords;

    const region = getRegion(lat, lng, provider.county);
    if (!region) { skipped.outsideArea++; continue; }

    const services = extractServices(provider);
    if (!services.some((s) => OPWDD_MEDICAID_SERVICES.has(s))) { skipped.noMedicaidServices++; continue; }

    const key = `${provider.service_provider}-${lat.toFixed(5)}-${lng.toFixed(5)}`;
    if (seen.has(key)) { skipped.duplicates++; continue; }
    seen.add(key);

    const address = [
      titleCaseAddress(provider.street_address),
      titleCaseAddress(provider.street_address_line_2),
      titleCaseAddress(provider.city),
      "NY",
      provider.zip_code,
    ].filter(Boolean).join(", ");

    cached.push({
      source: "opwdd",
      name: provider.service_provider || "Unknown Provider",
      services,
      detail: "OPWDD-certified agency (administrative office)",
      address,
      region,
      phone: formatPhone(provider.phone),
      website: provider.url?.url,
      lat,
      lng,
    });
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\nSaved ${cached.length} agencies`, skipped);
  logRegions(cached);
  writeFileSync(join(process.cwd(), "src/data/opwdd-geocoded.json"), JSON.stringify(cached, null, 2));
}

export function logRegions(cached: CachedProvider[]) {
  const counts = new Map<string, number>();
  for (const p of cached) counts.set(p.region, (counts.get(p.region) ?? 0) + 1);
  for (const [k, v] of counts) console.log(`  ${k}: ${v}`);
}

if (process.argv[1]?.endsWith("seed-opwdd.ts")) main().catch((e) => { console.error(e); process.exit(1); });
