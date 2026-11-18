/**
 * Seed script for CDPAP facilitators: the community organizations PPL (Public Partnerships LLC, New York's single
 * statewide fiscal intermediary for the Consumer Directed Personal Assistance Program since April 1, 2025) has
 * authorized to help people enroll in CDPAP and with PPL payroll and timekeeping.
 *
 * Source: https://pplfirst.com/cdpap-facilitators/ ("Only organizations listed here are authorized PPL facilitators")
 * Each facilitator's office locations are placed with the U.S. Census geocoder; the counties it serves (or "All")
 * decide the map areas it is shown in.
 *
 * Run with: bun run src/lib/seed-cdpap.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { countyName, countyToRegion, getRegion } from "./geo-utils";
import { OPWDD_REGIONS, REGIONS } from "./constants";
import { formatPhone, geocodeMatchAgrees } from "./seed-utils";

import type { CachedProvider, Region } from "@/types/providers";

const PAGE_URL = "https://pplfirst.com/cdpap-facilitators/";

export interface Facilitator {
  name: string;
  website?: string;
  phone?: string;
  counties: string;
  languages?: string;
  focus?: string;
  specialty?: string;
  offices: string[];
}

const decode = (s: string) => s
  .replace(/&#8217;|&#039;|&#39;|&rsquo;/g, "'").replace(/&#8211;|&#8212;/g, "-").replace(/&#8220;|&#8221;|&quot;/g, '"')
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Parse the facilitator cards: an <h4> name followed by labeled paragraphs. */
export function parseFacilitators(html: string): Facilitator[] {
  const blocks = html.split(/<h4\b[^>]*>/).slice(1);
  return blocks.map((block) => {
    const name = decode(block.slice(0, block.indexOf("</h4>")).replace(/<[^>]+>/g, "")).trim();
    const body = block.slice(block.indexOf("</h4>"));
    const lines = decode(body.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, ""))
      .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const after = (label: RegExp) => {
      const i = lines.findIndex((l) => label.test(l));
      return i >= 0 ? lines[i + 1] : undefined;
    };
    const officeStart = lines.findIndex((l) => /^Office Locations?$|^Office Location$/i.test(l) || /^s$/.test(l) && /^Office Location/i.test(lines[lines.indexOf(l) - 1] ?? ""));
    const offices: string[] = [];
    if (officeStart >= 0) {
      for (const l of lines.slice(officeStart + 1)) {
        if (/^s$/.test(l)) continue; // "Office Location" + "s" split across tags
        if (!/\bNY\b,?\s*\d{5}/.test(l)) break;
        if (/mailing/i.test(l)) continue; // corporate mailing addresses are not offices
        offices.push(l.replace(/^[^:]*Address:\s*/i, "").replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s*\([^)]*\)/g, "").trim());
      }
    }
    const website = body.match(/Website:\s*<a[^>]+href="([^"]+)"/)?.[1] ?? lines.find((l) => /^Website:/.test(l))?.replace(/^Website:\s*/, "");
    return {
      name,
      website: website ? (/^https?:/.test(website) ? decode(website) : `https://${decode(website)}`).replace(/[?&]utm_[^&]+/g, "").replace(/\?$/, "") : undefined,
      phone: lines.find((l) => /^Phone:/.test(l))?.replace(/^Phone:\s*/, ""),
      counties: after(/^Counties Served$/i) ?? "",
      languages: after(/^Languages Spoken$/i),
      focus: after(/^Focus$/i),
      specialty: lines.find((l) => /^Speciali[sz]/i.test(l)),
      offices,
    };
  }).filter((f) => f.name && f.offices.length > 0);
}

const ALL_COUNTIES = OPWDD_REGIONS.flatMap((r) => r.counties);
/** "Cattaraugas", "Chatauqua", "St Lawrence", "Manhattan" -> map area */
function areaFor(county: string): Region | null {
  const direct = countyToRegion(county);
  if (direct) return direct;
  const key = county.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  const close = ALL_COUNTIES.find((c) => c.toUpperCase().replace(/[^A-Z]/g, "").startsWith(key));
  return close ? countyToRegion(close) : null;
}

