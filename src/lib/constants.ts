import type { DataSource, Region } from "@/types/providers";

// Service area: the five NYC boroughs plus Long Island's Nassau and Suffolk counties
export const REGIONS: Region[] = ["Manhattan", "Brooklyn", "Bronx", "Queens", "Staten Island", "Nassau", "Suffolk"];

// County names as they appear in the NY open-data sets
export const TARGET_COUNTIES = ["NEW YORK", "KINGS", "BRONX", "QUEENS", "RICHMOND", "NASSAU", "SUFFOLK"];

// Medicaid Enrolled Provider Listing types that are specific to OPWDD / IDD services
export const MEDICAID_IDD_TYPES: Record<string, string> = {
  "COMMUNITY SUPPORT (OPWDD)": "OPWDD Community Support Site",
  "INTERMEDIATE CARE FACILITY (OPWDD)": "Intermediate Care (ICF)",
  "OPWDD STATE-OPERATED CLINIC": "OPWDD State-Operated Clinic",
};

// OPWDD services funded through Medicaid (HCBS waiver, ICF, state-operated). Family Support Services are
// state-funded, so an agency offering only Family Support is not shown.
export const OPWDD_MEDICAID_SERVICES = new Set([
  "Day Habilitation",
  "Community Habilitation",
  "Residential (IRA)",
  "Supported Employment",
  "Prevocational",
  "Individual Support (ISS)",
  "Self-Direction",
  "Intermediate Care (ICF)",
  "Family Care",
  "Developmental Centers",
]);

// OPWDD service field mappings (API field name -> display name)
export const OPWDD_SERVICE_FIELDS = {
  day_habilitation: "Day Habilitation",
  community_habilitation: "Community Habilitation",
  individual_residential_alternative_ira: "Residential (IRA)",
  supported_employment_enrollments: "Supported Employment",
  prevocational: "Prevocational",
  family_support_services: "Family Support",
  individual_support_services_iss: "Individual Support (ISS)",
  self_direction_services: "Self-Direction",
  intermediate_care_facilities_icf_s: "Intermediate Care (ICF)",
  family_care: "Family Care",
  developmental_centers_and_special_population_services: "Developmental Centers",
} as const;

export interface ServiceType {
  /** Normalized service name — must match the output of normalizeServiceType() exactly */
  key: string;
  /** Label shown in the filter panel */
  label: string;
}

export interface ServiceGroup {
  id: string;
  heading: string;
  types: ServiceType[];
}

const t = (key: string, label = key): ServiceType => ({ key, label });

/**
 * The single source of truth for service categories shown in the filter panel.
 * Every normalized service type produced by api.ts should appear here, otherwise
 * locations offering only that service can never be shown.
 */
export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: "residential",
    heading: "Residential",
    types: [
      t("Residential (IRA)", "Residential (IRA / group home)"),
      t("Intermediate Care (ICF)", "Intermediate Care (ICF/IID)"),
      t("Family Care"),
      t("OPWDD Community Support Site", "OPWDD Community Support Site"),
      t("Developmental Centers"),
    ],
  },
  {
    id: "day",
    heading: "Day & Employment",
    types: [
      t("Day Habilitation"),
      t("Prevocational"),
      t("Supported Employment"),
    ],
  },
  {
    id: "community",
    heading: "Community & In-Home",
    types: [
      t("Community Habilitation"),
      t("Individual Support (ISS)"),
      t("Self-Direction"),
      t("Family Support", "Family Support (state-funded)"),
    ],
  },
  {
    id: "clinic",
    heading: "Clinical Services",
    types: [
      t("Article 16 Clinic", "Article 16 Clinic (main site)"),
      t("Article 16 Satellite"),
      t("OPWDD State-Operated Clinic"),
    ],
  },
];

export const ALL_SERVICE_KEYS: string[] = SERVICE_GROUPS.flatMap((g) => g.types.map((type) => type.key));
export const KNOWN_SERVICE_KEYS = new Set(ALL_SERVICE_KEYS);

export const SOURCE_ORDER: DataSource[] = ["article16", "opwdd", "medicaid"];

// Source configuration: badge classes (full strings for Tailwind) and map marker colors
export const SOURCE_CONFIG: Record<DataSource, { label: string; longLabel: string; className: string; color: string }> = {
  article16: {
    label: "Article 16",
    longLabel: "Article 16 Clinics",
    className: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
    color: "#ff8b74",
  },
  opwdd: {
    label: "OPWDD",
    longLabel: "OPWDD Agencies",
    className: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
    color: "#a68bff",
  },
  medicaid: {
    label: "Medicaid IDD",
    longLabel: "Medicaid-Enrolled IDD Sites",
    className: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
    color: "#3fc1e9",
  },
};
