# IDD Medicaid Provider Finder

A care manager tool for finding **intellectual and developmental disability (IDD) providers that accept Medicaid**
across **all of New York State**, organized by OPWDD region:

| OPWDD region | Regional offices | Map areas |
|---|---|---|
| Region 1 | Western New York, Finger Lakes | Region 1 (17 counties) |
| Region 2 | Central New York, Broome, Sunmount | Region 2 (20 counties) |
| Region 3 | Capital District, Hudson Valley, Taconic | Region 3 (18 counties) |
| Region 4 | Metro NY, Brooklyn, Bernard M. Fineson, Staten Island | Manhattan, Brooklyn, Bronx, Queens, Staten Island |
| Region 5 | Long Island | Nassau, Suffolk |

The county lists live in `OPWDD_REGIONS` (`src/lib/constants.ts`). They match the regional office named for each
agency in the NY Open Data OPWDD directory; nine counties with no agencies there (Genesee, Orleans, Wyoming,
Schuyler, Yates, Hamilton, Lewis, Greene, Schoharie) follow OPWDD's regional structure.

## Features

- Interactive Mapbox map with clustering; marker color shows the data source
- Search by provider name, street or ZIP code, and jump straight to a result
- Filter by OPWDD region (Region 1 to Region 5), data source and service
- Search also matches county names (e.g. "Monroe", "Albany")
- Click a location to see every provider there, with phone (tap to call), website, program details and a directions link
- Providers at the same building are grouped onto one pin, even across datasets
- Zoom and "locate me" controls, mobile-friendly layout, dark/light theme

## Tech Stack

- **Framework**: Next.js 16, React 19
- **Map**: Mapbox GL via react-map-gl
- **Styling**: Tailwind CSS, Shadcn UI
- **Geo utilities**: Turf.js for borough polygon checks

## Getting Started

### Prerequisites

