import type { DataSource, Region } from "@/types/providers";

// Service area: the five NYC boroughs plus Long Island's Nassau and Suffolk counties
export const REGIONS: Region[] = [
  "Manhattan", "Brooklyn", "Bronx", "Queens", "Staten Island", "Nassau", "Suffolk", "Region 1", "Region 2", "Region 3",
];

// OPWDD regions (groups of Developmental Disabilities Regional/State Operations Offices) and the counties in each.
// Checked against the regional office named for each agency in the NY Open Data OPWDD directory; Genesee, Orleans,
// Wyoming, Schuyler, Yates, Hamilton, Lewis, Greene and Schoharie have no agencies there and follow OPWDD's structure.
export const OPWDD_REGIONS: { id: 1 | 2 | 3 | 4 | 5; name: string; offices: string; counties: string[] }[] = [
  {
    id: 1, name: "Western NY & Finger Lakes", offices: "Western New York and Finger Lakes",
    counties: ["Allegany", "Cattaraugus", "Chautauqua", "Erie", "Genesee", "Niagara", "Orleans", "Wyoming",
      "Chemung", "Livingston", "Monroe", "Ontario", "Schuyler", "Seneca", "Steuben", "Wayne", "Yates"],
  },
  {
    id: 2, name: "Central NY, Broome & Sunmount", offices: "Central New York, Broome and Sunmount",
    counties: ["Cayuga", "Cortland", "Herkimer", "Madison", "Oneida", "Onondaga", "Oswego",
      "Broome", "Chenango", "Delaware", "Otsego", "Tioga", "Tompkins",
      "Clinton", "Essex", "Franklin", "Hamilton", "Jefferson", "Lewis", "St. Lawrence"],
  },
  {
    id: 3, name: "Capital District, Hudson Valley & Taconic", offices: "Capital District, Hudson Valley and Taconic",
    counties: ["Albany", "Fulton", "Greene", "Montgomery", "Rensselaer", "Saratoga", "Schenectady", "Schoharie",
      "Warren", "Washington", "Orange", "Rockland", "Sullivan", "Westchester", "Columbia", "Dutchess", "Putnam", "Ulster"],
  },
  { id: 4, name: "New York City", offices: "Metro New York, Brooklyn, Bernard M. Fineson and Staten Island", counties: ["Bronx", "Kings", "New York", "Queens", "Richmond"] },
  { id: 5, name: "Long Island", offices: "Long Island", counties: ["Nassau", "Suffolk"] },
];

// Display names for the map areas
export const REGION_LABELS: Record<Region, string> = {
  Manhattan: "Manhattan", Brooklyn: "Brooklyn", Bronx: "Bronx", Queens: "Queens", "Staten Island": "Staten Island",
  Nassau: "Nassau", Suffolk: "Suffolk",
  "Region 1": "Region 1 · Western NY & Finger Lakes",
  "Region 2": "Region 2 · Central NY, Broome & Sunmount",
  "Region 3": "Region 3 · Capital District, Hudson Valley & Taconic",
};

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
      t("Intermediate Care (ICF)", "Intermediate Care (ICF/IID)"),
      t("OPWDD Community Support Site", "OPWDD Community Support Site"),
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
      t("Special Needs Home Health", "Home health (DOH special needs, OPWDD)"),
    ],
  },
  {
    id: "cdpap",
    heading: "CDPAP (PPL)",
    types: [
      t("CDPAP Facilitator (Developmental Disabilities Focus)", "CDPAP facilitators - developmental disabilities focus"),
      t("CDPAP Facilitator", "CDPAP facilitators - all other"),
    ],
  },
  {
    id: "aba",
    heading: "ABA Therapy",
    types: [
      t("ABA Therapy (Straight Medicaid)", "ABA therapy - accepts straight Medicaid"),
      t("ABA Therapy (Managed Medicaid Only)", "ABA therapy - managed Medicaid plans only"),
    ],
  },
  {
    id: "clinic",
    heading: "Clinical Services",
    types: [
      t("Article 16 Clinic", "Article 16 Clinic (main site)"),
      t("Article 16 Satellite"),
      t("OPWDD State-Operated Clinic"),
      t("OPWDD Registered Therapy Practice", "Registered therapy practices (contract with OPWDD agencies)"),
    ],
  },
];

export const ALL_SERVICE_KEYS: string[] = SERVICE_GROUPS.flatMap((g) => g.types.map((type) => type.key));
export const KNOWN_SERVICE_KEYS = new Set(ALL_SERVICE_KEYS);

export const SOURCE_ORDER: DataSource[] = ["article16", "opwdd", "homecare", "cdpap", "registered", "aba", "medicaid"];

// Services the map does not show (removed at the owner's request): group homes, family care homes and developmental
// centers. A provider offering only these is left off the map.
export const HIDDEN_SERVICES = new Set(["Residential (IRA)", "Family Care", "Developmental Centers"]);

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
  homecare: {
    label: "Home Health",
    longLabel: "Home Health Agencies (OPWDD special needs)",
    className: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    color: "#4fcf8e",
  },
  registered: {
    label: "Registered",
    longLabel: "OPWDD Registered Therapy Practices",
    className: "bg-pink-500/20 text-pink-700 dark:text-pink-400",
    color: "#f27fbb",
  },
  cdpap: {
    label: "CDPAP",
    longLabel: "CDPAP Facilitators (PPL)",
    className: "bg-teal-500/20 text-teal-700 dark:text-teal-400",
    color: "#2fbfae",
  },
  aba: {
    label: "ABA",
    longLabel: "ABA Therapy Practices (Medicaid-enrolled)",
    className: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
    color: "#f5b83d",
  },
  medicaid: {
    label: "Medicaid IDD",
    longLabel: "Medicaid-Enrolled IDD Sites",
    className: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
    color: "#3fc1e9",
  },
};
