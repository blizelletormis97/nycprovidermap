/**
 * Seed script for ABA (applied behavior analysis) practices enrolled in NY Medicaid.
 *
 * Source: NY Health Data - Medicaid Enrolled Provider Listing (health.data.ny.gov keti-qx5t), office addresses from
 * the federal NPI Registry (npiregistry.cms.hhs.gov).
 *
 * Practices are group enrollments ("MULTI TYPE GROUP PRACTICE", early intervention, case management) whose name says
 * ABA / applied behavior analysis / licensed behavior analyst. Individual licensed behavior analysts are not shown.
 * The listing's medicaid_type says how each is enrolled:
 *   FFS - fee-for-service: bills "straight" Medicaid; may also be in Medicaid managed care plan networks
 *   MCO - enrolled only to take part in Medicaid managed care plans
 *   (OPRA - only orders or refers; cannot bill Medicaid, so not shown)
 * The listing does not say which managed care plans a practice is in, so popups ask families to check with their plan.
 *
 * Practices that serve people at home list many service addresses (often clients' homes), so only one pin is shown
 * per practice, at its NPI office address; the counties of its service addresses decide the areas it serves.
 *
 * Run with: bun run src/lib/seed-aba.ts (then link-agencies.ts)
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { countyName, countyToRegion, getRegion } from "./geo-utils";
import { fullName } from "./full-names";
import { formatPhone, geocodeMatchAgrees, streetTokens, titleCaseAddress } from "./seed-utils";

import type { CachedProvider, Region } from "@/types/providers";

const MEDICAID_URL = "https://health.data.ny.gov/resource/keti-qx5t.json";
const NPI_URL = "https://npiregistry.cms.hhs.gov/api/?version=2.1&number=";

const ABA_NAME = ["%BEHAVIOR ANAL%", "%BEHAVIORAL ANAL%", "%APPLIED BEHAVIOR%", "%LICENSED BEHAVIOR%", "%LICENSE BEHAVIOR%",
  "% ABA %", "ABA %", "% ABA"];
// Social work and mental health practices whose names happen to say "applied behavioral"
const NOT_ABA = /\b(LCSW|MENTAL HEALTH|SCIENCES)\b/;
const GROUP_TYPES = ["MULTI TYPE GROUP PRACTICE", "EARLY INTERVENTION OR SCHOOL SUPPORTIVE", "CASE MANAGEMENT SERVICES"];

interface MedicaidRow {
  mmis_id: string; npi?: string; mmis_name: string; medicaid_type: string; profession_or_service: string;
  service_address?: string; city?: string; zip_code?: string; county?: string; telephone?: string; latitude?: string; longitude?: string;
}
interface NpiAddress { address_purpose: string; address_1: string; address_2?: string; city: string; state: string; postal_code: string; telephone_number?: string }
interface NpiResult { basic: { organization_name?: string; status?: string }; addresses: NpiAddress[]; taxonomies?: { desc: string }[] }

const getJson = async <T>(url: string): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
};

const stripSuite = (street: string) => street.replace(/,?\s+\b(suite|ste|floor|fl|room|rm|unit|apt)\b.*$/i, "").replace(/\s+#\s*\S+$/, "").trim();
const sameStreet = (a: string, b: string) => streetTokens(stripSuite(a)).join(" ") === streetTokens(stripSuite(b)).join(" ");

async function geocode(street: string, city: string, zip: string): Promise<{ lat: number; lng: number; county?: string } | null> {
  const s = stripSuite(street);
  const url = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
    + `?address=${encodeURIComponent(`${s}, ${city}, NY ${zip}`)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;
  const data = await getJson<{ result?: { addressMatches?: { coordinates: { x: number; y: number }; matchedAddress: string; geographies?: { Counties?: { NAME: string }[] } }[] } }>(url);
  const match = data.result?.addressMatches?.[0];
  if (!match || !geocodeMatchAgrees(s, zip, match.matchedAddress, false)) return null;
  return { lat: match.coordinates.y, lng: match.coordinates.x, county: match.geographies?.Counties?.[0]?.NAME };
}

async function fetchRows(): Promise<MedicaidRow[]> {
  const nameWhere = ABA_NAME.map((p) => `upper(mmis_name) like '${p}'`).join(" OR ");
  const typeWhere = GROUP_TYPES.map((t) => `'${t}'`).join(",");
  const where = `medicaid_type in ('FFS','MCO') AND profession_or_service in (${typeWhere}) AND (${nameWhere})`;
  const rows: MedicaidRow[] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = await getJson<MedicaidRow[]>(`${MEDICAID_URL}?$limit=5000&$offset=${offset}&$order=mmis_id&$where=${encodeURIComponent(where)}`);
    rows.push(...page);
    if (page.length < 5000) return rows;
  }
}

async function main() {
  const rows = await fetchRows();
  // One practice per NPI (a practice can have several Medicaid enrollments, e.g. group practice and early intervention)
  const practices = new Map<string, MedicaidRow[]>();
  for (const r of rows) {
    if (NOT_ABA.test(r.mmis_name.toUpperCase()) && !/\bABA\b|BEHAVIOR ANALY/.test(r.mmis_name.toUpperCase())) continue;
    const key = r.npi || r.mmis_id;
    practices.set(key, [...(practices.get(key) ?? []), r]);
  }
  console.log(`Medicaid listing: ${rows.length} rows, ${practices.size} ABA practices`);

  const cached: CachedProvider[] = [];
  const skipped: string[] = [];
  for (const [npiNumber, enrollments] of practices) {
    const first = enrollments[0];
    const npi = first.npi ? (await getJson<{ results?: NpiResult[] }>(NPI_URL + first.npi)).results?.[0] : undefined;
    const location = npi?.addresses.find((a) => a.address_purpose === "LOCATION");

    // Office: the NPI practice location when it is in New York, else the practice's only Medicaid address
    const addresses = [...new Map(enrollments.filter((r) => r.service_address).map((r) => [`${r.service_address}|${r.city}`, r])).values()];
    let street: string, city: string, zip: string;
    let geo: { lat: number; lng: number; county?: string } | null = null;
    if (location && location.state === "NY") {
      street = titleCaseAddress([location.address_1, location.address_2].filter(Boolean).join(" "))!;
      city = titleCaseAddress(location.city)!;
      zip = location.postal_code.slice(0, 5);
      const enrolledHere = addresses.find((r) => sameStreet(r.service_address!, location.address_1) && r.latitude);
      geo = enrolledHere
        ? { lat: Number(enrolledHere.latitude), lng: Number(enrolledHere.longitude), county: enrolledHere.county }
        : await geocode(location.address_1, location.city, zip);
      // The geocoder misses some route and unit addresses: use the state's coordinates for the practice's
      // enrolled address in the same ZIP code
      const sameZip = addresses.filter((r) => (r.zip_code ?? "").startsWith(zip) && r.latitude);
      if (!geo && sameZip.length === 1) geo = { lat: Number(sameZip[0].latitude), lng: Number(sameZip[0].longitude), county: sameZip[0].county };
    } else if (addresses.length === 1 && addresses[0].latitude) {
      const only = addresses[0];
      street = titleCaseAddress(only.service_address)!;
      city = titleCaseAddress(only.city)!;
      zip = (only.zip_code ?? "").slice(0, 5);
      geo = { lat: Number(only.latitude), lng: Number(only.longitude), county: only.county };
    } else {
      skipped.push(`${first.mmis_name} (office outside NY: ${location?.city ?? "?"}, ${location?.state ?? "?"})`);
      continue;
    }
    if (!geo) { skipped.push(`${first.mmis_name} (could not place ${street}, ${city})`); continue; }
    const region = getRegion(geo.lat, geo.lng, geo.county);
    if (!region) { skipped.push(`${first.mmis_name} (outside New York State)`); continue; }

    const types = new Set(enrollments.map((r) => r.medicaid_type));
    const straight = types.has("FFS");
    const areas = [...new Set(enrollments.map((r) => countyToRegion(r.county)).filter((r): r is Region => Boolean(r)))];
    const serves = areas.length > 1 || (areas.length === 1 && areas[0] !== region) ? [...new Set([region, ...areas])] : undefined;
    const listed = npi?.basic.organization_name ?? first.mmis_name;
    const ids = [...new Set(enrollments.map((r) => r.mmis_id))];

    cached.push({
      source: "aba",
      name: fullName(listed),
      listedName: listed,
      services: [straight ? "ABA Therapy (Straight Medicaid)" : "ABA Therapy (Managed Medicaid Only)"],
      detail: straight
        ? `Applied behavior analysis (ABA). Accepts straight (fee-for-service) Medicaid. For managed Medicaid, ask whether `
          + `they are in your health plan's network. Medicaid ID ${ids.join(", ")}.`
        : `Applied behavior analysis (ABA). Enrolled in Medicaid only for managed care plans: ask whether they are in your `
          + `health plan's network. Medicaid ID ${ids.join(", ")}.`,
      address: `${street}, ${city}, NY, ${zip}`,
      region,
      county: countyName(geo.county),
      ...(serves ? { serves } : {}),
      phone: formatPhone(location?.telephone_number ?? first.telephone),
      lat: geo.lat,
      lng: geo.lng,
    });
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(process.cwd(), "src/data/aba-geocoded.json"), JSON.stringify(cached, null, 2));
  const straightCount = cached.filter((p) => p.services[0].includes("Straight")).length;
  console.log(`Saved ${cached.length} ABA practices (${straightCount} straight Medicaid, ${cached.length - straightCount} managed care only)`);
  console.log(`Skipped ${skipped.length}:`);
  skipped.forEach((s) => console.log(`  - ${s}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
