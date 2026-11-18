/** Shared helpers for the seed scripts. */

/**
 * Format a phone number as (212) 555-1234, keeping an extension: "516-626-1000 X1105" -> "(516) 626-1000 ext. 1105".
 * Returns other values unchanged.
 */
export function formatPhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const [main, ext] = raw.split(/\s*(?:x|ext\.?|extension)\s*/i);
  const digits = main.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw.trim() || undefined;
  const extension = ext?.replace(/\D/g, "");
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}${extension ? ` ext. ${extension}` : ""}`;
}

/** Title-case an ALL CAPS street address while leaving mixed-case input alone. */
export function titleCaseAddress(raw?: string): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_m, n, suf) => n + suf.toLowerCase())
    .replace(/\b(Route|Rte) (\d+)([nsew])\b/gi, (_m, r, n, d) => `${r} ${n}${d.toUpperCase()}`); // "Route 9W"
}

const STREET_WORDS: Record<string, string> = {
  STREET: "ST", AVENUE: "AVE", ROAD: "RD", BOULEVARD: "BLVD", PLACE: "PL", DRIVE: "DR", LANE: "LN",
  COURT: "CT", PARKWAY: "PKWY", PLAZA: "PLZ", HIGHWAY: "HWY", TURNPIKE: "TPKE", TERRACE: "TER", SQUARE: "SQ",
  CIRCLE: "CIR", EAST: "E", WEST: "W", NORTH: "N", SOUTH: "S", MOUNT: "MT", "&": "AND",
  FIRST: "1ST", SECOND: "2ND", THIRD: "3RD", FOURTH: "4TH", FIFTH: "5TH", SIXTH: "6TH",
  SEVENTH: "7TH", EIGHTH: "8TH", NINTH: "9TH", TENTH: "10TH",
};
// Words that say what kind of street it is, not which street; ignored when comparing street names
const GENERIC = new Set([
  "ST", "AVE", "RD", "BLVD", "PL", "DR", "LN", "CT", "PKWY", "PLZ", "HWY", "TPKE", "TER", "WAY", "CIR", "SQ",
  "N", "S", "E", "W", "ROUTE", "RTE", "STATE", "US", "COUNTY", "CO", "SUITE", "STE", "FL", "FLOOR",
]);

/** Uppercase street tokens with common words abbreviated. */
export function streetTokens(street: string): string[] {
  return street.toUpperCase().replace(/['.,#]/g, "").replace(/-\s+/g, "-").split(/\s+/).filter(Boolean)
    .map((w) => STREET_WORDS[w] ?? w);
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Distinctive part of a street name, e.g. "376 Bay 44th Street" -> "BAY44TH", "Route 9W" -> "9W". */
function streetCore(tokens: string[]): string {
  return tokens.filter((w) => !GENERIC.has(w)).join("").replace(/-/g, "");
}

/**
 * Check that a geocoder's matched address is the street we asked for, so "376 Bay 44th Street" is not
 * accepted as "376 44th St". The house number must match (either end of a range like "293-295", or a
 * Queens-style "125-10"); the street name must match allowing for abbreviations, route wording and
 * small spelling differences; and when `requireZip` is set the ZIP must match too.
 */
export function geocodeMatchAgrees(street: string, zip: string, matchedAddress: string, requireZip: boolean): boolean {
  const [inNumber, ...inStreet] = streetTokens(street);
  const [matchedStreet, ...rest] = matchedAddress.split(",");
  const [mNumber, ...mStreet] = streetTokens(matchedStreet);

  const [first, second] = inNumber.split("-");
  const numbers = new Set([inNumber.replace(/-/g, ""), first, second].filter(Boolean));
  if (!numbers.has(mNumber.replace(/-/g, ""))) return false;

  const inCore = streetCore(inStreet);
  const mCore = streetCore(mStreet);
  if (inCore && !mCore.includes(inCore) && levenshtein(inCore, mCore) > Math.floor(inCore.length * 0.15)) {
    return false;
  }

  if (requireZip && /^\d{5}/.test(zip)) {
    const matchedZip = rest.join(",").match(/\b(\d{5})\b/)?.[1];
    if (matchedZip && matchedZip !== zip.slice(0, 5)) return false;
  }
  return true;
}

// --- Medicaid Enrolled Provider Listing helpers ---

// Program notes the listing appends to addresses, mapped to a readable label for the popup
const ADDRESS_NOTES: [RegExp, string | null][] = [
  [/\bAHRH REGION \d+ RATE SET\b/gi, "Billing enrollment (rate set)"],
  [/\bSUPP?ORTIVE IRA\b/gi, "Supportive IRA"],
  [/\bSUPP?ORTIVE(\s+\d+\s+SITES)?\b/gi, "Supportive IRA"],
  [/\b(GROUP|SUPPL INDIV|INDIV)\s+DAY HAB\b/gi, "Day habilitation"],
  [/\bOMRDD DT\b/gi, "Day treatment"],
  [/#\s*SUPVD\b/gi, "Supervised residence"],
];

const STREET_SUFFIX = /\b(ST|AVE|RD|PLZ|BLVD|PL|LN|DR|CT|HWY|HW|PKWY|CRES|WAY|TPKE|TER|CIR|SQ)\b(\s+(#|APT|STE|FL|RM)\s*\S+)*/i;

/**
 * Clean an address from the Medicaid listing, e.g. "61 FLORENCE ST # C7123461 # SUPVD" or
 * "133 SHORE RD RD ICF". Returns the cleaned street address plus any program notes found in it.
 */
export function cleanAddress(raw = ""): { street: string; notes: string[] } {
  const notes = new Set<string>();
  let s = raw;
  for (const [pattern, label] of ADDRESS_NOTES) {
    if (pattern.test(s) && label) notes.add(label);
    pattern.lastIndex = 0;
    s = s.replace(pattern, " ");
  }
  s = s.replace(/#\s*C\d+/gi, " ");

  // "1980 MORRIS AVE MORRIS AVE ICF" -> cut everything after the street suffix (and unit)
  if (/\bICF\b/i.test(s)) {
    const match = s.match(STREET_SUFFIX);
    s = match?.index != null ? s.slice(0, match.index + match[0].length) : s.replace(/\bICF\b.*$/i, "");
  }

  s = s.replace(/#\s*(?=#|$)/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s#,]+|[\s#,]+$/g, "").trim();
  return { street: s, notes: [...notes] };
}

/** True when the cleaned address looks like a real street address (not a PO box or "10 SITES"). */
export function isStreetAddress(street: string): boolean {
  return /^\d/.test(street) && !/\bPO BOX\b|\bSITES\b/i.test(street);
}

/** The listing puts site codes in the phone field for many OPWDD sites; keep only real phone numbers. */
export function cleanPhone(raw?: string): string | undefined {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (digits.length !== 10 || !/^[2-9]\d{2}[2-9]/.test(digits)) return undefined;
  return formatPhone(digits);
}
