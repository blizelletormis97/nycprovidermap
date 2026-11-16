// Data source type — every source lists IDD providers that accept Medicaid
export type DataSource = "article16" | "opwdd" | "homecare" | "medicaid";

// Service area: all five NYC boroughs plus Long Island's Nassau and Suffolk counties
// Map areas: the NYC boroughs (OPWDD Region 4), Long Island counties (Region 5) and the upstate OPWDD regions 1-3
export type Region =
  | "Manhattan" | "Brooklyn" | "Bronx" | "Queens" | "Staten Island"
  | "Nassau" | "Suffolk"
  | "Region 1" | "Region 2" | "Region 3";

// Unified cached provider — all sources share this shape
export interface CachedProvider {
  source: DataSource;
  /** Full name shown on the map (spelled out by link-agencies.ts) */
  name: string;
  /** The name exactly as the source lists it, when it differs from `name` */
  listedName?: string;
  services: string[]; // service category keys from constants.ts SERVICE_GROUPS
  detail?: string; // extra context shown in the popup
  office?: boolean; // administrative office or billing address, not where services are delivered
  unconfirmed?: boolean; // address from an older list that current data doesn't confirm; call to confirm
  address: string;
  region: Region;
  /** County of the provider's address, e.g. "Monroe" */
  county?: string;
  /** Areas the provider serves, when wider than its office's area (e.g. home health agencies) */
  serves?: Region[];
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
  office?: boolean;
  unconfirmed?: boolean;
  serves?: Region[];
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
  region: Region;
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
