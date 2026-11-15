/**
 * Seed script for home health agencies that serve people with intellectual and developmental disabilities.
 *
 * Source of the IDD link: the NYS Department of Health list of "Special Needs" Certified Home Health Agencies
 * (https://profiles.health.ny.gov/home_care/special_needs). These CHHAs are approved by DOH to serve people
 * who would otherwise need care in a program licensed by OPWDD (or OMH). We keep the ones approved for the
 * OPWDD population that serve at least one county in our service area.
 *
 * Each agency is then located with the DOH Health Facility General Information dataset (its CHHA office) and
 * must be found in the Medicaid Enrolled Provider Listing as a Certified Home Health Agency, so every agency
 * on the map is confirmed to accept Medicaid.
 *
 * Run with: bun run src/lib/seed-home-care.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { addressKey } from "./api";
import { countyName, countyToRegion, getRegion } from "./geo-utils";
import { REGIONS } from "./constants";
import { formatPhone, titleCaseAddress } from "./seed-utils";

import type { CachedProvider, Region } from "@/types/providers";

const SPECIAL_NEEDS_URL = "https://profiles.health.ny.gov/home_care/special_needs";
const FACILITIES_URL = "https://health.data.ny.gov/resource/vn5v-hh5r.json";
const MEDICAID_URL = "https://health.data.ny.gov/resource/keti-qx5t.json";

interface SpecialNeedsAgency {
  profileId: string;
  name: string;
  population: string;
  counties: string[];
}

interface Facility {
  fac_id: string;
  facility_name: string;
  address1?: string;
  city?: string;
  fac_zip?: string;
  fac_phone?: string;
  county?: string;
  latitude?: string;
  longitude?: string;
}

interface MedicaidRow {
  mmis_id?: string;
  mmis_name?: string;
  service_address?: string;
  city?: string;
  zip_code?: string;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "").trim();

/** Parse the rows of the special-needs table: name (with profile link), population served, counties served. */
export function parseSpecialNeeds(html: string): SpecialNeedsAgency[] {
  const rows = html.match(/<tr type='CHHA'>[\s\S]*?<\/tr>/g) ?? [];
  return rows.map((row) => {
    const link = row.match(/href='\/home_care\/view\/(\d+)'>([^<]+)<\/a>/);
    const population = row.match(/class='pop_col'>([\s\S]*?)<\/td>/)?.[1] ?? "";
    const counties = row.match(/class='county_col'>([\s\S]*?)<\/td>/)?.[1] ?? "";
    return {
      profileId: link?.[1] ?? "",
      name: decode(link?.[2] ?? ""),
      population: decode(population),
      counties: decode(counties).split(",").map((c) => c.trim()).filter(Boolean),
    };
  }).filter((a) => a.name);
}

const normName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\b(INC|LLC|THE|CORP|CORPORATION)\b/g, " ").replace(/\s+/g, " ").trim();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

async function main() {
  const html = process.argv[2] ? readFileSync(process.argv[2], "utf-8") : await (await fetch(SPECIAL_NEEDS_URL)).text();
  const agencies = parseSpecialNeeds(html);
  console.log(`Special needs CHHAs listed by DOH: ${agencies.length}`);

  const cached: CachedProvider[] = [];
  for (const agency of agencies) {
    const serves = [...new Set(agency.counties.map(countyToRegion).filter((r): r is Region => r !== null))]
      .sort((a, b) => REGIONS.indexOf(a) - REGIONS.indexOf(b));
    if (!/Developmental Disabilities/i.test(agency.population)) {
      console.log(`  skip (population is not OPWDD): ${agency.name} — ${agency.population}`);
      continue;
    }
    if (serves.length === 0) {
      console.log(`  skip (serves no county in the service area): ${agency.name} — ${agency.counties.join(", ")}`);
      continue;
    }

    // CHHA office from the DOH facility dataset
    const where = `description='Certified Home Health Agency' AND upper(facility_name)='${agency.name.toUpperCase().replace(/'/g, "''")}'`;
    const [facility] = await getJson<Facility[]>(`${FACILITIES_URL}?$where=${encodeURIComponent(where)}`);
    if (!facility?.latitude) {
      console.log(`  skip (CHHA office not found in DOH facility data): ${agency.name}`);
      continue;
    }
    const lat = Number(facility.latitude);
    const lng = Number(facility.longitude);
    const address = [titleCaseAddress(facility.address1), facility.city, "NY", facility.fac_zip].filter(Boolean).join(", ");

    // Medicaid enrollment: a Certified Home Health Agency at the same address (agencies may enroll under another name)
    const mWhere = `profession_or_service='CERTIFIED HOME HEALTH AGENCY' AND zip_code like '${facility.fac_zip}%'`;
    const enrolled = await getJson<MedicaidRow[]>(`${MEDICAID_URL}?$limit=200&$select=mmis_id,mmis_name,service_address,city,zip_code&$where=${encodeURIComponent(mWhere)}`);
    // Several agencies can share a building, so among the enrollments at this address prefer the one whose name
    // starts with the agency's first word ("Extended Home Care" -> "EXTENDED NURSING PERSONNEL CHHA LLC").
    const key = addressKey(address);
    const firstWord = normName(agency.name).split(" ")[0];
    const sameName = (m: MedicaidRow) => normName(m.mmis_name ?? "").split(" ")[0] === firstWord;
    const atAddress = enrolled.filter((m) => addressKey(`${m.service_address}, ${m.city}, NY, ${m.zip_code}`) === key);
    let match = atAddress.find(sameName) ?? enrolled.find(sameName) ?? (atAddress.length === 1 ? atAddress[0] : undefined);
    if (!match) {
      // Some agencies enroll from another office (e.g. People Inc.: DOH lists Buffalo, Medicaid lists Williamsville)
      const byName = `profession_or_service='CERTIFIED HOME HEALTH AGENCY' AND upper(mmis_name) like '${firstWord.replace(/'/g, "''")}%'`;
      const sameNameAnywhere = await getJson<MedicaidRow[]>(`${MEDICAID_URL}?$limit=20&$select=mmis_id,mmis_name,service_address,city,zip_code&$where=${encodeURIComponent(byName)}`);
      match = sameNameAnywhere.find(sameName);
    }
    if (!match) {
      console.log(`  skip (no Medicaid CHHA enrollment found at ${address}): ${agency.name}`);
      continue;
    }

    const region = getRegion(lat, lng, facility.county);
    if (!region) {
      console.log(`  skip (office outside the service area): ${agency.name}`);
      continue;
    }

    cached.push({
      source: "homecare",
      name: agency.name,
      services: ["Special Needs Home Health"],
      detail: `Certified home health agency approved by NYS DOH to serve: ${agency.population}. `
        + `Medicaid-enrolled as ${match.mmis_name} (ID ${match.mmis_id}).`,
      address,
      region,
      county: countyName(facility.county),
      serves,
      phone: formatPhone(facility.fac_phone),
      website: `https://profiles.health.ny.gov/home_care/view/${agency.profileId}`,
      lat,
      lng,
    });
    console.log(`  added: ${agency.name} (${address}); serves ${serves.join(", ")}; Medicaid: ${match.mmis_name}`);
  }

  writeFileSync(join(process.cwd(), "src/data/homecare-geocoded.json"), JSON.stringify(cached, null, 2));
  console.log(`\nSaved ${cached.length} home health agencies`);
}

main().catch((e) => { console.error(e); process.exit(1); });
