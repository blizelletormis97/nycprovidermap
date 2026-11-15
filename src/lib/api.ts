import type {
  CachedProvider,
  DataSource,
  LocationDetail,
  LocationFeature,
  LocationFeatureCollection,
  ProviderDetail,
  SearchResult,
  ServiceTypeCount,
} from "@/types/providers";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { KNOWN_SERVICE_KEYS, SOURCE_ORDER } from "./constants";

const SOURCE_FILES: Record<DataSource, string> = {
  medicaid: "medicaid-geocoded.json",
  medicare: "medicare-geocoded.json",
  opwdd: "opwdd-geocoded.json",
  article16: "article16-geocoded.json",
  omh: "omh-geocoded.json",
  facilities: "facilities-geocoded.json",
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

/** Normalize raw service type strings from each dataset into the categories defined in constants.ts. */
export function normalizeServiceType(type: string): string {
  // Sources that are already stored with display names (OPWDD, Article 16, OMH, facilities)
  if (KNOWN_SERVICE_KEYS.has(type)) return type;

  const upper = type.toUpperCase();

  // Dental
  if (upper.includes("DENTIST") || upper === "PEDIATRIC DENTISTRY" || upper === "DENTAL") return "Dental";

  // Mental/Behavioral Health
  if (upper.includes("PSYCHOLOG") || upper.includes("PSYCHOANAL") || upper === "CLINICAL PSYCHOLOGIST" || upper === "PSYCHOLOGY") return "Psychology";
  if (upper === "PSYCHIATRY") return "Psychiatry";
  if (upper.includes("SOCIAL WORK") || upper === "CLINICAL SOCIAL WORKER") return "Social Work";
  if (upper.includes("MENTAL HEALTH COUNSEL")) return "Mental Health Counseling";

  // Therapy Services
  if (upper.includes("PHYSICAL THERAP") || upper === "PHYSICAL THERAPY") return "Physical Therapy";
  if (upper.includes("OCCUPATIONAL THERAP") || upper === "OCCUPATIONAL THERAPY") return "Occupational Therapy";
  if (upper.includes("SPEECH") || upper === "SPEECH THERAPY") return "Speech Therapy";
  if (upper.includes("PHYSICAL MEDICINE") || upper === "REHAB MEDICINE") return "Rehab Medicine";

  // Other Healthcare
  if (upper === "PODIATRY" || upper.includes("PODIATR")) return "Podiatry";
  if (upper === "OPTOMETRY" || upper.includes("OPTOMETR")) return "Optometry";
  if (upper.includes("DIETITIAN") || upper.includes("NUTRITION")) return "Nutrition";
  if (upper === "NEUROLOGY" || upper.includes("NEUROLOG")) return "Neurology";
  if (upper.includes("ALLERGY") || upper.includes("IMMUNOLOGY")) return "Allergy/Immunology";
  if (upper.includes("CHIROPRACT")) return "Chiropractic";

  // Home Health & DME
  if (upper.includes("HOME HEALTH") || upper.includes("HOME CARE") || upper.includes("IN HOME")) return "Home Health";
  if (upper.includes("EQUIPMENT") || upper.includes("SUPPLIER") || upper.includes("DEALER")) return "DME";

  // Physician / Primary Care (catch-all for physician types)
  if (upper.includes("PHYSICIAN")) return "Physician";
  if (upper.includes("FAMILY MEDICINE") || upper === "FAMILY PRACTICE") return "Physician";
  if (upper.includes("INTERNAL MEDICINE")) return "Physician";
  if (upper.includes("GENERAL PRACTICE")) return "Physician";
  if (upper.includes("HOSPITALIST")) return "Physician";
  if (upper.includes("PRIMARY CARE")) return "Physician";
  if (upper.includes("PEDIATRIC") && !upper.includes("DENTIST")) return "Physician";
  if (upper === "NURSE PRACTITIONER" || upper === "PHYSICIAN ASSISTANT") return "Physician";
  if (upper === "GERIATRIC MEDICINE") return "Physician";

  // Return original with title case if no match
  return type.split(" ").map((word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(" ");
}

const locationKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

interface LocationIndexEntry {
  id: string;
  address: string;
  lat: number;
  lng: number;
  providers: ProviderDetail[];
}

let locationIndex: Map<string, LocationIndexEntry> | null = null;

/** Group every provider by rounded coordinates. Built once per server process. */
function getLocationIndex(): Map<string, LocationIndexEntry> {
  if (locationIndex) return locationIndex;

  const index = new Map<string, LocationIndexEntry>();
  const seen = new Set<string>();

  for (const provider of getCachedProviders()) {
    const id = locationKey(provider.lat, provider.lng);
    const type = Array.from(new Set(provider.services.map(normalizeServiceType))).join(", ");

    // Drop exact duplicate listings (same source, name and services at the same spot)
    const dedupeKey = `${id}|${provider.source}|${provider.name.toUpperCase()}|${type}|${provider.detail ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let entry = index.get(id);
    if (!entry) {
      entry = { id, address: provider.address, lat: provider.lat, lng: provider.lng, providers: [] };
      index.set(id, entry);
    }
    entry.providers.push({
      name: provider.name,
      type,
      source: provider.source,
      detail: provider.detail,
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
