/** Shared helpers for the seed scripts. */

/** Format a 10-digit phone number as (212) 555-1234; returns other values unchanged. */
export function formatPhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw.trim() || undefined;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Title-case an ALL CAPS street address while leaving mixed-case input alone. */
export function titleCaseAddress(raw?: string): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_m, n, suf) => n + suf.toLowerCase());
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
