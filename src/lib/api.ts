import type { CachedProvider, DataSource, LocationFeatureCollection, LocationFeature, ServiceTypeCount, ProviderDetail } from "@/types/providers";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const SOURCE_FILES: Record<DataSource, string> = {
  medicaid: "medicaid-geocoded.json",
  medicare: "medicare-geocoded.json",
  opwdd: "opwdd-geocoded.json",
  article16: "article16-geocoded.json",
};

export function getCachedProviders(sourceFilter?: DataSource): CachedProvider[] {
  const sources = sourceFilter
    ? [sourceFilter]
    : (Object.keys(SOURCE_FILES) as DataSource[]);

  const all: CachedProvider[] = [];

  for (const source of sources) {
    try {
      const filePath = join(process.cwd(), "src/data", SOURCE_FILES[source]);
      if (!existsSync(filePath)) continue;
      const data: CachedProvider[] = JSON.parse(readFileSync(filePath, "utf-8"));
      all.push(...data);
    } catch (error) {
      console.error(`Error reading ${source} cache:`, error);
    }
  }

  return all;
}

interface LocationData {
  address: string;
  lat: number;
  lng: number;
  sources: Set<DataSource>;
  serviceTypes: Map<string, number>;
  providers: ProviderDetail[];
  county?: string;
}

// Normalize service types for cleaner grouping
function normalizeServiceType(type: string): string {
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

  // OPWDD services — already stored with correct display names, pass through as-is
  const OPWDD_PASSTHROUGH = new Set([
    "Residential (IRA)", "Individual Support (ISS)",
    "Intermediate Care (ICF)", "Self-Direction",
    "Day Habilitation", "Community Habilitation",
    "Supported Employment", "Prevocational",
    "Family Support", "Family Care", "Developmental Centers",
  ]);
  if (OPWDD_PASSTHROUGH.has(type)) return type;

  // Article 16
  if (upper.startsWith("ARTICLE 16")) return type;

  // Return original with title case if no match
  return type.split(" ").map((word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(" ");
}

export interface GetProvidersGeoJSONOptions {
  source?: DataSource | "all";
  types?: string[];
}

/**
 * Build GeoJSON from provider data - can be called directly from server components
 */
export function getProvidersGeoJSON(options: GetProvidersGeoJSONOptions = {}): LocationFeatureCollection {
  const { source = "all", types } = options;
  
  const sourceFilter = source !== "all" ? source : undefined;
  const providers = getCachedProviders(sourceFilter);

  const locationMap = new Map<string, LocationData>();
  const getLocationKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

  for (const provider of providers) {
    const normalizedServices = provider.services.map(normalizeServiceType);

    // Filter by type if specified
    if (types?.length) {
      const upperTypes = types.map((t) => t.toUpperCase());
      const matches = normalizedServices.some((s) =>
        upperTypes.some((t) => s.toUpperCase().includes(t))
      );
      if (!matches) continue;
    }

    const key = getLocationKey(provider.lat, provider.lng);

    if (!locationMap.has(key)) {
      locationMap.set(key, {
        address: provider.address,
        lat: provider.lat,
        lng: provider.lng,
        sources: new Set([provider.source]),
        serviceTypes: new Map(),
        providers: [],
        county: provider.county,
      });
    }

    const location = locationMap.get(key)!;
    location.sources.add(provider.source);
    location.providers.push({
      name: provider.name,
      type: normalizedServices.join(", "),
      source: provider.source,
      website: provider.website,
      phone: provider.phone,
    });

    for (const service of normalizedServices) {
      location.serviceTypes.set(service, (location.serviceTypes.get(service) || 0) + 1);
    }
  }

  // Convert to GeoJSON features
  const features: LocationFeature[] = [];

  for (const [key, location] of locationMap) {
    const services: ServiceTypeCount[] = Array.from(location.serviceTypes.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    const totalProviders = services.reduce((sum, s) => sum + s.count, 0);

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [location.lng, location.lat] },
      properties: {
        id: key,
        address: location.address,
        sources: Array.from(location.sources),
        services,
        providers: location.providers,
        totalProviders,
        county: location.county,
      },
    });
  }

  return { type: "FeatureCollection", features };
}
