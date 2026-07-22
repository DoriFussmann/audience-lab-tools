/**
 * Instantly SuperSearch enums and filter helpers.
 * Single source of truth for translate validation and UI chips.
 */

export const INSTANTLY_DEPARTMENTS = [
  "Engineering",
  "Finance & Administration",
  "Human Resources",
  "IT & IS",
  "Marketing",
  "Operations",
  "Sales",
  "Support",
  "Other",
] as const;

export const INSTANTLY_LEVELS = [
  "C-Level",
  "VP-Level",
  "Director-Level",
  "Manager-Level",
  "Staff",
  "Entry level",
  "Mid-Senior level",
  "Director",
  "Associate",
  "Owner",
] as const;

export const INSTANTLY_EMPLOYEE_COUNTS = [
  "0 - 25",
  "25 - 100",
  "100 - 250",
  "250 - 1000",
  "1K - 10K",
  "10K - 50K",
  "50K - 100K",
  "> 100K",
] as const;

export const INSTANTLY_REVENUES = [
  "$0 - 1M",
  "$1 - 10M",
  "$10 - 50M",
  "$50 - 100M",
  "$100 - 250M",
  "$250 - 500M",
  "$500M - 1B",
  "> $1B",
] as const;

export const INSTANTLY_FUNDING_TYPES = [
  "angel",
  "seed",
  "pre_seed",
  "series_a",
  "series_b",
  "series_c",
  "series_d",
  "series_e",
  "series_f",
  "series_g",
] as const;

export const INSTANTLY_NEWS = [
  "launches",
  "expands_offices_to",
  "hires",
  "partners_with",
  "leaves",
  "receives_financing",
  "recognized_as",
  "closes_offices_in",
  "is_developing",
  "has_issues_with",
] as const;

/** Instantly industry enum — free-text values cause HTTP 400 from their API. */
export const INSTANTLY_INDUSTRIES = [
  "Agriculture & Mining",
  "Business Services",
  "Computers & Electronics",
  "Consumer Services",
  "Education",
  "Energy & Utilities",
  "Financial Services",
  "Government",
  "Healthcare, Pharmaceuticals, & Biotech",
  "Manufacturing",
  "Media & Entertainment",
  "Non-Profit",
  "Other",
  "Real Estate & Construction",
  "Retail",
  "Software & Internet",
  "Telecommunications",
  "Transportation & Storage",
  "Travel, Recreation, and Leisure",
  "Wholesale & Distribution",
] as const;

export type InstantlyDepartment = (typeof INSTANTLY_DEPARTMENTS)[number];
export type InstantlyLevel = (typeof INSTANTLY_LEVELS)[number];
export type InstantlyEmployeeCount = (typeof INSTANTLY_EMPLOYEE_COUNTS)[number];
export type InstantlyRevenue = (typeof INSTANTLY_REVENUES)[number];
export type InstantlyFundingType = (typeof INSTANTLY_FUNDING_TYPES)[number];
export type InstantlyNews = (typeof INSTANTLY_NEWS)[number];
export type InstantlyIndustry = (typeof INSTANTLY_INDUSTRIES)[number];

export type InstantlyIncludeExclude = {
  include?: string[];
  exclude?: string[];
};

/** Keyword filter: Instantly wire format uses strings; we store string arrays for UI tags. */
export type InstantlyKeywordFilter = {
  include?: string[] | string;
  exclude?: string[] | string;
};

export type InstantlySearchFilters = {
  locations?: InstantlyIncludeExclude;
  department?: InstantlyDepartment[];
  level?: InstantlyLevel[];
  employee_count?: InstantlyEmployeeCount[];
  revenue?: InstantlyRevenue[];
  title?: InstantlyIncludeExclude;
  industry?: InstantlyIncludeExclude;
  keyword_filter?: InstantlyKeywordFilter;
  company_name?: InstantlyIncludeExclude;
  domains?: string[];
  look_alike?: string;
  funding_type?: InstantlyFundingType[];
  news?: InstantlyNews[];
  skip_owned_leads?: boolean;
  show_one_lead_per_company?: boolean;
};

export type InstantlyPreviewLead = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  location?: string;
  linkedIn?: string;
  companyName?: string;
  companyLogo?: string;
  companyId?: string;
  [key: string]: unknown;
};

export type InstantlyFindState = {
  filters: InstantlySearchFilters | null;
  count: number | null;
  redactedCount: number | null;
  preview: InstantlyPreviewLead[] | null;
};

