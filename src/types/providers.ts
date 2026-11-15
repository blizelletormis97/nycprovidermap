// Data source type
export type DataSource = "medicaid" | "medicare" | "opwdd" | "article16" | "omh" | "facilities";

// Unified cached provider — all sources share this shape
export interface CachedProvider {
  source: DataSource;
  name: string;
  services: string[]; // raw service type strings (normalized at query time)
  detail?: string; // extra context shown in the popup (program type, populations served, etc.)
  address: string;
  county?: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
}

// Service type with count at a location
export interface ServiceTypeCount {
  type: string;
  count: number;
}

// Individual provider detail within a location group (loaded on demand)
export interface ProviderDetail {
  name: string;
  type: string;
  source: DataSource;
  detail?: string;
  website?: string;
  phone?: string;
}

// Full detail for one location, returned by /api/locations/[id]
export interface LocationDetail {
  id: string;
  address: string;
  providers: ProviderDetail[];
}

// GeoJSON properties for a location — kept small because every location is sent to the browser
export interface LocationFeatureProperties {
  id: string;
  address: string;
  sources: DataSource[];
  /** Highest-priority source at this location, used for the marker color */
  primarySource: DataSource;
  services: ServiceTypeCount[];
  /** "source|service" pairs, so the source filter only matches services that source actually offers */
  sourceServices: string[];
  totalProviders: number;
  /** Provider count per source at this location */
  providerCounts: Partial<Record<DataSource, number>>;
}

export interface LocationFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: LocationFeatureProperties;
}

export interface LocationFeatureCollection {
  type: "FeatureCollection";
  features: LocationFeature[];
}

// Provider-name search result from /api/search
export interface SearchResult {
  locationId: string;
  name: string;
  address: string;
  source: DataSource;
  type: string;
  coordinates: [number, number];
}
