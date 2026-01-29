/**
 * Seed script to parse CMS Doctors & Clinicians (DAC) CSV data and geocode
 * confirmed Medicare-enrolled providers in Manhattan and Bronx.
 *
 * Data source: CMS DAC National Downloadable File
 * https://data.cms.gov/provider-data/dataset/mj5m-pzi6
 *
 * Run with: bun run src/lib/seed-medicare.ts
 */

import { createReadStream, writeFileSync } from "fs";
import { join } from "path";
import { parse } from "csv-parse";
import { isInManhattanOrBronx, getManhattanBronxBbox } from "./geo-utils";

import type { CachedProvider } from "@/types/providers";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

if (!MAPBOX_TOKEN) {
  console.error("Error: NEXT_PUBLIC_MAPBOX_TOKEN environment variable is required");
  process.exit(1);
}

// CMS specialties we care about, mapped to our app categories
const SPECIALTY_MAP: Record<string, string> = {
  // Primary Care / Physicians
  "INTERNAL MEDICINE": "Physician",
  "FAMILY PRACTICE": "Physician",
  "GENERAL PRACTICE": "Physician",
  "HOSPITALIST": "Physician",
  "GERIATRIC MEDICINE": "Physician",
  "PEDIATRIC MEDICINE": "Physician",
  "PSYCHIATRY": "Psychiatry",
  "NURSE PRACTITIONER": "Physician",
  "PHYSICIAN ASSISTANT": "Physician",

  // Mental Health
  "CLINICAL PSYCHOLOGIST": "Psychology",
  "CLINICAL SOCIAL WORKER": "Social Work",
  "MENTAL HEALTH COUNSELOR": "Mental Health Counseling",

  // Dental
  "DENTIST": "Dental",
  "PEDIATRIC DENTISTRY": "Dental",

  // Therapy Services (critical for OPWDD members)
  "PHYSICAL THERAPIST IN PRIVATE PRACTICE": "Physical Therapy",
  "OCCUPATIONAL THERAPIST IN PRIVATE PRACTICE": "Occupational Therapy",
  "QUALIFIED SPEECH LANGUAGE PATHOLOGIST": "Speech Therapy",
  "PHYSICAL MEDICINE AND REHABILITATION": "Rehab Medicine",

  // Other Healthcare
  "PODIATRY": "Podiatry",
  "OPTOMETRY": "Optometry",
  "REGISTERED DIETITIAN OR NUTRITION PROFESSIONAL": "Nutrition",
  "NEUROLOGY": "Neurology",
  "ALLERGY/IMMUNOLOGY": "Allergy/Immunology",
  "CHIROPRACTIC": "Chiropractic",
};

const VALID_SPECIALTIES = new Set(Object.keys(SPECIALTY_MAP));
const TARGET_CITIES = new Set(["NEW YORK", "BRONX"]);

// Actual CMS CSV column names (trimmed — some headers have trailing tabs)
interface DACRow {
  NPI: string;
  "Provider Last Name": string;
  "Provider First Name": string;
  Cred: string;
  pri_spec: string;
  "Facility Name": string;
  adr_ln_1: string;
  adr_ln_2: string;
  "City/Town": string;
  State: string;
  "ZIP Code": string;
  "Telephone Number": string;
  ind_assgn: string;
  [key: string]: string;
}

interface ParsedProvider {
  npi: string;
  name: string;
  credential: string;
  specialty: string;
  orgName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  acceptsAssignment: string;
  addressKey: string;
}

interface MapboxFeature {
  center: [number, number];
}
interface MapboxResponse {
  features?: MapboxFeature[];
}

function formatPhone(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits.length > 0 ? raw : undefined;
}

function makeAddressKey(address1: string, zip: string): string {
  // Normalize: uppercase, collapse whitespace, strip punctuation
  const normAddr = address1.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const normZip = zip.replace(/\D/g, "").slice(0, 5);
  return `${normAddr}|${normZip}`;
}

const MAX_RETRIES = 4;

