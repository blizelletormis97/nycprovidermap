# Medicaid Finder

A care manager tool for OPWDD to discover healthcare and developmental disability services in NYC (Manhattan & Bronx).

## Overview

Care managers use this tool to quickly identify and locate providers and programs for their clients with developmental disabilities. The interactive map displays provider locations with filtering by data source and service type, supporting healthcare services (Medicaid/Medicare), OPWDD waiver services, and Article 16 clinics.

## Features

- Interactive Mapbox map with clustering for dense areas
- Filter by data source (Medicaid, Medicare, OPWDD, Article 16, or all)
- Filter by healthcare services (Physicians, Therapy, Mental Health, Dental, etc.)
- Filter by OPWDD services (Day Habilitation, Community Habilitation, Residential, etc.)
- Click locations to view provider details and available services
- Dark/light theme support

## Tech Stack

- **Framework**: Next.js 16, React 19
- **Map**: Mapbox GL via react-map-gl
- **Styling**: Tailwind CSS, Shadcn UI
- **Geo utilities**: Turf.js for polygon-based filtering

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

## Data Sources

All provider data is sourced from official government datasets and cached locally for performance.

### Medicaid Providers

**Source**: [NY Health Data - Medicaid Enrolled Provider Listing](https://health.data.ny.gov/Health/Medicaid-Enrolled-Provider-Listing/keti-qx5t)

Includes providers enrolled in NY Medicaid: dentists, physicians, psychologists, home health agencies, and DME suppliers.

### Medicare Providers

**Source**: [CMS Doctors and Clinicians (DAC) National Downloadable File](https://data.cms.gov/provider-data/dataset/mj5m-pzi6)

Includes Medicare-enrolled providers across multiple specialties:

| Category | Specialties |
|----------|-------------|
| Primary Care | Internal Medicine, Family Practice, Pediatrics, Geriatrics, NPs, PAs |
| Mental Health | Psychiatry, Psychology, Social Work, Mental Health Counseling |
| Therapy | Physical Therapy, Occupational Therapy, Speech Therapy, Rehab Medicine |
| Other | Dental, Podiatry, Optometry, Neurology, Nutrition, Chiropractic, Allergy |

### OPWDD Providers

**Source**: [NY Open Data - Directory of DD Service Provider Agencies](https://data.ny.gov/Human-Services/Directory-of-Developmental-Disabilities-Service-Pr/ieqx-cqyk)

Voluntary sector agencies providing OPWDD waiver services:

- Day Habilitation
- Community Habilitation
- Residential (IRA)
- Supported Employment
- Prevocational
- Family Support
- Individual Support Services (ISS)
- Self-Direction
- Intermediate Care (ICF)
- Family Care

### Article 16 Clinics

**Source**: [OPWDD Article 16 Certified Clinics](https://opwdd.ny.gov/providers/article-16-clinics)

OPWDD-certified habilitative clinics providing specialized clinical services for people with developmental disabilities:

- Speech/language therapy
- Physical therapy
- Occupational therapy
- Psychological evaluations
- Counseling (individual, group, family)
- Nutrition services
- OPWDD eligibility evaluations

Article 16 clinics are staffed by professionals trained to work with the DD population and are often the preferred referral for therapy services.

## Refreshing Data

To update the cached provider data:

```bash
# Fetch and cache Medicaid providers
bun run src/lib/seed-medicaid.ts

# Fetch and cache Medicare providers (requires DAC CSV in src/data/raw/)
bun run src/lib/seed-medicare.ts

# Fetch and cache OPWDD providers
bun run src/lib/seed-opwdd.ts

# Fetch and cache Article 16 clinics
bun run src/lib/seed-article16.ts
```

### Medicare Data Setup

The Medicare seed script requires the CMS DAC National Downloadable File:

1. Download from [CMS Provider Data](https://data.cms.gov/provider-data/dataset/mj5m-pzi6)
2. Place the CSV at `src/data/raw/DAC_NationalDownloadableFile.csv`
3. Run the seed script (takes ~7 minutes to parse and geocode)

## Project Structure

```
src/
├── app/
│   ├── api/providers/   # API route returning GeoJSON data
│   └── page.tsx         # Main page with map
├── components/
│   ├── provider-map.tsx # Interactive map component
│   └── map-filter.tsx   # Filter sidebar
├── data/
│   ├── raw/             # Source data files (CSV, JSON)
│   ├── boundaries/      # NYC borough GeoJSON for filtering
│   └── *-geocoded.json  # Cached provider data
├── lib/
│   ├── api.ts           # Data access and normalization
│   ├── constants.ts     # Service types and configuration
│   ├── geo-utils.ts     # Geographic filtering utilities
│   └── seed-*.ts        # Data fetching/processing scripts
└── types/
    └── providers.ts     # TypeScript interfaces
```

## Provider Counts (as of Jan 2026)

| Source | Providers | Notes |
|--------|-----------|-------|
| Medicaid | ~varies | Dentists, physicians, home health, DME |
| Medicare | ~16,000 | 16 specialty categories |
| OPWDD | ~60 | Waiver service agencies |
| Article 16 | 30 | Specialized DD clinics + satellites |
