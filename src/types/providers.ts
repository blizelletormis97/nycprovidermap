// Data source type
export type DataSource = "medicaid" | "medicare" | "opwdd" | "article16";

// Unified cached provider — all sources share this shape
export interface CachedProvider {
  source: DataSource;
  name: string;
  services: string[]; // raw service type strings (normalized at query time)
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

// Individual provider detail within a location group
export interface ProviderDetail {
  name: string;
  type: string;
  source: DataSource;
  website?: string;
  phone?: string;
}

// GeoJSON types for map data (location-grouped)
export interface LocationFeatureProperties {
  id: string;
  address: string;
  sources: DataSource[];
  services: ServiceTypeCount[];
  providers: ProviderDetail[];
  totalProviders: number;
  county?: string;
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
