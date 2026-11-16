/**
 * Spell out every provider's name in full and add websites.
 *
 * Names: the state's lists shorten names ("COMM MAINSTREAMING INC SPT") and the Medicaid listing cuts them off at
 * 35 characters. Each Medicaid site and home health agency that belongs to a known agency (OPWDD directory or
 * Article 16 list) is shown under that agency's full name; every name is then spelled out by fullName()
 * (src/lib/full-names.ts). The name as listed is kept in `listedName`, so this step can be re-run.
 *
 * Websites: taken from the OPWDD agency directory (NY Open Data, the only one of our sources that lists websites).
 *
 * Clinic and Medicaid records name the same agencies in many ways ("NYS ARC MONROE COUNTY CHAPTER",
 * "MONROE CO CHAP NYSARC DAY", "UCP QUEENS ICF B"), so names are compared as sets of words after expanding
 * abbreviations and dropping program codes (DAY, SPV, ICF...). State-operated OPWDD offices and clinics get
 * OPWDD's own website. Matches were checked by hand; the few wrong ones are listed in NOT_SAME_AGENCY.
 *
 * Run after seed-opwdd.ts, seed-medicaid.ts, seed-home-care.ts and seed-article16.ts:
 *   bun run src/lib/link-agencies.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { agencyPart, canonicalName, fullName } from "./full-names";

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

interface Agency { words: Set<string>; website?: string; name: string; region: string }

const listed = (p: CachedProvider) => p.listedName ?? p.name;

/** The provider's agency, or null. `key` decides when same-scoring candidates count as one agency. */
function findAgency(provider: CachedProvider, agencies: Agency[], key: (a: Agency) => string): Agency | null {
  const mine = new Set(words(listed(provider)));
  if (mine.size === 0) return null;
  // Either every word of the agency's name is in the provider's name ("MONROE CO CHAP NYSARC DAY" contains
  // "MONROE CO. NYSARC"), or every word of a provider name of 2+ words is in the agency's ("YOUNG ADULT INSTITUTE")
  const candidates = agencies.flatMap((a) => {
    if (a.words.size === 0) return [];
    if (isSubset(a.words, mine) && (a.words.size >= 2 || mine.size <= 2)) return [{ a, score: a.words.size }];
    if (mine.size >= 2 && isSubset(mine, a.words)) return [{ a, score: mine.size }];
    return [];
  }).filter(({ a }) => !NOT_SAME_AGENCY.some(([p, d]) => p.test(listed(provider)) && d.test(a.name)));
  if (candidates.length === 0) return null;
  const top = Math.max(...candidates.map((c) => c.score));
  const best = candidates.filter((c) => c.score === top).map((c) => c.a);
  const same = (list: Agency[]) => new Set(list.map(key)).size === 1;
  if (same(best)) return best[0];
  // Same-named agencies in different places: take the one in the provider's region, if exactly one
  const local = best.filter((a) => a.region === provider.region);
  return local.length > 0 && same(local) ? local[0] : null;
}

const normalizeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`).replace(/\/+$/, "");

function main() {
  const dir = join(process.cwd(), "src/data");
  const load = (f: string): CachedProvider[] => JSON.parse(readFileSync(join(dir, f), "utf-8"));
  const toAgency = (p: CachedProvider): Agency =>
    ({ words: new Set(words(listed(p))), website: p.website ? normalizeUrl(p.website) : undefined, name: listed(p), region: p.region });
  const opwdd = load("opwdd-geocoded.json");
  const withWebsite = opwdd.filter((p) => p.website).map(toAgency);
  // For names, Article 16 clinics count as known agencies too (their list gives full legal names)
  const named = [...opwdd.map(toAgency), ...load("article16-geocoded.json").map((p) => ({ ...toAgency(p), website: undefined }))];

  const out = new Map<string, CachedProvider[]>();
  const unmatched = new Set<CachedProvider>();
  for (const file of ["opwdd-geocoded.json", "article16-geocoded.json", "medicaid-geocoded.json", "homecare-geocoded.json"]) {
    const providers = load(file);
    const counts = { state: 0, directory: 0, none: 0, agencyName: 0 };
    for (const p of providers) {
      p.listedName = listed(p);
      // Name: OPWDD agencies and Article 16 clinics already carry the agency's own name; sites take their agency's
      const agency = p.source === "medicaid" || p.source === "homecare" ? findAgency(p, named, (a) => fullName(a.name)) : null;
      if (agency) counts.agencyName++;
      p.name = fullName(agency?.name ?? p.listedName);
      if (p.source === "medicaid" && !agency) {
        const known = canonicalName(p.name);
        p.name = known !== p.name ? known : agencyPart(p.name);
        unmatched.add(p);
      }

      if (p.source === "opwdd") continue; // the directory's own website
      if (STATE_OPERATED.test(listed(p))) { p.website = OPWDD_WEBSITE; counts.state++; continue; }
      const site = findAgency(p, withWebsite, (a) => a.website ?? "");
      if (site) { p.website = site.website; counts.directory++; continue; }
      // Home health agencies keep their NYS DOH profile page when the directory has no website for them
      if (!p.website?.includes("profiles.health.ny.gov")) delete p.website;
      counts.none++;
    }
    out.set(file, providers);
    console.log(`${file}: names from their agency ${counts.agencyName}; websites: ${counts.directory} from the OPWDD directory, `
      + `${counts.state} state-operated (opwdd.ny.gov), ${counts.none} without`);
  }

  // Medicaid sites the agency match missed often carry their agency's name plus a site name ("Gan Kavod Maple",
  // "Developmental Disabilities Institute Hollyw" — cut off by the 35-character limit). When another provider's
  // full name is the start of it, use that name.
  // Never a name shared by a family of separate agencies ("United Cerebral Palsy", "Catholic Charities")
  const allNames = [...new Set([...out.values()].flat().map((p) => p.name))].filter((n) => !FAMILY_NAMES.has(n));
  const nameWords = (n: string) => n.toUpperCase().split(/\s+/);
  let shortened = 0;
  for (const p of unmatched) {
    const mine = nameWords(p.name);
    const prefix = allNames
      .filter((n) => n !== p.name)
      .map(nameWords)
      .filter((w) => w.length < mine.length && (w.length >= 2 || ACRONYM_AGENCIES.has(w[0])))
      .filter((w) => w.every((x, i) => x === mine[i]))
      .sort((a, b) => b.length - a.length)[0]; // the longest such name
    if (prefix) { p.name = allNames.find((n) => nameWords(n).join(" ") === prefix.join(" "))!; shortened++; }
  }
  console.log(`Medicaid site names shortened to their agency's name: ${shortened}`);

  for (const p of [...out.values()].flat()) p.name = canonicalName(p.name);

  // The same agency written two ways ("Elmys" / "Elmy's", "Broome Tioga" / "Broome-Tioga"): use one spelling,
  // preferring the OPWDD directory's or Article 16 list's, then the most common
  const spellingKey = (n: string) => n.toLowerCase().replace(/'s\b/g, "s").replace(/[^a-z0-9]/g, "");
  const spellings = new Map<string, Map<string, number>>();
  for (const p of [...out.values()].flat()) {
    const forms = spellings.get(spellingKey(p.name)) ?? new Map<string, number>();
    forms.set(p.name, (forms.get(p.name) ?? 0) + (p.source === "opwdd" || p.source === "article16" ? 1000 : 1));
    spellings.set(spellingKey(p.name), forms);
  }
  for (const p of [...out.values()].flat()) {
    const forms = [...spellings.get(spellingKey(p.name))!].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]));
    p.name = forms[0][0];
  }

  for (const [file, providers] of out) {
    for (const p of providers) if (p.name === p.listedName) delete p.listedName;
    writeFileSync(join(dir, file), JSON.stringify(providers, null, 2));
  }
}

// Names shared by many separate agencies: never the start of one agency's name
const FAMILY_NAMES = new Set(["United Cerebral Palsy", "Catholic Charities", "The ARC", "ARC", "Mental Health Association",
  "Independent Living", "Jewish Family Services", "Community Resources", "Family Services"]);

// One-word agency names that are acronyms are distinctive enough to count as the start of a site's name
const ACRONYM_AGENCIES = new Set(["AABR", "ACLD", "AHRC", "YAI", "QSAC", "HASC", "CHDFS", "ARISE"]);

main();
