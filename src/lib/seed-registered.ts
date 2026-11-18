/**
 * Seed script for the therapy and psychology practices on OPWDD's Registered Provider List.
 *
 * Source: https://opwdd.ny.gov/providers/service-providers/registered-provider-list
 * The list names companies that OPWDD-certified agencies may hire under contract (14 NYCRR 633.22). Most of its
 * ~160 names are staffing agencies and bus or ambulette companies, which are not shown. The therapy and psychology
 * practices are, because families may be able to reach them, but the list has names only. So each practice below
 * was matched by hand to its National Provider Identifier (NPI), and this script takes the office address and phone
 * from the federal NPI registry, the NY Medicaid enrollment (if any) from the Medicaid Enrolled Provider Listing, and
 * places the office with the U.S. Census geocoder.
 *
 * Practices whose NPI record could not be matched with confidence are left out: G & E Therapies, Integrated
 * Therapeutic Solutions Inter Fysio, MHH Clinical Services, Premiere Rehabilitation, Sevilla Services and
 * Germain Consulting Services.
 *
 * Run with: bun run src/lib/seed-registered.ts (then link-agencies.ts)
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { countyName, countyToRegion, getRegion } from "./geo-utils";
import { formatPhone, geocodeMatchAgrees, titleCaseAddress } from "./seed-utils";

import type { CachedProvider, Region } from "@/types/providers";

const LIST_URL = "https://opwdd.ny.gov/providers/service-providers/registered-provider-list";
const NPI_URL = "https://npiregistry.cms.hhs.gov/api/?version=2.1&number=";
const MEDICAID_URL = "https://health.data.ny.gov/resource/keti-qx5t.json";

interface Practice {
  /** Name exactly as on OPWDD's list */
  listed: string;
  /** Full name, spelled out */
  name: string;
  npi: string;
  offers: string;
  /** Start of the practice's name in the Medicaid listing (cut at 35 characters there), if enrolled */
  medicaid?: string;
  /** Office address when the NPI record's is out of date (checked against the Medicaid listing) */
  office?: { street: string; city: string; zip: string };
}

export const PRACTICES: Practice[] = [
  { listed: "Access Therapy Group PLLC", name: "Access Therapy Group", npi: "1255641510",
    offers: "physical, occupational and speech therapy and psychology", medicaid: "ACCESS THERAPY GROUP" },
  { listed: "Beacon Therapy Services", name: "Beacon Therapy Services", npi: "1649725250",
    offers: "speech, physical and occupational therapy" },
  { listed: "Caring SLP, Psychology, OT & Nutrition Services, PLLC",
    name: "Caring Speech-Language Pathology, Psychology, Occupational Therapy and Nutrition Services", npi: "1699226217",
    offers: "speech therapy, psychology, occupational therapy and nutrition", medicaid: "CARING SLP" },
  { listed: "Complete SLP, OT, PT & Psychology Services, PLLC",
    name: "Complete Speech-Language Pathology, Occupational Therapy, Physical Therapy and Psychology Services",
    npi: "1437616026", offers: "speech, occupational and physical therapy and psychology", medicaid: "COMPLETE SLP",
    office: { street: "4377 Bronx Boulevard", city: "Bronx", zip: "10466" } },
  { listed: "Comprehensive OT, PT, SLP & Adult Health NP Services, PLLC",
    name: "Comprehensive Occupational Therapy, Physical Therapy, Speech-Language Pathology and Adult Health Nurse Practitioner Services",
    npi: "1619622461", offers: "occupational, physical and speech therapy and nurse practitioner care", medicaid: "COMPREHENSIVE OT PT SLP" },
  { listed: "Essential OT, PT, SLP & Psychology Services PLLC",
    name: "Essential Occupational Therapy, Physical Therapy, Speech-Language Pathology and Psychology Services",
    npi: "1093226805", offers: "occupational, physical and speech therapy and psychology", medicaid: "ESSENTIAL OT" },
  { listed: "Infinite Speech Rehab Services", name: "Infinite Speech Rehabilitation Services", npi: "1588038426",
    offers: "speech therapy" },
  { listed: "Kidz Educational Services, SLP, OT, PT, LMSW, Psychology, Audiology, PLLC",
    name: "Kidz Educational Services", npi: "1538944467",
    offers: "speech, occupational and physical therapy, social work, psychology and audiology" },
  { listed: "Leah Rubin Psychology P.C.", name: "Leah Rubin Psychology", npi: "1427942259",
    offers: "psychology and neuropsychology" },
  { listed: "New Hartford Psychiatric Services", name: "New Hartford Psychiatric Services", npi: "1619004355",
    offers: "psychiatry and neuropsychology", medicaid: "NEW HARTFORD PSYCHIATRIC" },
  { listed: "NPORT, PLLC.", name: "NPORT (Nursing, Physical and Occupational Therapy and Speech-Language Pathology Services)",
    npi: "1972876084", offers: "nursing, physical and occupational therapy and speech therapy" },
  { listed: "Optimized Independence OT PLLC", name: "Optimized Independence Occupational Therapy", npi: "1093235707",
    offers: "occupational therapy", medicaid: "OPTIMIZED INDEPENDENCE" },
  { listed: "Rajeev Puttaswamy Speech Services, PLL", name: "Rajeev Puttaswamy Speech Services", npi: "1154857266",
    offers: "speech therapy", medicaid: "RAJEEV PUTTASWAMY" },
  { listed: "Restore Occupational & Physical Therapy, Speech Language Pathology & Nutrition, PLLC",
    name: "Restore Occupational and Physical Therapy, Speech-Language Pathology and Nutrition", npi: "1679946586",
    offers: "occupational, physical and speech therapy and nutrition", medicaid: "RESTORE OCCUPATIONAL" },
  { listed: "Speech To Go PLLC", name: "Speech To Go", npi: "1437992724", offers: "speech therapy", medicaid: "SPEECH TO GO" },
  { listed: "Superior Clinical Care Pllc", name: "Superior Clinical Care", npi: "1154487122",
    offers: "clinical therapies", medicaid: "SUPERIOR CLINICAL CARE" },
  { listed: "The Caring PT Group, PLLC", name: "The Caring Physical Therapy Group", npi: "1659896603",
    offers: "physical therapy" },
  { listed: "University Psychiatric Practice, Inc", name: "University Psychiatric Practice", npi: "1588743702",
    offers: "psychiatry", medicaid: "UNIVERSITY PSYCHIATRIC" },
  { listed: "Global Communication Services, Inc.", name: "Global Communication Services", npi: "1275964728",
    offers: "speech therapy", medicaid: "GLOBAL COMMUNICATION SERVICES" },
];

