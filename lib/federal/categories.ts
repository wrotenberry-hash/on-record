/**
 * The 14 issue categories (fixed until launch) and the default mapping from
 * Congress.gov policy areas and legislative subjects. Pure: no relative
 * imports. The mapping is seeded into `category_mappings`, where it can be
 * edited; seeding inserts only rows that are missing, so edits persist.
 * The full table, with the reasoning for each row, is in docs/ISSUE_MAPPING.md.
 */
export const ISSUE_CATEGORIES = [
  { slug: "health-care", name: "Health care" },
  { slug: "taxes", name: "Taxes" },
  { slug: "economy-jobs", name: "Economy & jobs" },
  { slug: "cost-of-living-housing", name: "Cost of living & housing" },
  { slug: "education", name: "Education" },
  { slug: "immigration", name: "Immigration" },
  { slug: "public-safety-crime", name: "Public safety & crime" },
  { slug: "guns", name: "Guns" },
  { slug: "abortion", name: "Abortion" },
  { slug: "energy-environment", name: "Energy & environment" },
  { slug: "defense-veterans", name: "Defense & veterans" },
  { slug: "elections-government", name: "Elections & government" },
  { slug: "tech-privacy", name: "Tech & privacy" },
  { slug: "agriculture-rural", name: "Agriculture & rural" },
] as const;
export type CategorySlug = typeof ISSUE_CATEGORIES[number]["slug"];

export type Mapping = { id: string; sourceKind: "policy_area" | "subject"; matchKind: "exact" | "contains"; sourceValue: string; categorySlug: string; note: string | null; active?: number };

const m = (sourceKind: Mapping["sourceKind"], matchKind: Mapping["matchKind"], sourceValue: string, categorySlug: CategorySlug, note: string | null = null): Mapping =>
  ({ id: `${sourceKind}:${matchKind}:${sourceValue.toLowerCase()}=>${categorySlug}`, sourceKind, matchKind, sourceValue, categorySlug, note });

/** Congress.gov's 32 policy areas, each placed in at most one category; areas with no fit stay unmapped on purpose. */
export const DEFAULT_MAPPINGS: Mapping[] = [
  m("policy_area", "exact", "Health", "health-care"),
  m("policy_area", "exact", "Taxation", "taxes"),
  m("policy_area", "exact", "Economics and Public Finance", "economy-jobs", "Budget, debt, appropriations"),
  m("policy_area", "exact", "Commerce", "economy-jobs"),
  m("policy_area", "exact", "Labor and Employment", "economy-jobs"),
  m("policy_area", "exact", "Finance and Financial Sector", "economy-jobs"),
  m("policy_area", "exact", "Foreign Trade and International Finance", "economy-jobs", "Tariffs and trade"),
  m("policy_area", "exact", "Transportation and Public Works", "economy-jobs", "Infrastructure"),
  m("policy_area", "exact", "Housing and Community Development", "cost-of-living-housing"),
  m("policy_area", "exact", "Social Welfare", "cost-of-living-housing", "Benefits such as SNAP and Social Security"),
  m("policy_area", "exact", "Education", "education"),
  m("policy_area", "exact", "Immigration", "immigration"),
  m("policy_area", "exact", "Crime and Law Enforcement", "public-safety-crime"),
  m("policy_area", "exact", "Emergency Management", "public-safety-crime", "Disasters and emergency response"),
  m("policy_area", "exact", "Energy", "energy-environment"),
  m("policy_area", "exact", "Environmental Protection", "energy-environment"),
  m("policy_area", "exact", "Public Lands and Natural Resources", "energy-environment"),
  m("policy_area", "exact", "Water Resources Development", "energy-environment"),
  m("policy_area", "exact", "Armed Forces and National Security", "defense-veterans"),
  m("policy_area", "exact", "Government Operations and Politics", "elections-government"),
  m("policy_area", "exact", "Congress", "elections-government"),
  m("policy_area", "exact", "Science, Technology, Communications", "tech-privacy"),
  m("policy_area", "exact", "Agriculture and Food", "agriculture-rural"),
  // Subjects catch issues that have no policy area of their own.
  m("subject", "exact", "Firearms and explosives", "guns"),
  m("subject", "exact", "Abortion", "abortion"),
  m("subject", "contains", "Veterans'", "defense-veterans", "Veterans' benefits, medical care, education and so on"),
  m("subject", "exact", "Right of privacy", "tech-privacy"),
  m("subject", "exact", "Elections, voting, political campaign regulation", "elections-government"),
  m("subject", "exact", "Rural conditions and development", "agriculture-rural"),
  m("subject", "exact", "Prescription drugs", "health-care"),
  m("subject", "exact", "Cost of living", "cost-of-living-housing"),
];

/** Categories for one bill: every active mapping whose source matches. Same inputs, same result, for every bill and sponsor. */
export function categorize(policyArea: string | null, subjects: readonly string[], mappings: readonly Mapping[]): Array<{ slug: string; mappingId: string }> {
  const out = new Map<string, string>();
  const norm = (s: string) => s.trim().toLowerCase();
  for (const map of mappings) {
    if (map.active === 0) continue;
    const values = map.sourceKind === "policy_area" ? (policyArea ? [policyArea] : []) : subjects;
    const hit = values.some(v => map.matchKind === "exact" ? norm(v) === norm(map.sourceValue) : norm(v).includes(norm(map.sourceValue)));
    if (hit && !out.has(map.categorySlug)) out.set(map.categorySlug, map.id);
  }
  return [...out].map(([slug, mappingId]) => ({ slug, mappingId }));
}