export type FindSource = "audienceLab" | "instantly";

export function emptyInstantlyFind(): InstantlyFindState {
  return {
    filters: null,
    count: null,
    redactedCount: null,
    preview: null,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

function filterEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] | undefined {
  const set = new Set<string>(allowed);
  const next = asStringArray(value).filter((v): v is T => set.has(v));
  return next.length ? next : undefined;
}

function sanitizeIncludeExclude(value: unknown): InstantlyIncludeExclude | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as { include?: unknown; exclude?: unknown };
  const include = asStringArray(obj.include);
  const exclude = asStringArray(obj.exclude);
  if (!include.length && !exclude.length) return undefined;
  const out: InstantlyIncludeExclude = {};
  if (include.length) out.include = include;
  if (exclude.length) out.exclude = exclude;
  return out;
}

/** Industry must match Instantly's enum or their API returns 400. */
function sanitizeIndustryFilter(value: unknown): InstantlyIncludeExclude | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as { include?: unknown; exclude?: unknown };
  const include = filterEnumArray(obj.include, INSTANTLY_INDUSTRIES);
  const exclude = filterEnumArray(obj.exclude, INSTANTLY_INDUSTRIES);
  if (!include && !exclude) return undefined;
  const out: InstantlyIncludeExclude = {};
  if (include) out.include = include;
  if (exclude) out.exclude = exclude;
  return out;
}

/** Instantly look_alike expects a domain (e.g. acme.com), not a company name. */
function sanitizeLookAlike(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!t || /\s/.test(t) || !t.includes(".")) return undefined;
  return t;
}

function sanitizeKeywordFilter(value: unknown): InstantlyKeywordFilter | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as { include?: unknown; exclude?: unknown };
  const include =
    typeof obj.include === "string"
      ? obj.include.trim()
        ? [obj.include.trim()]
        : []
      : asStringArray(obj.include);
  const exclude =
    typeof obj.exclude === "string"
      ? obj.exclude.trim()
        ? [obj.exclude.trim()]
        : []
      : asStringArray(obj.exclude);
  if (!include.length && !exclude.length) return undefined;
  const out: InstantlyKeywordFilter = {};
  if (include.length) out.include = include;
  if (exclude.length) out.exclude = exclude;
  return out;
}

/**
 * Strip unknown keys and invalid enum values. Omits empty arrays / blank strings.
 * Returns a clean InstantlySearchFilters object (may be empty).
 */
export function sanitizeSearchFilters(raw: unknown): InstantlySearchFilters {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: InstantlySearchFilters = {};

  const locations = sanitizeIncludeExclude(src.locations);
  if (locations) out.locations = locations;

  const department = filterEnumArray(src.department, INSTANTLY_DEPARTMENTS);
  if (department) out.department = department;

  const level = filterEnumArray(src.level, INSTANTLY_LEVELS);
  if (level) out.level = level;

  const employee_count = filterEnumArray(
    src.employee_count ?? src.employeeCount,
    INSTANTLY_EMPLOYEE_COUNTS
  );
  if (employee_count) out.employee_count = employee_count;

  const revenue = filterEnumArray(src.revenue, INSTANTLY_REVENUES);
  if (revenue) out.revenue = revenue;

  const title = sanitizeIncludeExclude(src.title);
  if (title) out.title = title;

  const industry = sanitizeIndustryFilter(src.industry);
  if (industry) out.industry = industry;

  const keyword_filter = sanitizeKeywordFilter(src.keyword_filter);
  if (keyword_filter) out.keyword_filter = keyword_filter;

  const company_name = sanitizeIncludeExclude(src.company_name);
  if (company_name) out.company_name = company_name;

  const domains = asStringArray(src.domains);
  if (domains.length) out.domains = domains;

  const look_alike = sanitizeLookAlike(src.look_alike);
  if (look_alike) out.look_alike = look_alike;

  const funding_type = filterEnumArray(src.funding_type, INSTANTLY_FUNDING_TYPES);
  if (funding_type) out.funding_type = funding_type;

  const news = filterEnumArray(src.news, INSTANTLY_NEWS);
  if (news) out.news = news;

  if (typeof src.skip_owned_leads === "boolean") {
    out.skip_owned_leads = src.skip_owned_leads;
  }
  if (typeof src.show_one_lead_per_company === "boolean") {
    out.show_one_lead_per_company = src.show_one_lead_per_company;
  }

  return out;
}

