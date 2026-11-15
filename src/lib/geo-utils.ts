/**
 * Geospatial utilities for the service area: all of New York State, as map areas — the five NYC boroughs
 * (OPWDD Region 4, checked against the borough polygons), Nassau and Suffolk (Region 5) and upstate OPWDD
 * Regions 1-3 (by county).
 */

import * as turf from "@turf/turf";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import type { Feature, MultiPolygon, FeatureCollection } from "geojson";
import type { Region } from "@/types/providers";
import { OPWDD_REGIONS } from "./constants";

interface BoroughProperties {
  BoroCode: number;
  BoroName: string;
}

type BoroughFeature = Feature<MultiPolygon, BoroughProperties>;

// NYC BoroCode -> region
const BORO_REGIONS: Record<number, Region> = {
  1: "Manhattan",
  2: "Bronx",
  3: "Brooklyn",
  4: "Queens",
  5: "Staten Island",
};

// County name (any case, with or without "County") -> region
const COUNTY_REGIONS: Record<string, Region> = {
  "NEW YORK": "Manhattan",
  MANHATTAN: "Manhattan",
  KINGS: "Brooklyn",
  BROOKLYN: "Brooklyn",
  BRONX: "Bronx",
  QUEENS: "Queens",
  RICHMOND: "Staten Island",
  "STATEN ISLAND": "Staten Island",
  NASSAU: "Nassau",
  SUFFOLK: "Suffolk",
  // Upstate counties map to their OPWDD region
  ...Object.fromEntries(OPWDD_REGIONS.filter((r) => r.id <= 3).flatMap((r) =>
    r.counties.map((c) => [normalizeCounty(c), `Region ${r.id}` as Region]))),
};

// Rough bounding box of New York State, to reject records whose coordinates are far from their county
const NY_STATE_BBOX = { minLng: -79.8, maxLng: -71.8, minLat: 40.45, maxLat: 45.05 };

/** "St. Lawrence County" / "SAINT LAWRENCE" -> "ST LAWRENCE" */
function normalizeCounty(county: string): string {
  return county.toUpperCase().replace(/\./g, "").replace(/\s+COUNTY$/, "").replace(/^SAINT\s/, "ST ").replace(/\s+/g, " ").trim();
}

// Generous bounding box for Long Island east of Queens (Nassau + Suffolk)
const LONG_ISLAND_BBOX = { minLng: -73.78, maxLng: -71.8, minLat: 40.54, maxLat: 41.32 };

let boroughs: BoroughFeature[] | null = null;

function loadBoroughs(): BoroughFeature[] {
  if (boroughs) return boroughs;
  const boundariesPath = join(process.cwd(), "src/data/boundaries/nyc-boroughs.json");
  if (!existsSync(boundariesPath)) {
    throw new Error(`Borough boundaries file not found: ${boundariesPath}`);
  }
  const geojson: FeatureCollection<MultiPolygon, BoroughProperties> = JSON.parse(readFileSync(boundariesPath, "utf-8"));
  boroughs = geojson.features;
  return boroughs;
}

/** Return the NYC BoroCode containing the point, or null if outside NYC. */
function findBoroCode(lat: number, lng: number): number | null {
  const point = turf.point([lng, lat]);
  for (const feature of loadBoroughs()) {
    if (turf.booleanPointInPolygon(point, feature)) return feature.properties.BoroCode;
  }
  return null;
}

/** Map a county name from a dataset to a map area (null if not a New York State county). */
export function countyToRegion(county?: string | null): Region | null {
  if (!county) return null;
  return COUNTY_REGIONS[normalizeCounty(county)] ?? null;
}

/** "ST. LAWRENCE" / "Monroe County" -> "St. Lawrence" / "Monroe" (for display and search) */
export function countyName(county?: string | null): string | undefined {
  if (!county) return undefined;
  const key = normalizeCounty(county);
  const match = OPWDD_REGIONS.flatMap((r) => r.counties).find((c) => normalizeCounty(c) === key);
  return match;
}

/**
 * Work out which map area a point is in.
 *
 * NYC boroughs are checked against the official borough polygons. Elsewhere the dataset's county decides:
 * Nassau/Suffolk points must be east of Queens inside the Long Island bounding box, and upstate points must be
 * inside New York State's bounding box. Returns null for anything outside New York State.
 */
export function getRegion(lat: number, lng: number, county?: string | null): Region | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const boroCode = findBoroCode(lat, lng);
  if (boroCode != null) {
    return BORO_REGIONS[boroCode] ?? null;
  }

  const countyRegion = countyToRegion(county);
  if (!countyRegion) return null;
  if (countyRegion.startsWith("Region ")) {
    const inState = lng >= NY_STATE_BBOX.minLng && lng <= NY_STATE_BBOX.maxLng
      && lat >= NY_STATE_BBOX.minLat && lat <= NY_STATE_BBOX.maxLat;
    return inState ? countyRegion : null;
  }
  // An NYC county whose point fell outside the borough polygons is out of place
  if (countyRegion !== "Nassau" && countyRegion !== "Suffolk") return null;

  const inLongIsland = lng >= LONG_ISLAND_BBOX.minLng && lng <= LONG_ISLAND_BBOX.maxLng
    && lat >= LONG_ISLAND_BBOX.minLat && lat <= LONG_ISLAND_BBOX.maxLat;
  return inLongIsland ? countyRegion : null;
}
