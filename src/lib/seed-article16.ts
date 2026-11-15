/**
 * Seed script for OPWDD Article 16 certified clinics (main sites + satellites) in the
 * service area (the five NYC boroughs, Nassau, Suffolk).
 *
 * Input:  src/data/raw/article-16-raw.json — table extraction of OPWDD's statewide
 *         "Clinic Programs and Satellites" list (src/data/raw/article-16-clinics.pdf).
 *         Source: https://opwdd.ny.gov/providers/article-16-clinics
 * Geocoding: U.S. Census Bureau geocoder (free, no API key), which also returns the county.
 *
 * Run with: bun run src/lib/seed-article16.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getRegion } from "./geo-utils";
import { formatPhone } from "./seed-utils";

import type { CachedProvider } from "@/types/providers";

interface RawTable {
  data: { text: string }[][];
}

type GeoResult = { lat: number; lng: number; county?: string };

interface ClinicSite {
  agency: string;
  phone: string;
  programId: string;
  siteId: string;
  type: "main" | "satellite";
  street: string;
  city: string;
  zip: string;
}

// Addresses the Census geocoder cannot match. Coordinates come from the same addresses in the
// NY Medicaid Enrolled Provider Listing (health.data.ny.gov), except 200 Varick Street (located by hand).
const MANUAL_LOCATIONS: Record<string, GeoResult> = {
  "200 varick street|new york": { lat: 40.72868, lng: -74.00543, county: "New York County" },
  "159-05 union turnpike|fresh meadows": { lat: 40.72075, lng: -73.80778, county: "Queens County" },
  "168-18 south conduit avenue|springfield gardens": { lat: 40.66681, lng: -73.77542, county: "Queens County" },
  "211-11 northern boulevard|bayside": { lat: 40.76, lng: -73.7717, county: "Queens County" },
  "8002 kew gardens road|kew gardens": { lat: 40.70697, lng: -73.82922, county: "Queens County" },
  "445 county road 101|yaphank": { lat: 40.81125, lng: -72.95342, county: "Suffolk County" },
};

const clean = (s: string) => s.replace(/\r/g, " ").replace(/\s+/g, " ").trim();

/** Turn the extracted PDF table into one entry per clinic site. */
export function parseClinicTable(tables: RawTable[]): ClinicSite[] {
  const sites: ClinicSite[] = [];
  let agency = "";
  let phone = "";
  let programId = "";

  const isSiteId = (s: string) => /^\d{11}$/.test(s);
  const addSatellite = (siteId: string, street: string, city: string, zip: string) =>
    sites.push({ agency, phone, programId, siteId, type: "satellite", street, city, zip });

  for (const table of tables) {
    for (const row of table.data) {
      const cells = row.map((c) => clean(c.text));
      if (cells[0] === "Agency Legal Name") continue;

      // Main program row (13 columns), possibly with a first satellite in the trailing columns
      if (cells.length === 13 && cells[0] && !isSiteId(cells[0])) {
        const [name, , agencyPhone, progId, progType, street, city, zip] = cells;
        // Only clinic programs (skips e.g. the IBR evaluation program)
        if (progType.toUpperCase() !== "CLINIC") { agency = ""; continue; }
        agency = name;
        phone = agencyPhone;
        programId = progId;
        sites.push({ agency, phone, programId, siteId: progId, type: "main", street, city, zip });
        const satIndex = cells.findIndex((c, i) => i >= 8 && isSiteId(c));
        if (satIndex >= 0) addSatellite(cells[satIndex], cells[satIndex + 1], cells[satIndex + 2], cells[satIndex + 3]);
        continue;
      }

      // Satellite-only row: the 11-digit site ID can sit in any column, followed by street, city, ZIP
      const idIndex = cells.findIndex(isSiteId);
      if (idIndex >= 0) {
        if (agency) addSatellite(cells[idIndex], cells[idIndex + 1], cells[idIndex + 2], cells[idIndex + 3]);
        continue;
      }

      // A row with a single text cell is a wrapped address line ("Avenue", "Street")
      const filled = cells.map((c, i) => [c, i] as const).filter(([c]) => c);
      if (agency && filled.length === 1 && sites.length > 0) {
        const [text, index] = filled[0];
        const target = index === 5
          ? [...sites].reverse().find((site) => site.type === "main")
          : sites[sites.length - 1];
        if (target && !target.street.endsWith(text)) target.street += ` ${text}`;
      }
    }
  }
  return sites;
}

interface CensusMatch {
  coordinates: { x: number; y: number };
  matchedAddress: string;
  geographies?: { Counties?: { NAME: string }[] };
}

/** Geocode a site; if the full address fails (e.g. a wrong ZIP in the source list), retry without the ZIP. */
async function geocode(site: ClinicSite): Promise<GeoResult | null> {
  const manual = MANUAL_LOCATIONS[`${site.street}|${site.city}`.toLowerCase()];
  if (manual) return manual;
  return (await geocodeAddress(`${site.street}, ${site.city}, NY ${site.zip}`))
    ?? (await geocodeAddress(`${site.street}, ${site.city}, NY`));
}

async function geocodeAddress(address: string): Promise<GeoResult | null> {
  const url = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
    + `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const match: CensusMatch | undefined = data.result?.addressMatches?.[0];
      if (!match) return null;
      return {
        lat: match.coordinates.y,
        lng: match.coordinates.x,
        county: match.geographies?.Counties?.[0]?.NAME,
      };
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

async function main() {
  const tables: RawTable[] = JSON.parse(readFileSync(join(process.cwd(), "src/data/raw/article-16-raw.json"), "utf-8"));
  const sites = parseClinicTable(tables);
  console.log(`Parsed ${sites.length} clinic sites statewide`);

  // Geocode every site with a street address and let the geocoded county decide (the source list has
  // ZIP typos, so filtering by ZIP first would drop real sites). Vague entries like "Bronx Rehabilitation"
  // have no street number and are skipped.
  const candidates = sites.filter((s) => /^\d/.test(s.street));
  console.log(`  ${candidates.length} sites with a street address`);

  const cached: CachedProvider[] = [];
  const failed: string[] = [];
  const outside: string[] = [];

  for (const site of candidates) {
    const geo = await geocode(site);
    const label = `${site.agency} — ${site.street}, ${site.city} ${site.zip}`;
    if (!geo) { failed.push(label); continue; }

    const region = getRegion(geo.lat, geo.lng, geo.county);
    if (!region) { outside.push(`${label} (${geo.county ?? "unknown county"})`); continue; }

    cached.push({
      source: "article16",
      name: site.agency,
      services: [site.type === "main" ? "Article 16 Clinic" : "Article 16 Satellite"],
      detail: `OPWDD program ${site.programId}${site.type === "satellite" ? ` · satellite ${site.siteId}` : ""}`,
      address: `${site.street}, ${site.city}, NY, ${site.zip}`,
      region,
      phone: formatPhone(site.phone),
      lat: geo.lat,
      lng: geo.lng,
    });
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\nSaved ${cached.length} clinic sites`);
  const counts = new Map<string, number>();
  for (const p of cached) counts.set(p.region, (counts.get(p.region) ?? 0) + 1);
  for (const [k, v] of counts) console.log(`  ${k}: ${v}`);
  console.log(`\nOutside the service area: ${outside.length}`);
  console.log(`\nCould not geocode (check if any are in the service area): ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f}`));

  writeFileSync(join(process.cwd(), "src/data/article16-geocoded.json"), JSON.stringify(cached, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