/** "92-12 E 147th Place, 2nd Fl, Jamaica, NY 11435" -> street, city, ZIP */
function splitAddress(line: string): { street: string; city: string; zip: string } | null {
  // "271 East First Street Corning, NY 14830" has no comma before the city: the geocoder works the city out
  const m = line.match(/^(.*),\s*([^,]+?),?\s+NY,?\s*(\d{5})/) ?? line.match(/^()([^,]+?),?\s+NY,?\s*(\d{5})/);
  if (!m) return null;
  if (!m[1]) return { street: m[2].replace(/\s+(suite|ste)\s+\S+/i, "").replace(/\.$/, "").trim(), city: "", zip: m[3] };
  const street = m[1].split(",").map((p) => p.trim())
    .filter((p) => !/^(suite|ste|floor|fl|room|rm|unit|lower level|\d+(st|nd|rd|th) (fl|floor))\b/i.test(p))[0];
  return { street: street.replace(/\s+(suite|ste|#)\s*\S+$/i, "").replace(/\.$/, ""), city: m[2].trim(), zip: m[3] };
}

async function geocode(street: string, city: string, zip: string): Promise<{ lat: number; lng: number; county?: string } | null> {
  street = street.replace(/\bNY-(\d+)/gi, "State Route $1").replace(/\bPre Emption\b/i, "Preemption");
  const url = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
    + `?address=${encodeURIComponent(`${street}, ${city}, NY ${zip}`)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { result?: { addressMatches?: { coordinates: { x: number; y: number }; matchedAddress: string; geographies?: { Counties?: { NAME: string }[] } }[] } };
      const match = data.result?.addressMatches?.[0];
      if (!match) return null;
      // When the city was run into the street ("... First Street Corning"), compare without the matched city
      const matchedCity = match.matchedAddress.split(",")[1]?.trim() ?? "";
      const streetOnly = city ? street : street.replace(new RegExp(`\\s+${matchedCity.replace(/[^A-Z ]/gi, "")}$`, "i"), "");
      if (!geocodeMatchAgrees(streetOnly, zip, match.matchedAddress, false)) return null;
      return { lat: match.coordinates.y, lng: match.coordinates.x, county: match.geographies?.Counties?.[0]?.NAME };
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

const IDD_FOCUS = /developmental disabilit|intellectual|OPWDD|autism|down syndrome/i;
const displayName = (name: string) => name.replace(/,?\s+(Inc\.?|LLC|L\.L\.C\.|Corp\.?)$/i, "").replace(/“|”/g, '"').trim();

async function main() {
  const res = await fetch(PAGE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${PAGE_URL}`);
  const facilitators = parseFacilitators(await res.text());
  console.log(`PPL CDPAP facilitators: ${facilitators.length}`);

  const cached: CachedProvider[] = [];
  const notPlaced: string[] = [];
  for (const f of facilitators) {
    const allAreas = /^all\b/i.test(f.counties.trim());
    const areas = allAreas ? [...REGIONS] : [...new Set(f.counties.split(/,|\band\b/).map((c) => c.trim()).filter(Boolean)
      .map(areaFor).filter((r): r is Region => Boolean(r)))];
    const idd = IDD_FOCUS.test(`${f.focus ?? ""} ${f.specialty ?? ""}`);

    for (const [i, office] of f.offices.entries()) {
      const parts = splitAddress(office);
      const geo = parts ? await geocode(parts.street, parts.city, parts.zip) : null;
      if (!parts || !geo) { notPlaced.push(`${f.name}: ${office}`); continue; }
      const region = getRegion(geo.lat, geo.lng, geo.county);
      if (!region) { notPlaced.push(`${f.name}: ${office} (outside New York State)`); continue; }
      const serves = [...new Set([region, ...areas])];

      cached.push({
        source: "cdpap",
        name: displayName(f.name),
        listedName: f.name,
        services: [idd ? "CDPAP Facilitator (Developmental Disabilities Focus)" : "CDPAP Facilitator"],
        detail: [
          `Authorized PPL facilitator for CDPAP (consumer directed personal assistance): helps you enroll, and with PPL payroll and timekeeping.${i === 0 ? " Head office." : ""}`,
          `Counties served: ${allAreas ? "all of New York State" : f.counties}.`,
          f.languages ? `Languages: ${f.languages.replace(/\.$/, "")}.` : "",
          f.focus ? `Focus: ${f.focus.replace(/\.$/, "")}.` : "",
        ].filter(Boolean).join(" "),
        address: office,
        region,
        county: countyName(geo.county),
        ...(serves.length > 1 ? { serves } : {}),
        phone: formatPhone(f.phone?.split(/\s{2,}|Phone:/)[0]),
        website: f.website,
        lat: geo.lat,
        lng: geo.lng,
      });
    }
  }

  cached.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(process.cwd(), "src/data/cdpap-geocoded.json"), JSON.stringify(cached, null, 2));
  const orgs = new Set(cached.map((p) => p.name)).size;
  console.log(`Saved ${cached.length} offices of ${orgs} facilitators`);
  console.log(`Offices not placed: ${notPlaced.length}`);
  notPlaced.forEach((n) => console.log(`  - ${n}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