async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<{ lat: number; lng: number } | null> {
  const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
  if (!fullAddress.trim()) return null;

  const bbox = getManhattanBronxBbox().join(",");
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=US&bbox=${bbox}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);

      if (res.status === 429) {
        // Rate limited — back off exponentially
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s, 16s, 32s
        console.warn(`  Rate limited, waiting ${delay / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) return null;

      const data: MapboxResponse = await res.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        if (isInManhattanOrBronx(lat, lng)) return { lat, lng };
      }
      return null;
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Step 1: Stream-parse the CSV and collect providers matching our filters.
 */
async function parseCSV(): Promise<ParsedProvider[]> {
  const csvPath = join(process.cwd(), "src/data/raw/DAC_NationalDownloadableFile.csv");
  console.log(`Parsing CSV from ${csvPath}...`);

  const providers: ParsedProvider[] = [];
  let totalRows = 0;
  let nyMatches = 0;

  return new Promise((resolve, reject) => {
    const parser = createReadStream(csvPath).pipe(
      parse({
        columns: (headers: string[]) => headers.map((h: string) => h.trim()),
        skip_empty_lines: true,
        relax_column_count: true,
      })
    );

    parser.on("data", (row: DACRow) => {
      totalRows++;

      if (totalRows % 500_000 === 0) {
        console.log(`  ...processed ${totalRows.toLocaleString()} rows (${providers.length} matches so far)`);
      }

      // Filter: NY state only
      if (row.State !== "NY") return;
      nyMatches++;

      // Filter: target cities
      const city = (row["City/Town"] || "").toUpperCase().trim();
      if (!TARGET_CITIES.has(city)) return;

      // Filter: relevant specialties
      const specialty = (row.pri_spec || "").toUpperCase().trim();
      if (!VALID_SPECIALTIES.has(specialty)) return;

      // Skip PO Boxes
      const addr1 = (row.adr_ln_1 || "").toUpperCase();
      if (addr1.includes("PO BOX") || addr1.includes("P.O. BOX") || addr1.includes("P O BOX")) {
        return;
      }

      const addressKey = makeAddressKey(row.adr_ln_1 || "", row["ZIP Code"] || "");
      const facilityName = (row["Facility Name"] || "").trim();
      const firstName = (row["Provider First Name"] || "").trim();
      const lastName = (row["Provider Last Name"] || "").trim();

      const personalName = `${firstName} ${lastName}`.trim();

      providers.push({
        npi: row.NPI,
        name: personalName || facilityName || "Unknown",
        credential: (row.Cred || "").trim(),
        specialty,
        orgName: facilityName,
        address1: (row.adr_ln_1 || "").trim(),
        address2: (row.adr_ln_2 || "").trim(),
        city,
        state: row.State,
        zip: (row["ZIP Code"] || "").trim(),
        phone: (row["Telephone Number"] || "").trim(),
        acceptsAssignment: (row.ind_assgn || "").trim(),
        addressKey,
      });
    });

    parser.on("end", () => {
      console.log(`  Total rows processed: ${totalRows.toLocaleString()}`);
      console.log(`  NY state rows: ${nyMatches.toLocaleString()}`);
      console.log(`  Manhattan/Bronx relevant providers: ${providers.length.toLocaleString()}`);
      resolve(providers);
    });

    parser.on("error", reject);
  });
}

/**
 * Step 2: Geocode unique addresses and build final provider list.
 */
async function geocodeProviders(providers: ParsedProvider[]): Promise<CachedProvider[]> {
  // Build address dedup map: addressKey → { first provider with that address, list of all provider indices }
  const addressMap = new Map<
    string,
    {
      address1: string;
      city: string;
      state: string;
      zip: string;
      providerIndices: number[];
    }
  >();

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    if (!addressMap.has(p.addressKey)) {
      addressMap.set(p.addressKey, {
        address1: p.address1,
        city: p.city,
        state: p.state,
        zip: p.zip,
        providerIndices: [],
      });
    }
    addressMap.get(p.addressKey)!.providerIndices.push(i);
  }

  console.log(`\nUnique addresses to geocode: ${addressMap.size.toLocaleString()}`);
  console.log(`Total providers: ${providers.length.toLocaleString()}`);
  console.log(`Dedup ratio: ${(providers.length / addressMap.size).toFixed(1)}x\n`);

  // Geocode each unique address
  const coordsMap = new Map<string, { lat: number; lng: number } | null>();
  let geocoded = 0;
  let failed = 0;
  let idx = 0;
  const total = addressMap.size;

  // Mapbox free tier: 600 req/min = 10/sec. Use batch of 3 + 350ms gap ≈ 8.5/sec
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 350;
  const entries = Array.from(addressMap.entries());

  for (let batchStart = 0; batchStart < entries.length; batchStart += BATCH_SIZE) {
    const batch = entries.slice(batchStart, batchStart + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(([key, addr]) =>
        geocodeAddress(addr.address1, addr.city, addr.state, addr.zip).then((coords) => ({
          key,
          coords,
        }))
      )
    );

    for (const { key, coords } of results) {
      coordsMap.set(key, coords);
      idx++;
      if (coords) {
        geocoded++;
      } else {
        failed++;
      }
    }

    if (idx % 100 === 0 || idx === total) {
      console.log(
        `  Geocoded ${idx.toLocaleString()}/${total.toLocaleString()} addresses (${geocoded} success, ${failed} failed)`
      );
    }

    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  // Build final provider list
  const cached: CachedProvider[] = [];
  const seenNPIs = new Set<string>();

  for (const provider of providers) {
    const coords = coordsMap.get(provider.addressKey);
    if (!coords) continue;

    // Deduplicate by NPI (a provider may appear multiple times with different addresses)
    if (seenNPIs.has(provider.npi)) continue;
    seenNPIs.add(provider.npi);

    const nameParts = [provider.name];
    if (provider.credential) {
      nameParts[0] = `${provider.name}, ${provider.credential}`;
    }

    const fullAddress = [provider.address1, provider.address2, provider.city, provider.state, provider.zip]
      .filter(Boolean)
      .join(", ");

    cached.push({
      source: "medicare",
      name: nameParts[0],
      services: [provider.specialty],
      address: fullAddress,
      lat: coords.lat,
      lng: coords.lng,
      phone: formatPhone(provider.phone),
    });
  }

  return cached;
}

async function main() {
  console.log("=== CMS Doctors & Clinicians (DAC) Medicare Seed ===\n");

  const providers = await parseCSV();

  if (providers.length === 0) {
    console.error("No matching providers found. Check CSV file and filters.");
    process.exit(1);
  }

  const cached = await geocodeProviders(providers);

  console.log(`\n=== Results ===`);
  console.log(`  Total confirmed Medicare providers: ${cached.length.toLocaleString()}`);

  // Summary by specialty
  const byCat = new Map<string, number>();
  for (const p of cached) {
    const cat = SPECIALTY_MAP[p.services[0]] || "Other";
    byCat.set(cat, (byCat.get(cat) || 0) + 1);
  }
  console.log(`  By category:`);
  for (const [cat, count] of Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count.toLocaleString()}`);
  }

  const cachePath = join(process.cwd(), "src/data/medicare-geocoded.json");
  writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  console.log(`\nSaved to ${cachePath}`);
}

main().catch(console.error);