- Node.js 20+
- [Mapbox access token](https://account.mapbox.com/access-tokens/)

### Setup

1. Install dependencies:

```bash
bun install
```

2. Create `.env.local` with your Mapbox token:

```
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
```

3. Run the development server:

```bash
bun dev
```

Open [http://localhost:3001](http://localhost:3001) to view the app.

The app needs a Node server (`next start` or Vercel): provider details and search are served by
`/api/locations/[id]` and `/api/search`.

## Public website (GitHub Pages)

A static version of the map is published to GitHub Pages at
**https://blizelletormis97.github.io/nycprovidermap/** by `.github/workflows/pages.yml` on every push to `main`
(or run it by hand from the Actions tab). It uses OpenStreetMap street tiles, so it needs no Mapbox token, and
runs entirely in the browser with the provider data built into the page.

- Page template: `site/template.html`
- Build locally: `bun run build:site` writes `site-dist/index.html`
- One-time setup: in the repo go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**

After refreshing provider data with the seed scripts, commit the updated `src/data/*.json` and merge to `main`;
the site rebuilds automatically.

### About us section

The website's **About us** button opens a card with the names of the people behind the map and how it started.
Its text lives in `site/about.json`: fill in each person's `name` (and optional `role`), the `story` paragraphs,
an optional `intro` and `signoff`, then set `"show": true`. Until then the button stays hidden, so placeholder text
never appears on the public site. Visitors can also link straight to it with `#about` at the end of the site address.

## What counts as "IDD provider that accepts Medicaid"

Only these three sources are shown. Each one is IDD-specific and tied to Medicaid:

### Article 16 Clinics

**Source**: [OPWDD Article 16 Certified Clinics](https://opwdd.ny.gov/providers/article-16-clinics) (statewide "Clinic Programs and Satellites" list, `src/data/raw/article-16-clinics.pdf`)

OPWDD-certified clinics (main sites and satellites) that bill Medicaid for clinical services for people with IDD:
speech, physical and occupational therapy, psychology and counseling, nutrition, and OPWDD eligibility evaluations.
Addresses are geocoded with the free U.S. Census geocoder, and the geocoded county decides the area.

### OPWDD Agencies

**Source**: [NY Open Data - Directory of DD Service Provider Agencies](https://data.ny.gov/Human-Services/Directory-of-Developmental-Disabilities-Service-Pr/ieqx-cqyk)

OPWDD-certified agencies and the services they provide. Agencies are kept only if they offer at least one
**Medicaid-funded** OPWDD service (HCBS waiver services such as Day/Community Habilitation, Residential IRA,
Prevocational, Supported Employment, ISS, Self-Direction, Family Care, or ICF). Family Support Services are
state-funded, so agencies offering only Family Support are left out. The pin is the agency's office address.

### Medicaid-Enrolled IDD Sites

**Source**: [NY Health Data - Medicaid Enrolled Provider Listing](https://health.data.ny.gov/Health/Medicaid-Enrolled-Provider-Listing/keti-qx5t)

Sites enrolled in NY Medicaid under the IDD-specific provider types:

| Medicaid type | Shown as |
|---|---|
| COMMUNITY SUPPORT (OPWDD) | OPWDD Community Support Site (residences, day programs) |
| INTERMEDIATE CARE FACILITY (OPWDD) | Intermediate Care (ICF/IID) |
| OPWDD STATE-OPERATED CLINIC | OPWDD State-Operated Clinic |

### Home Health Agencies (OPWDD special needs)

**Source**: [NYS DOH Special Needs Certified Home Health Agencies](https://profiles.health.ny.gov/home_care/special_needs)

Certified home health agencies the Department of Health has approved to serve people who would otherwise need care
in an OPWDD-licensed program. Kept only if they serve a county in the service area, their CHHA office is found in the
DOH Health Facility dataset, and they are enrolled in Medicaid as a Certified Home Health Agency (matched by address, or by name when the
agency enrolled from another office).
They visit people at home, so the map shows them in every area they serve, not just their office's area.

Six agencies qualify: Able Health Care Service, Americare Certified Special Services and Extended Home Care (NYC and
Long Island; Americare also Region 3), Datahr Home Health Care and Willcare (Region 3) and People Home Health
Services-Certified (Region 1). Agencies on the DOH list approved for other populations (e.g. medically fragile children)
are left out.

### Evaluations

The **IDD clinic evaluations** filter shows the Article 16 clinics and OPWDD state clinics, which are certified to
provide psychological evaluations and OPWDD eligibility evaluations. The data does not say which clinics do autism
diagnosis specifically, so call to confirm.

## Refreshing Data

```bash
# OPWDD region outlines for the website map (only when region definitions change)
bun run src/lib/build-boundaries.ts

# OPWDD agencies (NY Open Data)
bun run src/lib/seed-opwdd.ts

# Medicaid-enrolled IDD sites (NY Health Data)
bun run src/lib/seed-medicaid.ts

# Home health agencies (reads the DOH special-needs page; run after seed-medicaid)
bun run src/lib/seed-home-care.ts

# Article 16 clinics (parses src/data/raw/article-16-raw.json, geocodes with the Census geocoder; ~5 min;
# run after seed-opwdd so phone numbers can be updated from the newer OPWDD directory)
bun run src/lib/seed-article16.ts

# Check Article 16 addresses against current Medicaid clinic enrollments (flags the rest "call to confirm")
bun run src/lib/verify-article16.ts
```

To update Article 16 clinics, download the latest list from OPWDD, extract its table to
`src/data/raw/article-16-raw.json` (e.g. with tabula, lattice mode), and re-run the script. It prints any
addresses it could not geocode; add those to `MANUAL_LOCATIONS` in the script. 18 rural upstate sites (mostly
route and county-road addresses) are currently not placed.

## Project Structure

```
src/
├── app/
│   ├── api/locations/[id]/ # Provider details for one location (loaded on click)
│   ├── api/search/         # Provider name search
│   └── page.tsx            # Main page with map (compact location GeoJSON)
├── components/
│   ├── provider-map.tsx    # Interactive map component
│   └── map-filter.tsx      # Search + filter sidebar
├── data/
│   ├── raw/                # Article 16 source list (PDF + extracted table)
│   ├── boundaries/         # NYC borough GeoJSON + simplified OPWDD region outlines
│   └── *-geocoded.json     # Cached provider data
├── lib/
│   ├── api.ts              # Data access, location grouping, search
│   ├── constants.ts        # Service area, service catalog, source colors and labels
│   ├── geo-utils.ts        # Service-area (region) checks
│   ├── build-site.ts       # Builds the GitHub Pages site from the cached data
│   ├── seed-utils.ts       # Shared helpers for seed scripts
│   └── seed-*.ts           # Data fetching/processing scripts
└── types/
    └── providers.ts        # TypeScript interfaces
```

## Provider Counts (Nov 2026)

| Source | Providers |
|--------|-----------|
| Article 16 clinic sites | 402 |
| OPWDD agencies | 343 |
| Medicaid-enrolled IDD sites | 1,458 |
| Home health agencies (OPWDD special needs) | 6 |
| **Total** | **2,209** at 1,401 map locations |

| Area | Map locations |
|------|-----------|
| Region 1 · Western NY & Finger Lakes | 241 |
| Region 2 · Central NY, Broome & Sunmount | 188 |
| Region 3 · Capital District, Hudson Valley & Taconic | 340 |
| Brooklyn | 163 |
| Queens | 101 |
| Suffolk | 99 |
| Manhattan | 82 |
| Bronx | 70 |
| Nassau | 68 |
| Staten Island | 49 |

## Data quality notes

- **Article 16 locations** are placed, in order of trust, by a hand-checked location, the state's own coordinates
  for the same building (OPWDD directory or Medicaid listing), or the U.S. Census geocoder. A Census match is used
  only when its street and house number agree with the clinic's address (`geocodeMatchAgrees` in
  `src/lib/seed-utils.ts`). This rejects near-misses such as "376 Bay 44th Street" being matched to "376 44th St".
- **Office and billing addresses** are flagged (`office: true`) and labeled on the map: every OPWDD agency
  (administrative offices) and Medicaid "rate set" billing enrollments.
- The Article 16 clinic list in `src/data/raw/` is dated October 2024. As of November 2026 it is still the newest
  list OPWDD publishes (the copy posted in October 2026 is identical). To keep it as current as possible:
  - **Phones:** when an agency is also in the OPWDD agency directory (updated March 2026) with a different number,
    the directory's number is used.
  - **Addresses:** `verify-article16.ts` confirms each address against the weekly-updated Medicaid listing (a
    Medicaid-enrolled clinic at the same address today). Unconfirmed sites are labeled "call to confirm" on the map.
- Phone extensions are kept and shown as "ext. 1234".
- Medicaid enrollment does not mean a provider has openings. Confirm with the provider before referring.
