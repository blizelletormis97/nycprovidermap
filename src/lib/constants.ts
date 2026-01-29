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

// OPWDD service types for UI filtering
export const OPWDD_SERVICE_TYPES = [
  "DAY HABILITATION",
  "COMMUNITY HABILITATION",
  "RESIDENTIAL (IRA)",
  "SUPPORTED EMPLOYMENT",
  "PREVOCATIONAL",
  "FAMILY SUPPORT",
] as const;

// Healthcare service types for UI filtering (Medicaid/Medicare)
export const HEALTHCARE_SERVICE_TYPES = [
  // Primary Care
  "PHYSICIAN",           // Includes Family Medicine, Internal Medicine, General Practice, etc.
  "DENTAL",              // All dentist types

  // Mental/Behavioral Health
  "PSYCHIATRY",          // Psychiatrists
  "PSYCHOLOGY",          // Psychologists
  "SOCIAL WORK",         // Clinical Social Workers
  "MENTAL HEALTH COUNSELING", // Mental Health Counselors

  // Therapy Services (critical for OPWDD)
  "PHYSICAL THERAPY",    // Physical Therapists
  "OCCUPATIONAL THERAPY", // Occupational Therapists
  "SPEECH THERAPY",      // Speech Language Pathologists
  "REHAB MEDICINE",      // Physical Medicine & Rehabilitation

  // Other Healthcare
  "PODIATRY",            // Podiatrists
  "OPTOMETRY",           // Optometrists
  "NUTRITION",           // Dietitians
  "NEUROLOGY",           // Neurologists
  "ALLERGY/IMMUNOLOGY",  // Allergists
  "CHIROPRACTIC",        // Chiropractors

  // Home/Equipment
  "HOME HEALTH",         // All home health types
  "DME",                 // Durable Medical Equipment suppliers & dealers
] as const;

// Article 16 Clinic service types
export const ARTICLE16_SERVICE_TYPES = [
  "ARTICLE 16 CLINIC",
] as const;

// Combined provider types for UI filtering (normalized names)
export const PROVIDER_TYPES = [
  ...HEALTHCARE_SERVICE_TYPES,
  ...OPWDD_SERVICE_TYPES,
  ...ARTICLE16_SERVICE_TYPES,
];

// Display labels for service types
export const TYPE_LABELS: Record<string, string> = {
  // Primary Care
  PHYSICIAN: "Physician / Primary Care",
  DENTAL: "Dental",

  // Mental/Behavioral Health
  PSYCHIATRY: "Psychiatry",
  PSYCHOLOGY: "Psychology",
  "SOCIAL WORK": "Social Work",
  "MENTAL HEALTH COUNSELING": "Mental Health Counseling",

  // Therapy Services
  "PHYSICAL THERAPY": "Physical Therapy",
  "OCCUPATIONAL THERAPY": "Occupational Therapy",
  "SPEECH THERAPY": "Speech Therapy",
  "REHAB MEDICINE": "Rehab Medicine",

  // Other Healthcare
  PODIATRY: "Podiatry",
  OPTOMETRY: "Optometry",
  NUTRITION: "Nutrition / Dietitian",
  NEUROLOGY: "Neurology",
  "ALLERGY/IMMUNOLOGY": "Allergy / Immunology",
  CHIROPRACTIC: "Chiropractic",

  // Home/Equipment
  "HOME HEALTH": "Home Health",
  DME: "Durable Medical Equipment",

  // OPWDD Services
  "DAY HABILITATION": "Day Habilitation",
  "COMMUNITY HABILITATION": "Community Habilitation",
  "RESIDENTIAL (IRA)": "Residential (IRA)",
  "SUPPORTED EMPLOYMENT": "Supported Employment",
  PREVOCATIONAL: "Prevocational",
  "FAMILY SUPPORT": "Family Support",

  // Article 16
  "ARTICLE 16 CLINIC": "Article 16 Clinic",
};

// Source badge configuration (full class strings for Tailwind)
export const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  medicaid: { label: "Medicaid", className: "bg-blue-500/20 text-blue-600 dark:text-blue-400" },
  medicare: { label: "Medicare", className: "bg-green-500/20 text-green-600 dark:text-green-400" },
  opwdd: { label: "OPWDD", className: "bg-purple-500/20 text-purple-600 dark:text-purple-400" },
  article16: { label: "Article 16", className: "bg-orange-500/20 text-orange-600 dark:text-orange-400" },
};