interface NpiAddress { address_purpose: string; address_1: string; city: string; state: string; postal_code: string; telephone_number?: string }
interface MedicaidRow { mmis_id: string; mmis_name: string; county?: string }

const getJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
};

const listKey = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");

async function geocode(street: string, city: string, zip: string): Promise<{ lat: number; lng: number; county?: string } | null> {
  street = street.replace(/,?\s+\b(suite|ste|floor|fl|room|rm|unit)\b.*$/i, "").trim(); // the geocoder matches streets, not suites
  const address = `${street}, ${city}, NY ${zip}`;
  const url = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
    + `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;
  const data = await getJson<{ result?: { addressMatches?: { coordinates: { x: number; y: number }; matchedAddress: string; geographies?: { Counties?: { NAME: string }[] } }[] } }>(url);
  const match = data.result?.addressMatches?.[0];
  if (!match || !geocodeMatchAgrees(street, zip, match.matchedAddress, false)) return null;
  return { lat: match.coordinates.y, lng: match.coordinates.x, county: match.geographies?.Counties?.[0]?.NAME };
}

async function main() {
  // Keep only practices still on OPWDD's current list
  const page = await (await fetch(LIST_URL)).text();
  const table = page.slice(page.indexOf("Registered Providers</th>"), page.indexOf("</table>", page.indexOf("Registered Providers</th>")));
  const onList = new Set([...table.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => listKey(m[1])));
  console.log(`OPWDD Registered Provider List: ${onList.size} names`);

  const cached: CachedProvider[] = [];
  for (const practice of PRACTICES) {
    if (!onList.has(listKey(practice.listed))) { console.log(`  no longer on the list: ${practice.listed}`); continue; }

    const npi = await getJson<{ results?: { addresses: NpiAddress[]; basic: { status?: string } }[] }>(NPI_URL + practice.npi);
    const record = npi.results?.[0];
    const location = record?.addresses.find((a) => a.address_purpose === "LOCATION");
    if (!record || !location || record.basic.status !== "A") { console.log(`  no active NPI record: ${practice.listed}`); continue; }
    const office = practice.office ?? { street: titleCaseAddress(location.address_1)!, city: titleCaseAddress(location.city)!, zip: location.postal_code.slice(0, 5) };

    const geo = await geocode(office.street, office.city, office.zip);
    if (!geo) { console.log(`  could not place ${office.street}, ${office.city}: ${practice.listed}`); continue; }
    const region = getRegion(geo.lat, geo.lng, geo.county);
    if (!region) { console.log(`  outside New York State: ${practice.listed}`); continue; }

    // Medicaid enrollment, and the areas the practice serves (counties of its enrolled service addresses)
    let enrolled: MedicaidRow[] = [];
    if (practice.medicaid) {
      const where = `upper(mmis_name) like '${practice.medicaid.replace(/'/g, "''")}%'`;
      enrolled = await getJson<MedicaidRow[]>(`${MEDICAID_URL}?$limit=500&$select=mmis_id,mmis_name,county&$where=${encodeURIComponent(where)}`);
    }
    const ids = [...new Set(enrolled.map((r) => r.mmis_id))];
    const areas = [...new Set(enrolled.map((r) => countyToRegion(r.county)).filter((r): r is Region => Boolean(r)))];
    const serves = areas.length > 1 ? [...new Set([region, ...areas])] : undefined;

    cached.push({
      source: "registered",
      name: practice.name,
      listedName: practice.listed,
      services: ["OPWDD Registered Therapy Practice"],
      detail: `Offers ${practice.offers}. Registered with OPWDD to work under contract with OPWDD agencies; `
        + `call to ask whether they also see families directly. `
        + (ids.length ? `Enrolled in NY Medicaid (ID ${ids.join(", ")}).` : "Not in the NY Medicaid listing; paid through the agency that hires them."),
      address: `${office.street}, ${office.city}, NY, ${office.zip}`,
      region,
      county: countyName(geo.county),
      ...(serves ? { serves } : {}),
      phone: formatPhone(location.telephone_number),
      lat: geo.lat,
      lng: geo.lng,
    });
    console.log(`  added: ${practice.name} (${office.street}, ${office.city}); Medicaid IDs: ${ids.join(", ") || "none"}${serves ? `; serves ${serves.join(", ")}` : ""}`);
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(process.cwd(), "src/data/registered-geocoded.json"), JSON.stringify(cached, null, 2));
  console.log(`\nSaved ${cached.length} registered therapy practices`);
}

main().catch((e) => { console.error(e); process.exit(1); });
