import type {
  CachedProvider,
  DataSource,
  LocationDetail,
  LocationFeature,
  LocationFeatureCollection,
  ProviderDetail,
  Region,
  SearchResult,
  ServiceTypeCount,
} from "@/types/providers";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { KNOWN_SERVICE_KEYS, SOURCE_ORDER } from "./constants";

const SOURCE_FILES: Record<DataSource, string> = {
  article16: "article16-geocoded.json",
  opwdd: "opwdd-geocoded.json",
  medicaid: "medicaid-geocoded.json",
};

const providerCache = new Map<DataSource, CachedProvider[]>();

function loadSource(source: DataSource): CachedProvider[] {
  const cached = providerCache.get(source);
  if (cached) return cached;

  let data: CachedProvider[] = [];
  try {
    const filePath = join(process.cwd(), "src/data", SOURCE_FILES[source]);
    if (existsSync(filePath)) {
      data = JSON.parse(readFileSync(filePath, "utf-8"));
    }
  } catch (error) {
    console.error(`Error reading ${source} cache:`, error);
  }
  providerCache.set(source, data);
  return data;
}

export function getCachedProviders(sourceFilter?: DataSource): CachedProvider[] {
  const sources = sourceFilter ? [sourceFilter] : (Object.keys(SOURCE_FILES) as DataSource[]);
  return sources.flatMap(loadSource);
}

/** Seed scripts store service category keys directly; unknown values are title-cased so they still display. */
export function normalizeServiceType(type: string): string {
  if (KNOWN_SERVICE_KEYS.has(type)) return type;
  return type.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

const locationKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

interface LocationIndexEntry {
  id: string;
  address: string;
  lat: number;
  lng: number;
  region: Region;
  providers: ProviderDetail[];
}

let locationIndex: Map<string, LocationIndexEntry> | null = null;

const STREET_ABBREVIATIONS: Record<string, string> = {
  STREET: "ST", AVENUE: "AVE", ROAD: "RD", BOULEVARD: "BLVD", PLACE: "PL", DRIVE: "DR", LANE: "LN",
  COURT: "CT", PARKWAY: "PKWY", PLAZA: "PLZ", HIGHWAY: "HWY", TURNPIKE: "TPKE", TERRACE: "TER",
  EAST: "E", WEST: "W", NORTH: "N", SOUTH: "S", FIRST: "1ST", SECOND: "2ND", THIRD: "3RD",
};

/**
 * Key that treats "376 Bay 44th Street, Brooklyn, NY, 11214" and "376 Bay 44th St Fl 2, Brooklyn, NY, 11214"
 * (or Queens-style "125-10 Queens Boulevard" and "12510 Queens Blvd") as the same building, so providers from different datasets share one map pin even when their
 * geocoded coordinates differ slightly. Returns null when the address has no street number or ZIP.
 */
export function addressKey(address: string): string | null {
  const parts = address.toUpperCase().split(",").map((p) => p.trim());
  const zip = parts.map((p) => p.match(/^(\d{5})(-?\d{4})?$/)?.[1]).find(Boolean);
  const street = parts[0]
    ?.replace(/[.#]/g, " ")
    .replace(/\b(STE|SUITE|FL|FLOOR|RM|ROOM|APT|UNIT)\b.*$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.replace(/^(\d+)-(\d+)$/, "$1$2") : STREET_ABBREVIATIONS[w] ?? w)) // Queens "125-10" = "12510"
    .join(" ");
  if (!zip || !street || !/^\d/.test(street)) return null;
  return `${street}|${zip}`;
}

/** Group every provider by building (normalized address) or rounded coordinates. Built once per server process. */
function getLocationIndex(): Map<string, LocationIndexEntry> {
  if (locationIndex) return locationIndex;

  const index = new Map<string, LocationIndexEntry>();
  const idsByAddress = new Map<string, string>();
  const seen = new Set<string>();

  // Article 16 / OPWDD first so their (cleaner) address and coordinates represent the location
  const providers = [...getCachedProviders()].sort(
    (a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source)
  );

  for (const provider of providers) {
    const byAddress = addressKey(provider.address);
    let id = byAddress ? idsByAddress.get(byAddress) : undefined;
    if (!id) {
      id = locationKey(provider.lat, provider.lng);
      if (byAddress) idsByAddress.set(byAddress, id);
    }
    const type = Array.from(new Set(provider.services.map(normalizeServiceType))).join(", ");

    // Drop exact duplicate listings (same source, name and services at the same spot)
    const dedupeKey = `${id}|${provider.source}|${provider.name.toUpperCase()}|${type}|${provider.detail ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let entry = index.get(id);
    if (!entry) {
      entry = { id, address: provider.address, lat: provider.lat, lng: provider.lng, region: provider.region, providers: [] };
      index.set(id, entry);
    }
    entry.providers.push({
      name: provider.name,
      type,
      source: provider.source,
      detail: provider.detail,
      office: provider.office,
      website: provider.website,
      phone: provider.phone,
    });
  }

  // Show DD-specific providers first, then by name
  for (const entry of index.values()) {
    entry.providers.sort((a, b) =>
      SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) || a.name.localeCompare(b.name)
    );
  }

  locationIndex = index;
  return index;
}

/**
 * Build the (compact) location GeoJSON sent to the map. Provider details are
 * left out and fetched per location from /api/locations/[id].
 */
export function getProvidersGeoJSON(): LocationFeatureCollection {
  const features: LocationFeature[] = [];

  for (const location of getLocationIndex().values()) {
    const serviceCounts = new Map<string, number>();
    const sourceServices = new Set<string>();
    const sources = new Set<DataSource>();
    const providerCounts: Partial<Record<DataSource, number>> = {};

    for (const provider of location.providers) {
      sources.add(provider.source);
      providerCounts[provider.source] = (providerCounts[provider.source] ?? 0) + 1;
      for (const service of provider.type.split(", ")) {
        serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
        sourceServices.add(`${provider.source}|${service}`);
      }
    }

    const services: ServiceTypeCount[] = Array.from(serviceCounts, ([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    const orderedSources = SOURCE_ORDER.filter((s) => sources.has(s));

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [location.lng, location.lat] },
      properties: {
        id: location.id,
        address: location.address,
        region: location.region,
        sources: orderedSources,
        primarySource: orderedSources[0],
        services,
        sourceServices: Array.from(sourceServices),
        totalProviders: location.providers.length,
        providerCounts,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

export function getLocationDetail(id: string): LocationDetail | null {
  const entry = getLocationIndex().get(id);
  if (!entry) return null;
  return { id: entry.id, address: entry.address, providers: entry.providers };
}

/** Case-insensitive provider name search across all sources. */
export function searchProviders(query: string, limit = 50): SearchResult[] {
  const terms = query.toUpperCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const results: SearchResult[] = [];
  for (const location of getLocationIndex().values()) {
    for (const provider of location.providers) {
      const haystack = provider.name.toUpperCase();
      if (!terms.every((term) => haystack.includes(term))) continue;
      results.push({
        locationId: location.id,
        name: provider.name,
        address: location.address,
        source: provider.source,
        type: provider.type,
        coordinates: [location.lng, location.lat],
      });
    }
  }

  // Prefer names that start with the query, then DD-specific sources
  const upperQuery = query.trim().toUpperCase();
  results.sort((a, b) =>
    Number(!a.name.toUpperCase().startsWith(upperQuery)) - Number(!b.name.toUpperCase().startsWith(upperQuery))
    || SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source)
    || a.name.localeCompare(b.name)
  );
  return results.slice(0, limit);
}
