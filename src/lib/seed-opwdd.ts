/**
 * Seed script to fetch OPWDD providers from NY Open Data.
 * Uses Turf.js for accurate polygon-based filtering of Manhattan + Bronx providers.
 * Run with: bun run src/lib/seed-opwdd.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { isInManhattanOrBronx, getManhattanBronxBbox } from "./geo-utils";
import { OPWDD_SERVICE_FIELDS, TARGET_COUNTIES } from "./constants";

import type { CachedProvider } from "@/types/providers";

// Raw API response from data.ny.gov
interface OpwddProvider {
  developmental_disability_services_office?: string;
  service_provider?: string;
  street_address?: string;
  street_address_line_2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  county?: string;
  url?: { url: string };
  intermediate_care_facilities_icf_s?: "Y" | "N";
  individual_residential_alternative_ira?: "Y" | "N";
  family_care?: "Y" | "N";
  self_direction_services?: "Y" | "N";
  individual_support_services_iss?: "Y" | "N";
  day_habilitation?: "Y" | "N";
  prevocational?: "Y" | "N";
  supported_employment_enrollments?: "Y" | "N";
  community_habilitation?: "Y" | "N";
  family_support_services?: "Y" | "N";
  developmental_centers_and_special_population_services?: "Y" | "N";
  georeference?: { type: "Point"; coordinates: [number, number] };
}

const OPWDD_API_URL = "https://data.ny.gov/resource/ieqx-cqyk.json";

async function fetchOpwddProviders(): Promise<OpwddProvider[]> {
  console.log("Fetching OPWDD providers from NY Open Data...");

  const countyClause = TARGET_COUNTIES
    .map((county) => `upper(county) = '${county}'`)
    .join(" OR ");

  const url = `${OPWDD_API_URL}?$limit=5000&$where=${encodeURIComponent(`(${countyClause})`)}`;
  const res = await fetch(url, { cache: "no-store" });
  const providers: OpwddProvider[] = await res.json();

  console.log(`  Fetched ${providers.length} providers from API`);
  return providers;
}

function extractServices(provider: OpwddProvider): string[] {
  const services: string[] = [];
  for (const [field, displayName] of Object.entries(OPWDD_SERVICE_FIELDS)) {
    if (provider[field as keyof OpwddProvider] === "Y") {
      services.push(displayName);
    }
  }
  return services;
}

async function main() {
  const providers = await fetchOpwddProviders();
  const cached: CachedProvider[] = [];

  console.log("\nFiltering providers using borough polygon boundaries...");
  const bbox = getManhattanBronxBbox();
  console.log(`  Using bounding box: [${bbox.join(", ")}]`);

  const seen = new Set<string>();
  let filtered = 0;
  let duplicates = 0;
  let noCoords = 0;
  let noServices = 0;

  for (const provider of providers) {
    if (!provider.georeference?.coordinates) { noCoords++; continue; }
    const [lng, lat] = provider.georeference.coordinates;
    if (isNaN(lat) || isNaN(lng)) { noCoords++; continue; }
    if (!isInManhattanOrBronx(lat, lng)) { filtered++; continue; }

    const services = extractServices(provider);
    if (services.length === 0) { noServices++; continue; }

    const key = `${provider.service_provider}-${lat.toFixed(5)}-${lng.toFixed(5)}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);

    const address = [provider.street_address, provider.street_address_line_2, provider.city, provider.state, provider.zip_code]
      .filter(Boolean).join(", ");

    cached.push({
      source: "opwdd",
      name: provider.service_provider || "Unknown Provider",
      services,
      address,
      county: provider.county || "",
      phone: provider.phone,
      website: provider.url?.url,
      lat,
      lng,
    });
  }

  console.log(`\nResults:`);
  console.log(`  Valid providers: ${cached.length}`);
  console.log(`  Filtered (outside Manhattan/Bronx): ${filtered}`);
  console.log(`  Duplicates skipped: ${duplicates}`);
  console.log(`  Missing coordinates: ${noCoords}`);
  console.log(`  No services offered: ${noServices}`);

  const serviceCounts = new Map<string, number>();
  for (const provider of cached) {
    for (const service of provider.services) {
      serviceCounts.set(service, (serviceCounts.get(service) || 0) + 1);
    }
  }
  console.log(`\nService breakdown:`);
  for (const [service, count] of Array.from(serviceCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${service}: ${count}`);
  }

  const cachePath = join(process.cwd(), "src/data/opwdd-geocoded.json");
  writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  console.log(`\nSaved to ${cachePath}`);
}

main().catch(console.error);
