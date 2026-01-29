/**
 * Seed script to geocode Article 16 Clinics from the official OPWDD list.
 * Data source: https://opwdd.ny.gov/article-16-certified-clinics
 * Run with: bun run src/lib/seed-article16.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { isInManhattanOrBronx, getManhattanBronxBbox } from "./geo-utils";

import type { CachedProvider } from "@/types/providers";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

if (!MAPBOX_TOKEN) {
  console.error("Error: NEXT_PUBLIC_MAPBOX_TOKEN environment variable is required");
  process.exit(1);
}

interface Article16Entry {
  agency: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
  county: string;
  type: "main" | "satellite";
}

interface MapboxFeature {
  center: [number, number];
}

interface MapboxResponse {
  features?: MapboxFeature[];
}

async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<{ lat: number; lng: number } | null> {
  const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");

  // Skip vague addresses that won't geocode well
  if (!fullAddress.trim() || address.toLowerCase().includes("unspecified")) {
    return null;
  }

  try {
    const bbox = getManhattanBronxBbox().join(",");
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=US&bbox=${bbox}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data: MapboxResponse = await res.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      if (isInManhattanOrBronx(lat, lng)) {
        return { lat, lng };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Article 16 Clinic Seed (Official OPWDD Data) ===\n");

  const rawPath = join(process.cwd(), "src/data/raw/article-16-official.json");
  const entries: Article16Entry[] = JSON.parse(readFileSync(rawPath, "utf-8"));

  console.log(`Loaded ${entries.length} Article 16 locations from official list`);
  console.log(`  Main clinics: ${entries.filter((e) => e.type === "main").length}`);
  console.log(`  Satellites: ${entries.filter((e) => e.type === "satellite").length}`);

  const cached: CachedProvider[] = [];
  let success = 0;
  let failed = 0;

  console.log("\nGeocoding locations...\n");

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    const coords = await geocodeAddress(entry.address, entry.city, "NY", entry.zip);

    if (coords) {
      const serviceType = entry.type === "main" ? "Article 16 Clinic" : "Article 16 Satellite";

      cached.push({
        source: "article16",
        name: entry.agency,
        services: [serviceType],
        address: [entry.address, entry.city, "NY", entry.zip].filter(Boolean).join(", "),
        county: entry.county,
        phone: entry.phone || undefined,
        lat: coords.lat,
        lng: coords.lng,
      });
      success++;
      console.log(`  ✓ ${entry.agency} - ${entry.address}`);
    } else {
      failed++;
      console.log(`  ✗ Failed: ${entry.agency} - ${entry.address}, ${entry.city}`);
    }

    // Rate limit: ~100ms between requests
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n=== Results ===`);
  console.log(`  Successfully geocoded: ${success}`);
  console.log(`  Failed to geocode: ${failed}`);
  console.log(`  Total locations: ${cached.length}`);

  // Summary by agency
  const byAgency = new Map<string, number>();
  for (const p of cached) {
    byAgency.set(p.name, (byAgency.get(p.name) || 0) + 1);
  }
  console.log(`\nBy agency:`);
  for (const [agency, count] of Array.from(byAgency.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${agency}: ${count} location(s)`);
  }

  const cachePath = join(process.cwd(), "src/data/article16-geocoded.json");
  writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  console.log(`\nSaved to ${cachePath}`);
}

main().catch(console.error);
