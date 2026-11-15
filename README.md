# IDD Medicaid Provider Finder

A care manager tool for finding **intellectual and developmental disability (IDD) providers that accept Medicaid** in:

- **New York City** — Manhattan, Brooklyn, the Bronx, Queens and Staten Island
- **Long Island** — Nassau and Suffolk counties

To add another county, add it to `REGIONS` / `TARGET_COUNTIES` in `src/lib/constants.ts` and to
`src/lib/geo-utils.ts`, then re-run the seed scripts.

## Features

- Interactive Mapbox map with clustering; marker color shows the data source
- Search by provider name, street or ZIP code, and jump straight to a result
- Filter by area (borough / Long Island county), data source and service
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

## Refreshing Data

```bash
# OPWDD agencies (NY Open Data)
bun run src/lib/seed-opwdd.ts

# Medicaid-enrolled IDD sites (NY Health Data)
bun run src/lib/seed-medicaid.ts

# Article 16 clinics (parses src/data/raw/article-16-raw.json, geocodes with the Census geocoder; ~5 min)
bun run src/lib/seed-article16.ts
```

To update Article 16 clinics, download the latest list from OPWDD, extract its table to
`src/data/raw/article-16-raw.json` (e.g. with tabula, lattice mode), and re-run the script. It prints any
addresses it could not geocode; add those to `MANUAL_LOCATIONS` in the script if they are in the service area.

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
│   ├── boundaries/         # NYC borough GeoJSON + simplified service-area county outlines
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
| Article 16 clinic sites | 139 |
| OPWDD agencies | 164 |
| Medicaid-enrolled IDD sites | 679 |
| **Total** | **982** at 634 map locations |

| Area | Map locations |
|------|-----------|
| Brooklyn | 161 |
| Queens | 102 |
| Suffolk | 100 |
| Manhattan | 82 |
| Bronx | 70 |
| Nassau | 70 |
| Staten Island | 49 |
