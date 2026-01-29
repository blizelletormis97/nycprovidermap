/**
 * Shared geospatial utilities using Turf.js
 * Provides polygon-based validation for Manhattan and Bronx boroughs.
 */

import * as turf from "@turf/turf";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import type { Feature, MultiPolygon, FeatureCollection } from "geojson";

// Borough codes from NYC data
const MANHATTAN_BORO_CODE = 1;
const BRONX_BORO_CODE = 2;

interface BoroughProperties {
  OBJECTID: number;
  BoroCode: number;
  BoroName: string;
  Shape__Area: number;
  Shape__Length: number;
}

type BoroughFeature = Feature<MultiPolygon, BoroughProperties>;
type BoroughFeatureCollection = FeatureCollection<MultiPolygon, BoroughProperties>;

// Cache for loaded polygons
let manhattanPolygon: BoroughFeature | null = null;
let bronxPolygon: BoroughFeature | null = null;
let combinedPolygon: Feature<MultiPolygon> | null = null;

/**
 * Load borough boundaries from the boundaries file.
 * Extracts Manhattan and Bronx polygons on first call.
 */
function loadBoroughPolygons(): void {
  if (manhattanPolygon && bronxPolygon) return;

  const boundariesPath = join(process.cwd(), "src/data/boundaries/nyc-boroughs.json");
  
  if (!existsSync(boundariesPath)) {
    throw new Error(`Borough boundaries file not found: ${boundariesPath}`);
  }

  const data = readFileSync(boundariesPath, "utf-8");
  const geojson: BoroughFeatureCollection = JSON.parse(data);

  for (const feature of geojson.features) {
    if (feature.properties.BoroCode === MANHATTAN_BORO_CODE) {
      manhattanPolygon = feature;
    } else if (feature.properties.BoroCode === BRONX_BORO_CODE) {
      bronxPolygon = feature;
    }
  }

  if (!manhattanPolygon || !bronxPolygon) {
    throw new Error("Could not find Manhattan or Bronx polygons in boundaries file");
  }

  // Create combined polygon for efficient single-check validation
  const manhattanCoords = manhattanPolygon.geometry.coordinates;
  const bronxCoords = bronxPolygon.geometry.coordinates;
  
  combinedPolygon = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiPolygon",
      coordinates: [...manhattanCoords, ...bronxCoords],
    },
  };
}

/**
 * Check if a point is within Manhattan or Bronx.
 * Uses actual borough polygon boundaries for accurate validation.
 */
export function isInManhattanOrBronx(lat: number, lng: number): boolean {
  loadBoroughPolygons();
  
  if (!combinedPolygon) return false;

  const point = turf.point([lng, lat]);
  return turf.booleanPointInPolygon(point, combinedPolygon);
}

/**
 * Get the bounding box for Manhattan + Bronx combined.
 * Useful for constraining geocoding API requests.
 */
export function getManhattanBronxBbox(): [number, number, number, number] {
  loadBoroughPolygons();
  
  if (!combinedPolygon) {
    // Fallback bounds if polygons not loaded
    return [-74.05, 40.68, -73.75, 40.93];
  }

  return turf.bbox(combinedPolygon) as [number, number, number, number];
}
