/**
 * Seed script for OPWDD Article 16 certified clinics (main sites + satellites) in the
 * whole state (OPWDD Regions 1-5).
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
import { countyName, getRegion } from "./geo-utils";
import { addressKey } from "./api";
import { formatPhone, geocodeMatchAgrees } from "./seed-utils";

import type { CachedProvider, Region } from "@/types/providers";

interface RawTable {
  data: { text: string }[][];
}

type GeoResult = { lat: number; lng: number; county?: string; region?: Region; how?: string };

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
  "72 south woods road|woodbury": { lat: 40.83254, lng: -73.48224, county: "Nassau County" },
};

// "A en e" is "Avenue" with letters lost in the PDF extraction
const clean = (s: string) => s.replace(/\r/g, " ").replace(/\s+/g, " ").replace(/\bA en e\b/g, "Avenue").trim();

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

/**
 * Coordinates the state already published for the same building (OPWDD directory and Medicaid
 * listing), keyed by normalized street + ZIP. Run seed-opwdd.ts and seed-medicaid.ts first.
 */
function loadKnownLocations(): Map<string, GeoResult> {
  const known = new Map<string, GeoResult>();
  for (const file of ["medicaid-geocoded.json", "opwdd-geocoded.json"]) {
    const providers: CachedProvider[] = JSON.parse(readFileSync(join(process.cwd(), "src/data", file), "utf-8"));
    for (const p of providers) {
      const key = addressKey(p.address);
      if (key && !known.has(key)) known.set(key, { lat: p.lat, lng: p.lng, region: p.region, county: p.county, how: "state" });
    }
  }
  return known;
}

const rejectedMatches: string[] = [];

/**
 * Locate a site, most trusted first: a hand-checked location, then the state's own coordinates for the
 * same building, then the Census geocoder — accepted only when its matched street (and ZIP, on the first
 * try) agrees with the input. The ZIP-less retry covers ZIP typos in the source list.
 */
async function geocode(site: ClinicSite, known: Map<string, GeoResult>): Promise<GeoResult | null> {
  const manual = MANUAL_LOCATIONS[`${site.street}|${site.city}`.toLowerCase()];
  if (manual) return { ...manual, how: "manual" };

  const key = addressKey(`${site.street}, ${site.city}, NY, ${site.zip}`);
  const fromState = key ? known.get(key) : undefined;
  if (fromState) return fromState;

  // The geocoder matches streets, not suites ("1045 James Street Suite 270" -> "1045 James Street")
  const street = site.street.replace(/,?\s+\b(suite|ste|floor|fl|room|rm|unit)\b.*$/i, "").trim();
  const query = { ...site, street };
  return (await geocodeAddress(`${street}, ${site.city}, NY ${site.zip}`, query, true))
    ?? (await geocodeAddress(`${street}, ${site.city}, NY`, query, false));
}

async function geocodeAddress(address: string, site: ClinicSite, requireZip: boolean): Promise<GeoResult | null> {
  const url = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
    + `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const match: CensusMatch | undefined = data.result?.addressMatches?.[0];
      if (!match) return null;
      if (!geocodeMatchAgrees(site.street, site.zip, match.matchedAddress, requireZip)) {
        rejectedMatches.push(`${address} -> ${match.matchedAddress}`);
        return null;
      }
      return {
        how: "census",
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

  const known = loadKnownLocations();
  const cached: CachedProvider[] = [];
  const failed: string[] = [];
  const outside: string[] = [];
  const how: Record<string, number> = {};

  for (const site of candidates) {
    const geo = await geocode(site, known);
    const label = `${site.agency} — ${site.street}, ${site.city} ${site.zip}`;
    if (!geo) { failed.push(label); continue; }

    const region = geo.region ?? getRegion(geo.lat, geo.lng, geo.county);
    if (!region) { outside.push(`${label} (${geo.county ?? "unknown county"})`); continue; }
    how[geo.how ?? "?"] = (how[geo.how ?? "?"] ?? 0) + 1;

    cached.push({
      source: "article16",
      name: site.agency,
      services: [site.type === "main" ? "Article 16 Clinic" : "Article 16 Satellite"],
      detail: `OPWDD program ${site.programId}${site.type === "satellite" ? ` · satellite ${site.siteId}` : ""}`,
      address: `${site.street}, ${site.city}, NY, ${site.zip}`,
      region,
      county: countyName(geo.county),
      phone: formatPhone(site.phone),
      lat: geo.lat,
      lng: geo.lng,
    });
  }

  // The clinic list is dated October 2024; the OPWDD agency directory (data.ny.gov) is newer. When the same agency
  // is in both with a different phone number, use the directory's (run seed-opwdd.ts first).
  const agencyKey = (n: string) => n.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/)
    .filter((t) => t && !["INC", "INCORPORATED", "THE", "OF", "AND", "FOR", "CORP", "CORPORATION", "LLC", "LTD", "CO"].includes(t)).join(" ");
  const directoryPhones = new Map<string, string>();
  const opwdd: CachedProvider[] = JSON.parse(readFileSync(join(process.cwd(), "src/data/opwdd-geocoded.json"), "utf-8"));
  for (const p of opwdd) {
    const name = p.listedName ?? p.name;
    if (p.phone && !directoryPhones.has(agencyKey(name))) directoryPhones.set(agencyKey(name), p.phone);
  }
  const digits = (p?: string) => (p ?? "").replace(/\D/g, "").slice(0, 10);
  const updatedPhones = new Set<string>();
  for (const site of cached) {
    const newer = directoryPhones.get(agencyKey(site.name));
    if (newer && digits(newer) !== digits(site.phone)) {
      updatedPhones.add(`${site.name}: ${site.phone} -> ${newer}`);
      site.phone = newer;
    } else if (newer && newer !== site.phone) {
      site.phone = newer; // same number, but the directory adds an extension
    }
  }
  console.log(`\nPhones updated from the newer OPWDD directory: ${updatedPhones.size}`);
  updatedPhones.forEach((u) => console.log(`  - ${u}`));

  cached.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\nSaved ${cached.length} clinic sites (located by: ${JSON.stringify(how)})`);
  console.log(`Rejected Census matches that did not agree with the input address: ${rejectedMatches.length}`);
  rejectedMatches.forEach((r) => console.log(`  - ${r}`));
  const counts = new Map<string, number>();
  for (const p of cached) counts.set(p.region, (counts.get(p.region) ?? 0) + 1);
  for (const [k, v] of counts) console.log(`  ${k}: ${v}`);
  console.log(`\nOutside the service area: ${outside.length}`);
  console.log(`\nCould not geocode (check if any are in the service area): ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f}`));

  writeFileSync(join(process.cwd(), "src/data/article16-geocoded.json"), JSON.stringify(cached, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
