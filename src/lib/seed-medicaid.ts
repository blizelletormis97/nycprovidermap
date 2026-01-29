/**
 * Seed script to fetch Medicaid providers with coordinates from the API.
 * Uses Turf.js for accurate polygon-based filtering of Manhattan + Bronx providers.
 * Run with: bun run src/lib/seed-medicaid.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { isInManhattanOrBronx, getManhattanBronxBbox } from "./geo-utils";
import { MEDICAID_TYPES, TARGET_COUNTIES } from "./constants";

import type { CachedProvider } from "@/types/providers";

// Raw API response shape from health.data.ny.gov
interface MedicaidProvider {
  mmis_name?: string;
  profession_or_service?: string;
  service_address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  county?: string;
  npi?: string;
  latitude?: string;
  longitude?: string;
}

async function fetchMedicaidProviders(): Promise<MedicaidProvider[]> {
  console.log("Fetching Medicaid providers from NY Health Data...");

  const countyClause = TARGET_COUNTIES
    .map((county) => `upper(county) = '${county}'`)
    .join(" OR ");

  // Fetch each type separately to avoid hitting API row limits
  const allProviders: MedicaidProvider[] = [];

  for (const type of MEDICAID_TYPES) {
    const whereClause = `upper(profession_or_service) like '%${type}%' AND (${countyClause}) AND latitude IS NOT NULL`;
    const url = `https://health.data.ny.gov/resource/keti-qx5t.json?$limit=50000&$where=${encodeURIComponent(whereClause)}&$select=mmis_name,profession_or_service,service_address,city,state,zip_code,county,npi,latitude,longitude`;

    const res = await fetch(url, { cache: "no-store" });
    const providers: MedicaidProvider[] = await res.json();
    console.log(`  ${type}: ${providers.length} rows`);
    if (providers.length === 50000) {
      console.warn(`  ⚠ WARNING: ${type} returned exactly 50,000 rows — data may be truncated! Increase $limit or split the query.`);
    }
    allProviders.push(...providers);
  }

  console.log(`  Total fetched: ${allProviders.length}`);
  return allProviders;
}

async function main() {
  const providers = await fetchMedicaidProviders();
  const cached: CachedProvider[] = [];

  console.log("\nFiltering providers using borough polygon boundaries...");
  const bbox = getManhattanBronxBbox();
  console.log(`  Using bounding box: [${bbox.join(", ")}]`);

  const seen = new Set<string>();
  let filtered = 0;
  let duplicates = 0;
  let invalidCoords = 0;

  for (const provider of providers) {
    const lat = parseFloat(provider.latitude || "");
    const lng = parseFloat(provider.longitude || "");

    if (isNaN(lat) || isNaN(lng)) { invalidCoords++; continue; }
    if (!isInManhattanOrBronx(lat, lng)) { filtered++; continue; }

    const key = `${provider.npi}-${lat.toFixed(5)}-${lng.toFixed(5)}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);

    const address = [provider.service_address, provider.city, provider.state, provider.zip_code]
      .filter(Boolean).join(", ");

    cached.push({
      source: "medicaid",
      name: provider.mmis_name || "Unknown Provider",
      services: [provider.profession_or_service || "Provider"],
      address,
      county: provider.county || "",
      lat,
      lng,
    });
  }

  console.log(`\nResults:`);
  console.log(`  Valid providers: ${cached.length}`);
  console.log(`  Filtered (outside Manhattan/Bronx): ${filtered}`);
  console.log(`  Duplicates skipped: ${duplicates}`);
  console.log(`  Invalid coordinates: ${invalidCoords}`);

  const cachePath = join(process.cwd(), "src/data/medicaid-geocoded.json");
  writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  console.log(`\nSaved to ${cachePath}`);
}

main().catch(console.error);
