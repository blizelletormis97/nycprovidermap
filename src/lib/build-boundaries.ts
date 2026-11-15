/**
 * Build simplified outlines of the five OPWDD regions for the website's map.
 * Source: NY State county subdivision (town) boundaries, U.S. Census TIGER via data.ny.gov (yamh-8v7k).
 * Towns are merged by county FIPS code into the regions defined in constants.ts.
 * Run with: bun run src/lib/build-boundaries.ts
 */

import * as turf from "@turf/turf";
import { writeFileSync } from "fs";
import { join } from "path";
import { OPWDD_REGIONS } from "./constants";

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

// New York county FIPS codes (state 36)
const COUNTY_FIPS: Record<string, string> = {
  "001": "Albany", "003": "Allegany", "005": "Bronx", "007": "Broome", "009": "Cattaraugus", "011": "Cayuga",
  "013": "Chautauqua", "015": "Chemung", "017": "Chenango", "019": "Clinton", "021": "Columbia", "023": "Cortland",
  "025": "Delaware", "027": "Dutchess", "029": "Erie", "031": "Essex", "033": "Franklin", "035": "Fulton",
  "037": "Genesee", "039": "Greene", "041": "Hamilton", "043": "Herkimer", "045": "Jefferson", "047": "Kings",
  "049": "Lewis", "051": "Livingston", "053": "Madison", "055": "Monroe", "057": "Montgomery", "059": "Nassau",
  "061": "New York", "063": "Niagara", "065": "Oneida", "067": "Onondaga", "069": "Ontario", "071": "Orange",
  "073": "Orleans", "075": "Oswego", "077": "Otsego", "079": "Putnam", "081": "Queens", "083": "Rensselaer",
  "085": "Richmond", "087": "Rockland", "089": "St. Lawrence", "091": "Saratoga", "093": "Schenectady",
  "095": "Schoharie", "097": "Schuyler", "099": "Seneca", "101": "Steuben", "103": "Suffolk", "105": "Sullivan",
  "107": "Tioga", "109": "Tompkins", "111": "Ulster", "113": "Warren", "115": "Washington", "117": "Wayne",
  "119": "Westchester", "121": "Wyoming", "123": "Yates",
};

async function main() {
  console.log("Fetching New York town boundaries...");
  const res = await fetch("https://data.ny.gov/resource/yamh-8v7k.geojson?$limit=5000");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const towns: FeatureCollection<Polygon | MultiPolygon, { countyfp: string }> = await res.json();
  console.log(`  ${towns.features.length} towns in ${new Set(towns.features.map((f) => f.properties.countyfp)).size} counties`);

  const regionOf = new Map<string, number>();
  for (const r of OPWDD_REGIONS) for (const c of r.counties) regionOf.set(c, r.id);

  const features: Feature[] = [];
  for (const region of OPWDD_REGIONS) {
    const parts = towns.features.filter((f) => regionOf.get(COUNTY_FIPS[f.properties.countyfp]) === region.id);
    // Merge, drop slivers, simplify for the web
    let merged = parts.length > 1 ? turf.union(turf.featureCollection(parts)) : parts[0];
    if (!merged) throw new Error(`No towns for region ${region.id}`);
    merged = turf.truncate(turf.simplify(merged, { tolerance: region.id >= 4 ? 0.0008 : 0.003, highQuality: true }), { precision: 4 });
    merged.properties = { region: region.id, name: region.name };
    features.push(merged);
    console.log(`  Region ${region.id} (${region.name}): ${parts.length} towns`);
  }

  const out = JSON.stringify(turf.featureCollection(features));
  writeFileSync(join(process.cwd(), "src/data/boundaries/opwdd-regions.json"), out);
  console.log(`Saved src/data/boundaries/opwdd-regions.json (${Math.round(out.length / 1024)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
