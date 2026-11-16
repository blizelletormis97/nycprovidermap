/**
 * Add websites to Article 16 clinics, Medicaid IDD sites and home health agencies, taken from the
 * OPWDD agency directory (NY Open Data, the only one of our sources that lists websites).
 *
 * Clinic and Medicaid records name the same agencies in many ways ("NYS ARC MONROE COUNTY CHAPTER",
 * "MONROE CO CHAP NYSARC DAY", "UCP QUEENS ICF B"), so names are compared as sets of words after expanding
 * abbreviations and dropping program codes (DAY, SPV, ICF...). State-operated OPWDD offices and clinics get
 * OPWDD's own website. Matches were checked by hand; the few wrong ones are listed in NOT_SAME_AGENCY.
 *
 * Run after seed-opwdd.ts, seed-medicaid.ts, seed-home-care.ts and seed-article16.ts:
 *   bun run src/lib/link-websites.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { CachedProvider } from "@/types/providers";

const OPWDD_WEBSITE = "https://opwdd.ny.gov";

const STOP = new Set(["INC", "INCORPORATED", "THE", "OF", "AND", "FOR", "CORP", "CORPORATION", "LLC", "LTD", "CO", "A", "F", "W", "WITH", "OR", "IN"]);
// Medicaid program codes and site words that are not part of the agency name
const PROGRAM_WORDS = new Set(["DAY", "SPV", "SPT", "ICF", "IRA", "CLINIC", "MULTI", "HOUSE", "HOME", "AHRH"]);
const ABBREVIATIONS: Record<string, string> = {
  SVCS: "SERVICES", SVC: "SERVICES", SRVS: "SERVICES", SRV: "SERVICES", SERVS: "SERVICES", SERVICE: "SERVICES",
  CTR: "CENTER", CNTR: "CENTER", CENTRE: "CENTER", ASSOC: "ASSOCIATION", ASSN: "ASSOCIATION", ASSOCIATIONS: "ASSOCIATION",
  DEVELOP: "DEVELOPMENTAL", DEV: "DEVELOPMENTAL", DISAB: "DISABILITIES", DISABIL: "DISABILITIES", DD: "DEVELOPMENTAL DISABILITIES",
  CNTY: "COUNTY", CTY: "COUNTY", COUNTIES: "COUNTY", CHAP: "CHAPTER", PRGRM: "PROGRAM", PROGR: "PROGRAM", PROGRAMS: "PROGRAM",
  CHLDRN: "CHILDREN", CHILDRENS: "CHILDREN", CHAR: "CHARITIES", COMM: "COMMUNITY", CNCL: "COUNCIL", ASST: "ASSISTANCE",
  NY: "NEW YORK", INSTITUTES: "INSTITUTE", INSTITUT: "INSTITUTE", INST: "INSTITUTE", APP: "APPLIED", DYN: "DYNAMICS", DYNA: "DYNAMICS",
  UCP: "UNITED CEREBRAL PALSY", UCPA: "UNITED CEREBRAL PALSY ASSOCIATION", ST: "SAINT", MT: "MOUNT", NEUROL: "NEUROLOGICALLY",
  OPP: "OPPORTUNITIES", OPPORTUNITY: "OPPORTUNITIES", GR: "GROUP", GRHM: "GROUP HOME", HM: "HOME",
};

// State-operated OPWDD offices and clinics (DDSOs, DDSOOs, developmental centers)
const STATE_OPERATED = /\bDDSO|DEVELOPMENTAL DISABILITIES SERVICES? OFFICE|\bDDSOO\b|\bDC\b|STATE OPERATED|^OPWDD/i;

// Name matches checked by hand and found to be different agencies: [provider name pattern, directory agency pattern]
const NOT_SAME_AGENCY: [RegExp, RegExp][] = [
  [/^ADVOCATES FOR SERVICES/i, /^ADVOCATES INCORPORATED/i],
  [/^AUTISTIC SERVICES/i, /NASSAU\/SUFFOLK SERVICES FOR THE AUTISTIC/i],
  [/^CAPABILITIES PARTNERSHIP/i, /^CAPABILITIES/i],
  [/^RESOURCE CTR-INDEP/i, /THE RESOURCE CENTER/i],
  [/^CHEMLU/i, /CENTER F\/DEVELOPMENTAL/i],
  [/^LONG ISLAND SELECT HEALTHCARE/i, /LONG ISLAND HOME/i],
  [/^ONONDAGA COMM(UNITY)? LIVING/i, /^COMMUNITY LIVING CORPORATION/i],
  [/^LIBERTY HOUSE FOUNDATION/i, /^LIBERTY HOUSE/i],
  [/^PROGRAM DEVELOPMENT INC/i, /^PROGRAM DEVELOPMENT SERVICES/i],
  [/^UNITED CEREBRAL PALSY ASSOCIATIONS$/i, /.*/],
];

