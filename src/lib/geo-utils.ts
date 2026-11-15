/**
 * Geospatial utilities for the service area:
 * Manhattan, Brooklyn, the Bronx, Staten Island (NYC borough polygons) and
 * Long Island's Nassau and Suffolk counties.
 */

import * as turf from "@turf/turf";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import type { Feature, MultiPolygon, FeatureCollection } from "geojson";
import type { Region } from "@/types/providers";

interface BoroughProperties {
  BoroCode: number;
  BoroName: string;
}

type BoroughFeature = Feature<MultiPolygon, BoroughProperties>;

// NYC BoroCode -> region in the service area (Queens, BoroCode 4, is not in the service area)
const BORO_REGIONS: Record<number, Region> = {
  1: "Manhattan",
  2: "Bronx",
  3: "Brooklyn",
  5: "Staten Island",
};
const QUEENS_BORO_CODE = 4;

// County name (any case, with or without "County") -> region
const COUNTY_REGIONS: Record<string, Region> = {
  "NEW YORK": "Manhattan",
  MANHATTAN: "Manhattan",
  KINGS: "Brooklyn",
  BROOKLYN: "Brooklyn",
  BRONX: "Bronx",
  RICHMOND: "Staten Island",
  "STATEN ISLAND": "Staten Island",
  NASSAU: "Nassau",
  SUFFOLK: "Suffolk",
};

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

/** Map a county name from a dataset to a service-area region (null if outside the service area). */
export function countyToRegion(county?: string | null): Region | null {
  if (!county) return null;
  const key = county.toUpperCase().replace(/\s+COUNTY$/, "").trim();
  return COUNTY_REGIONS[key] ?? null;
}

/**
 * Work out which service-area region a point is in.
 *
 * NYC boroughs are checked against the official borough polygons. For Long
 * Island the dataset's county is required (we have no county polygons), and the
 * point must be east of Queens inside the Long Island bounding box.
 * Returns null for anything outside the service area — including Queens.
 */
export function getRegion(lat: number, lng: number, county?: string | null): Region | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const boroCode = findBoroCode(lat, lng);
  if (boroCode != null) {
    return boroCode === QUEENS_BORO_CODE ? null : BORO_REGIONS[boroCode] ?? null;
  }

  const countyRegion = countyToRegion(county);
  if (countyRegion !== "Nassau" && countyRegion !== "Suffolk") return null;

  const inLongIsland = lng >= LONG_ISLAND_BBOX.minLng && lng <= LONG_ISLAND_BBOX.maxLng
    && lat >= LONG_ISLAND_BBOX.minLat && lat <= LONG_ISLAND_BBOX.maxLat;
  return inLongIsland ? countyRegion : null;
}