function keywordToWire(value: string[] | string | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const t = value.trim();
    return t || undefined;
  }
  const joined = value.map((v) => v.trim()).filter(Boolean).join(", ");
  return joined || undefined;
}

function locationsToWire(
  locs: InstantlyIncludeExclude | undefined
):
  | {
      include?: Array<{ country: string }>;
      exclude?: Array<{ country: string }>;
    }
  | undefined {
  if (!locs) return undefined;
  const include = (locs.include || []).map((s) => ({ country: s }));
  const exclude = (locs.exclude || []).map((s) => ({ country: s }));
  if (!include.length && !exclude.length) return undefined;
  const out: {
    include?: Array<{ country: string }>;
    exclude?: Array<{ country: string }>;
  } = {};
  if (include.length) out.include = include;
  if (exclude.length) out.exclude = exclude;
  return out;
}

/**
 * Map our sanitized filters to Instantly API wire shape
 * (employeeCount camelCase, location objects, keyword strings).
 */
export function toInstantlyWireFilters(
  filters: InstantlySearchFilters
): Record<string, unknown> {
  const wire: Record<string, unknown> = {};

  const locations = locationsToWire(filters.locations);
  if (locations) wire.locations = locations;

  if (filters.department?.length) wire.department = filters.department;
  if (filters.level?.length) wire.level = filters.level;
  if (filters.employee_count?.length) wire.employeeCount = filters.employee_count;
  if (filters.revenue?.length) wire.revenue = filters.revenue;
  if (filters.title) wire.title = filters.title;
  if (filters.industry) wire.industry = filters.industry;

  if (filters.keyword_filter) {
    const kf: Record<string, string> = {};
    const include = keywordToWire(filters.keyword_filter.include);
    const exclude = keywordToWire(filters.keyword_filter.exclude);
    if (include) kf.include = include;
    if (exclude) kf.exclude = exclude;
    if (Object.keys(kf).length) wire.keyword_filter = kf;
  }

  if (filters.company_name) wire.company_name = filters.company_name;
  if (filters.domains?.length) wire.domains = filters.domains;
  if (filters.look_alike) wire.look_alike = filters.look_alike;
  if (filters.funding_type?.length) wire.funding_type = filters.funding_type;
  if (filters.news?.length) wire.news = filters.news;
  if (typeof filters.skip_owned_leads === "boolean") {
    wire.skip_owned_leads = filters.skip_owned_leads;
  }
  if (typeof filters.show_one_lead_per_company === "boolean") {
    wire.show_one_lead_per_company = filters.show_one_lead_per_company;
  }

  return wire;
}

/** Drop keys whose values are empty so they are omitted from Instantly payloads. */
export function omitEmptyFilters(filters: InstantlySearchFilters): InstantlySearchFilters {
  return sanitizeSearchFilters(filters);
}

export function stripMarkdownFences(text: string): string {
  let s = text.trim();
  s = s.replace(/```json/gi, "```").trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```/, "").replace(/```$/, "").trim();
  }
  return s;
}

export function parseJsonLoose(text: string): unknown {
  const s = stripMarkdownFences(text);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new SyntaxError("No JSON object found");
  }
  return JSON.parse(s.slice(start, end + 1));
}

export function normalizeFindSource(raw: unknown): FindSource {
  return raw === "instantly" ? "instantly" : "audienceLab";
}

export function normalizeInstantlyFind(raw: unknown): InstantlyFindState {
  if (!raw || typeof raw !== "object") return emptyInstantlyFind();
  const obj = raw as Record<string, unknown>;
  const filters =
    obj.filters && typeof obj.filters === "object"
      ? sanitizeSearchFilters(obj.filters)
      : null;
  const hasFilters = filters && Object.keys(filters).length > 0;
  const preview = Array.isArray(obj.preview)
    ? (obj.preview.filter((p) => p && typeof p === "object") as InstantlyPreviewLead[])
    : null;
  return {
    filters: hasFilters ? filters : null,
    count: typeof obj.count === "number" && Number.isFinite(obj.count) ? obj.count : null,
    redactedCount:
      typeof obj.redactedCount === "number" && Number.isFinite(obj.redactedCount)
        ? obj.redactedCount
        : null,
    preview: preview?.length ? preview : null,
  };
}
