/**
 * Build the static GitHub Pages site (site-dist/index.html) from the cached provider data.
 * The page is site/template.html with the provider locations and service-area boundaries inlined.
 * Run with: bun run build:site
 */

import { execSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getLocationDetail, getProvidersGeoJSON } from "./api";

const root = process.cwd();
const round = (n: number) => Math.round(n * 1e5) / 1e5;

// Compact location records: a = address, r = region, c = [lat, lng], p = providers
const locations = getProvidersGeoJSON().features.map((feature) => {
  const detail = getLocationDetail(feature.properties.id)!;
  return {
    a: feature.properties.address,
    r: feature.properties.region,
    c: [round(feature.geometry.coordinates[1]), round(feature.geometry.coordinates[0])],
    p: detail.providers.map((p) => ({
      n: p.name,
      s: p.source,
      t: p.type,
      ...(p.detail ? { d: p.detail } : {}),
      ...(p.phone ? { ph: p.phone } : {}),
      ...(p.website ? { w: p.website } : {}),
    })),
  };
});

const basemap = readFileSync(join(root, "src/data/boundaries/service-area-counties.json"), "utf-8");

// "Month YYYY" of the last commit that touched the data, falling back to today
let dataDate = new Date();
try {
  const iso = execSync("git log -1 --format=%cI -- src/data", { encoding: "utf-8" }).trim();
  if (iso) dataDate = new Date(iso);
} catch {
  // not a git checkout; keep today
}
const dataDateLabel = dataDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" });

// Inline JSON safely inside <script>
const inline = (json: string) => json.replace(/</g, "\\u003c");

const html = readFileSync(join(root, "site/template.html"), "utf-8")
  .replace("/*__LOCATIONS__*/[]", inline(JSON.stringify(locations)))
  .replace("/*__BASEMAP__*/{}", inline(basemap))
  .replace('/*__DATA_DATE__*/""', JSON.stringify(dataDateLabel));

const outDir = join(root, "site-dist");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html);
writeFileSync(join(outDir, ".nojekyll"), "");

const providers = locations.reduce((n, l) => n + l.p.length, 0);
console.log(`Built site-dist/index.html: ${locations.length} locations, ${providers} providers, data as of ${dataDateLabel} (${Math.round(html.length / 1024)} KB)`);