function words(name: string): string[] {
  const s = name.toUpperCase().replace(/&/g, " AND ").replace(/\//g, " ").replace(/NYSARC/g, "NYS ARC").replace(/NYS ARC/g, "ARC")
    .replace(/[^A-Z0-9 ]/g, " ");
  const out: string[] = [];
  for (const t of s.split(/\s+/).filter(Boolean)) {
    for (const w of (ABBREVIATIONS[t] ?? t).split(" ")) {
      if (STOP.has(w) || PROGRAM_WORDS.has(w) || /^\d/.test(w)) continue;
      out.push(w);
    }
  }
  return out;
}

const isSubset = (a: Set<string>, b: Set<string>) => [...a].every((w) => b.has(w));

interface Agency { words: Set<string>; website: string; name: string; region: string }

function findAgency(provider: CachedProvider, agencies: Agency[]): Agency | null {
  const mine = new Set(words(provider.name));
  if (mine.size === 0) return null;
  // Either every word of the agency's name is in the provider's name ("MONROE CO CHAP NYSARC DAY" contains
  // "MONROE CO. NYSARC"), or every word of a provider name of 2+ words is in the agency's ("YOUNG ADULT INSTITUTE")
  const candidates = agencies.flatMap((a) => {
    if (a.words.size === 0) return [];
    if (isSubset(a.words, mine) && (a.words.size >= 2 || mine.size <= 2)) return [{ a, score: a.words.size }];
    if (mine.size >= 2 && isSubset(mine, a.words)) return [{ a, score: mine.size }];
    return [];
  }).filter(({ a }) => !NOT_SAME_AGENCY.some(([p, d]) => p.test(provider.name) && d.test(a.name)));
  if (candidates.length === 0) return null;
  const top = Math.max(...candidates.map((c) => c.score));
  const best = candidates.filter((c) => c.score === top).map((c) => c.a);
  if (new Set(best.map((a) => a.website)).size === 1) return best[0];
  // Same-named agencies in different places: take the one in the provider's region, if exactly one
  const local = best.filter((a) => a.region === provider.region);
  return new Set(local.map((a) => a.website)).size === 1 ? local[0] : null;
}

const normalizeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`).replace(/\/+$/, "");

function main() {
  const dir = join(process.cwd(), "src/data");
  const load = (f: string): CachedProvider[] => JSON.parse(readFileSync(join(dir, f), "utf-8"));
  const agencies: Agency[] = load("opwdd-geocoded.json").filter((p) => p.website)
    .map((p) => ({ words: new Set(words(p.name)), website: normalizeUrl(p.website!), name: p.name, region: p.region }));

  for (const file of ["article16-geocoded.json", "medicaid-geocoded.json", "homecare-geocoded.json"]) {
    const providers = load(file);
    const counts = { state: 0, directory: 0, none: 0 };
    for (const p of providers) {
      if (STATE_OPERATED.test(p.name)) { p.website = OPWDD_WEBSITE; counts.state++; continue; }
      const agency = findAgency(p, agencies);
      if (agency) { p.website = agency.website; counts.directory++; continue; }
      // Home health agencies keep their NYS DOH profile page when the directory has no website for them
      if (!p.website?.includes("profiles.health.ny.gov")) delete p.website;
      counts.none++;
    }
    writeFileSync(join(dir, file), JSON.stringify(providers, null, 2));
    console.log(`${file}: ${counts.directory} from the OPWDD directory, ${counts.state} state-operated (opwdd.ny.gov), ${counts.none} without`);
  }
}

main();
