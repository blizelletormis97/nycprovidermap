import type { DataSource } from "@/types/providers";

// Filter for specific provider types (Medicaid API)
export const MEDICAID_TYPES = [
  "DENTIST",
  "PSYCHOLOG", // Matches CLINICAL PSYCHOLOGIST
  "HOME HEALTH", // Matches HOME HEALTH CARE, CERTIFIED HOME HEALTH AGENCY, LONG TERM HOME HEALTH CARE
  "PHYSICIAN",
  "EQUIPMENT", // Matches MEDICAL EQUIPMENT SUPPLIERS & DEALER, OXYGEN AND RELATED EQUIPMENT DEALER
];

// Manhattan + Bronx only
export const TARGET_COUNTIES = ["NEW YORK", "BRONX"];

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
    id: "dd",
    heading: "OPWDD Services",
    types: [
      t("Day Habilitation"),
      t("Community Habilitation"),
      t("Residential (IRA)"),
      t("Individual Support (ISS)"),
      t("Supported Employment"),
      t("Prevocational"),
      t("Family Support"),
      t("Self-Direction"),
      t("Intermediate Care (ICF)"),
      t("Family Care"),
      t("Developmental Centers"),
    ],
  },
  {
    id: "article16",
    heading: "Article 16 Clinics",
    types: [t("Article 16 Clinic", "Article 16 Clinic (main site)"), t("Article 16 Satellite", "Article 16 Satellite")],
  },
  {
    id: "primary",
    heading: "Primary & Specialty Care",
    types: [
      t("Physician", "Physician / Primary Care"),
      t("Dental"),
      t("Neurology"),
      t("Podiatry"),
      t("Optometry"),
      t("Allergy/Immunology", "Allergy / Immunology"),
      t("Chiropractic"),
      t("Nutrition", "Nutrition / Dietitian"),
    ],
  },
  {
    id: "therapy",
    heading: "Therapy & Rehab",
    types: [
      t("Physical Therapy"),
      t("Occupational Therapy"),
      t("Speech Therapy"),
      t("Rehab Medicine"),
    ],
  },
  {
    id: "behavioral",
    heading: "Behavioral Health Clinicians",
    types: [
      t("Psychiatry"),
      t("Psychology"),
      t("Social Work"),
      t("Mental Health Counseling"),
    ],
  },
  {
    id: "omh",
    heading: "OMH Mental Health Programs",
    types: [
      t("Mental Health Clinic", "Outpatient Clinic / PROS"),
      t("Intensive Community Treatment", "ACT / Intensive Outreach"),
      t("Crisis Services"),
      t("Inpatient Psychiatric"),
      t("Children & Family Services", "Children & Family (CFTSS)"),
      t("MH Care Management", "Care Management / Health Home"),
      t("MH Employment Services", "Employment Services"),
      t("Peer & Recovery Support"),
    ],
  },
  {
    id: "facilities",
    heading: "Hospitals & Facilities",
    types: [
      t("Hospital"),
      t("Community Clinic", "Community Clinic (D&TC)"),
      t("School-Based Clinic"),
      t("Nursing Home"),
      t("Adult Care Facility", "Adult Home / Assisted Living"),
      t("Adult Day Health Care"),
      t("Hospice"),
    ],
  },
  {
    id: "home",
    heading: "Home Care & Equipment",
    types: [t("Home Health", "Home Health / Home Care"), t("DME", "Durable Medical Equipment")],
  },
];

export const ALL_SERVICE_KEYS: string[] = SERVICE_GROUPS.flatMap((g) => g.types.map((type) => type.key));
export const KNOWN_SERVICE_KEYS = new Set(ALL_SERVICE_KEYS);

export const SOURCE_ORDER: DataSource[] = ["article16", "opwdd", "omh", "facilities", "medicaid", "medicare"];

// Source configuration: badge classes (full strings for Tailwind) and map marker colors
export const SOURCE_CONFIG: Record<DataSource, { label: string; longLabel: string; className: string; color: string }> = {
  article16: {
    label: "Article 16",
    longLabel: "Article 16 Clinics",
    className: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
    color: "#f97316",
  },
  opwdd: {
    label: "OPWDD",
    longLabel: "OPWDD Agencies",
    className: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
    color: "#8b5cf6",
  },
  omh: {
    label: "OMH",
    longLabel: "OMH Mental Health Programs",
    className: "bg-pink-500/20 text-pink-700 dark:text-pink-400",
    color: "#ec4899",
  },
  facilities: {
    label: "NYS Facility",
    longLabel: "Hospitals, Clinics & Facilities",
    className: "bg-teal-500/20 text-teal-700 dark:text-teal-400",
    color: "#14b8a6",
  },
  medicaid: {
    label: "Medicaid",
    longLabel: "Medicaid Providers",
    className: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
    color: "#3b82f6",
  },
  medicare: {
    label: "Medicare",
    longLabel: "Medicare Providers",
    className: "bg-green-500/20 text-green-700 dark:text-green-400",
    color: "#22c55e",
  },
};
