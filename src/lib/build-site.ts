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

// "Month YYYY" of the last commit that touched the data, falling back to today
let dataDate = new Date();
try {
  const iso = execSync("git log -1 --format=%cI -- src/data", { encoding: "utf-8" }).trim();
  if (iso) dataDate = new Date(iso);
} catch {
  // not a git checkout; keep today
}
const dataDateLabel = dataDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" });

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

// Languages: English is inlined; each other language is a separate file the page loads when it is chosen.
// Order of the menu, and right-to-left scripts.
const LANGUAGES: { code: string; dir?: "rtl" }[] = [
  { code: "en" }, { code: "es" }, { code: "zh" }, { code: "ru" }, { code: "yi", dir: "rtl" }, { code: "bn" }, { code: "ko" },
  { code: "ht" }, { code: "it" }, { code: "ar", dir: "rtl" }, { code: "pl" }, { code: "fr" }, { code: "ur", dir: "rtl" },
];
const english: Record<string, string> = JSON.parse(readFileSync(join(root, "site/i18n/en.json"), "utf-8"));
const langs = LANGUAGES.map(({ code, dir }) => {
  const file = `site/i18n/${code}.json`;
  const strings: Record<string, string> = JSON.parse(readFileSync(join(root, file), "utf-8"));
  const missing = Object.keys(english).filter((k) => !(k in strings));
  if (missing.length) throw new Error(`${file} is missing ${missing.length} keys: ${missing.slice(0, 5).join(", ")}`);
  // Every {placeholder} in the English text must be kept in the translation
  for (const [k, v] of Object.entries(english)) {
    const want = (v.match(/\{\w+\}/g) ?? []).sort().join();
    if ((strings[k].match(/\{\w+\}/g) ?? []).sort().join() !== want) throw new Error(`${file}: "${k}" must keep ${want}`);
  }
  return { code, name: strings._name, dir: dir ?? "ltr", url: code === "en" ? "" : asset(file, `i18n-${code}.json`) };
});
const i18n = { en: english, langs };

const html = readFileSync(join(root, "site/template.html"), "utf-8")
  .replace("/*__VENDOR_CSS__*/", vendorCss)
  .replaceAll("__LEAFLET_JS__", asset("node_modules/leaflet/dist/leaflet.js", "leaflet.js"))
  .replaceAll("__MARKERCLUSTER_JS__", asset("node_modules/leaflet.markercluster/dist/leaflet.markercluster.js", "markercluster.js"))
  .replaceAll("__FONT_NUNITO__", asset("node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2", "nunito.woff2"))
  .replaceAll("__FONT_FREDOKA__", asset("node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff2", "fredoka-600.woff2"))
  .replace("__LOCATIONS_JSON__", () => inline(JSON.stringify(locations)))
  .replace("__BASEMAP_JSON__", () => inline(basemap))
  .replace('/*__DATA_DATE__*/""', JSON.stringify(dataDateLabel))
  .replace("/*__ABOUT__*/null", () => inline(JSON.stringify(aboutSection())))
  .replace("/*__I18N__*/{ en: {}, langs: [] }", () => inline(JSON.stringify(i18n)));

const leftover = html.match(/__[A-Z_]+__/);
if (leftover) throw new Error(`Unfilled placeholder in site/template.html: ${leftover[0]}`);

writeFileSync(join(outDir, "index.html"), html);
writeFileSync(join(outDir, ".nojekyll"), "");

const providers = locations.reduce((n, l) => n + l.p.length, 0);
console.log(`Built site-dist/index.html: ${locations.length} locations, ${providers} providers, data as of ${dataDateLabel} (${Math.round(html.length / 1024)} KB)`);
