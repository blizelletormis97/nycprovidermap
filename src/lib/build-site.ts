/**
 * Build the static GitHub Pages site (site-dist/index.html) from the cached provider data.
 * The page is site/template.html with the provider data, service-area boundaries and map styles inlined.
 * The map library and fonts are served from the site itself (site-dist/assets, content-hashed names) so
 * visitors don't wait on connections to font or CDN servers.
 * Run with: bun run build:site
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { getLocationIndex } from "./api";

import type { ProviderDetail } from "@/types/providers";

const root = process.cwd();
const round = (n: number) => Math.round(n * 1e5) / 1e5;

// Compact records: a = address, r = region, c = [lat, lng], p = providers (n name, s source, t services,
// d detail, o office, ph phone, w website)
const compact = (p: ProviderDetail) => ({
  n: p.name,
  s: p.source,
  t: p.type,
  ...(p.detail ? { d: p.detail } : {}),
  ...(p.office ? { o: 1 } : {}),
  ...(p.phone ? { ph: p.phone } : {}),
  ...(p.website ? { w: p.website } : {}),
});

// Group everything, clinicians included, so a clinician in a building that also has IDD providers shares its pin.
// The page ships only the IDD providers; clinicians go in a separate file loaded when a viewer turns them on.
const locations: { a: string; r: string; c: number[]; p: ReturnType<typeof compact>[] }[] = [];
const clinicianAdds: [number, ReturnType<typeof compact>[]][] = [];
const clinicianOnly: typeof locations = [];
let clinicianCount = 0;

for (const entry of getLocationIndex(true).values()) {
  const base = entry.providers.filter((p) => p.source !== "clinicians").map(compact);
  const extra = entry.providers.filter((p) => p.source === "clinicians").map(compact);
  clinicianCount += extra.length;
  const record = { a: entry.address, r: entry.region, c: [round(entry.lat), round(entry.lng)] };
  if (base.length) {
    locations.push({ ...record, p: base });
    if (extra.length) clinicianAdds.push([locations.length - 1, extra]);
  } else {
    clinicianOnly.push({ ...record, p: extra });
  }
}

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

// JSON is safe inside <script type="application/json"> once "<" is escaped
const inline = (json: string) => json.replace(/</g, "\\u003c");

const outDir = join(root, "site-dist");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "assets"), { recursive: true });

/** Copy a file into site-dist/assets with a content hash in its name; returns the URL to use in the page. */
function asset(source: string, name: string): string {
  const body = readFileSync(join(root, source));
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
  const [base, ext] = [name.slice(0, name.lastIndexOf(".")), name.slice(name.lastIndexOf("."))];
  const file = `${base}.${hash}${ext}`;
  copyFileSync(join(root, source), join(outDir, "assets", file));
  return `assets/${file}`;
}

// Map styles are small, so they go inline (no extra request before the page can draw). Rules that point
// at Leaflet's bundled images are dropped: the page uses its own markers and controls.
const vendorCss = [
  "node_modules/leaflet/dist/leaflet.css",
  "node_modules/leaflet.markercluster/dist/MarkerCluster.css",
].map((f) => readFileSync(join(root, f), "utf-8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/[^{}]*\{[^{}]*url\([^)]*\)[^{}]*\}/g, "")
  .replace(/\s*\n\s*/g, "\n");

// Optional evaluations layer, fetched by the page on demand
const clinicianJson = JSON.stringify({ add: clinicianAdds, locations: clinicianOnly });
const clinicianName = `clinicians.${createHash("sha256").update(clinicianJson).digest("hex").slice(0, 10)}.json`;
writeFileSync(join(outDir, "assets", clinicianName), clinicianJson);
const clinicianUrl = `assets/${clinicianName}`;

const html = readFileSync(join(root, "site/template.html"), "utf-8")
  .replace("/*__VENDOR_CSS__*/", vendorCss)
  .replaceAll("__LEAFLET_JS__", asset("node_modules/leaflet/dist/leaflet.js", "leaflet.js"))
  .replaceAll("__MARKERCLUSTER_JS__", asset("node_modules/leaflet.markercluster/dist/leaflet.markercluster.js", "markercluster.js"))
  .replaceAll("__FONT_NUNITO__", asset("node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2", "nunito.woff2"))
  .replaceAll("__FONT_FREDOKA__", asset("node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff2", "fredoka-600.woff2"))
  .replace("__LOCATIONS_JSON__", () => inline(JSON.stringify(locations)))
  .replaceAll("__CLINICIANS_URL__", clinicianUrl)
  .replace("__BASEMAP_JSON__", () => inline(basemap))
  .replace('/*__DATA_DATE__*/""', JSON.stringify(dataDateLabel));

const leftover = html.match(/__[A-Z_]+__/);
if (leftover) throw new Error(`Unfilled placeholder in site/template.html: ${leftover[0]}`);

writeFileSync(join(outDir, "index.html"), html);
writeFileSync(join(outDir, ".nojekyll"), "");

const providers = locations.reduce((n, l) => n + l.p.length, 0);
console.log(`Built site-dist/index.html: ${locations.length} locations, ${providers} providers, data as of ${dataDateLabel} (${Math.round(html.length / 1024)} KB)`);
console.log(`Optional evaluations layer: ${clinicianCount} psychologists & social workers (${clinicianOnly.length} extra locations, ${Math.round(clinicianJson.length / 1024)} KB)`);
