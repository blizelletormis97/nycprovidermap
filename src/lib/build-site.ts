/**
 * Build the static GitHub Pages site (site-dist/index.html) from the cached provider data.
 * The page is site/template.html with the provider data, service-area boundaries and map styles inlined.
 * The map library and fonts are served from the site itself (site-dist/assets, content-hashed names) so
 * visitors don't wait on connections to font or CDN servers.
 * Run with: bun run build:site
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { getLocationIndex } from "./api";

import type { ProviderDetail } from "@/types/providers";

const root = process.cwd();
const round = (n: number) => Math.round(n * 1e5) / 1e5;

// Compact records: a = address, r = region, c = [lat, lng], p = providers (n name, s source, t services,
// d detail, o office, w website). Phone numbers are left off the public site.
const compact = (p: ProviderDetail) => ({
  n: p.name,
  s: p.source,
  t: p.type,
  ...(p.detail ? { d: p.detail } : {}),
  ...(p.office ? { o: 1 } : {}),
  ...(p.unconfirmed ? { u: 1 } : {}),
  ...(p.serves ? { sv: p.serves } : {}),
  ...(p.website ? { w: p.website } : {}),
});

const locations = [...getLocationIndex().values()].map((entry) => ({
  a: entry.address,
  r: entry.region,
  ...(entry.county ? { co: entry.county } : {}),
  c: [round(entry.lat), round(entry.lng)],
  p: entry.providers.map(compact),
}));

// Outlines of the five OPWDD regions (made by src/lib/build-boundaries.ts)
const basemap = readFileSync(join(root, "src/data/boundaries/opwdd-regions.json"), "utf-8");

// When the data was last checked against the sources: the weekly refresh writes src/data/last-checked.json every
// week, even when nothing changed. Before that file exists, use the last commit that touched the data, then today.
let dataDate = new Date();
try {
  const lastChecked = JSON.parse(readFileSync(join(root, "src/data/last-checked.json"), "utf-8")).checked as string;
  dataDate = new Date(`${lastChecked}T12:00:00Z`);
} catch {
  try {
    const iso = execSync("git log -1 --format=%cI -- src/data", { encoding: "utf-8" }).trim();
    if (iso) dataDate = new Date(iso);
  } catch {
    // not a git checkout; keep today
  }
}
const dataDateLabel = dataDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

interface About {
  show?: boolean;
  heading?: string;
  intro?: string;
  people?: { name?: string; role?: string }[];
  story?: string[];
  signoff?: string;
}

/**
 * The "About us" section, from site/about.json. Returns null (the page then hides the About button) until it is
 * switched on and every listed person has a name, so placeholder text never reaches the public site.
 */
function aboutSection(): Omit<About, "show"> | null {
  const about: About = JSON.parse(readFileSync(join(root, "site/about.json"), "utf-8"));
  const people = (about.people ?? []).map((p) => ({ name: p.name?.trim() ?? "", role: p.role?.trim() ?? "" }));
  const story = (about.story ?? []).map((s) => s.trim()).filter(Boolean);
  if (!about.show) return null;
  if (people.length === 0 || people.some((p) => !p.name)) {
    console.warn("site/about.json: \"show\" is true but a name is missing, so the About section stays hidden");
    return null;
  }
  return { heading: about.heading?.trim() || "About us", intro: about.intro?.trim() ?? "", people, story, signoff: about.signoff?.trim() ?? "" };
}

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

const html = readFileSync(join(root, "site/template.html"), "utf-8")
  .replace("/*__VENDOR_CSS__*/", vendorCss)
  .replaceAll("__LEAFLET_JS__", asset("node_modules/leaflet/dist/leaflet.js", "leaflet.js"))
  .replaceAll("__MARKERCLUSTER_JS__", asset("node_modules/leaflet.markercluster/dist/leaflet.markercluster.js", "markercluster.js"))
  .replaceAll("__FONT_NUNITO__", asset("node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2", "nunito.woff2"))
  .replaceAll("__FONT_FREDOKA__", asset("node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff2", "fredoka-600.woff2"))
  .replace("__LOCATIONS_JSON__", () => inline(JSON.stringify(locations)))
  .replace("__BASEMAP_JSON__", () => inline(basemap))
  .replace('/*__DATA_DATE__*/""', JSON.stringify(dataDateLabel))
  .replace("/*__ABOUT__*/null", () => inline(JSON.stringify(aboutSection())));

const leftover = html.match(/__[A-Z_]+__/);
if (leftover) throw new Error(`Unfilled placeholder in site/template.html: ${leftover[0]}`);

writeFileSync(join(outDir, "index.html"), html);
writeFileSync(join(outDir, ".nojekyll"), "");

// Feelings Garden moved to its own repository (blizelletormis97/feelings-garden); /feelings-garden/ keeps a page that
// forwards old links and a service worker that retires the old offline copy
cpSync(join(root, "site/feelings-garden"), join(outDir, "feelings-garden"), { recursive: true });

const providers = locations.reduce((n, l) => n + l.p.length, 0);
console.log(`Built site-dist/index.html: ${locations.length} locations, ${providers} providers, data as of ${dataDateLabel} (${Math.round(html.length / 1024)} KB)`);
