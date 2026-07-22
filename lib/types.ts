export type FieldStatus = "empty" | "confirmed" | "skipped";

export type FieldState = {
  value: string;
  status: FieldStatus;
  inferred: boolean;
};

export type FieldMap = Record<string, FieldState>;

export type Proposal = {
  key: string;
  value: string;
  inferred?: boolean;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TaxRow = {
  id: string;
  premade: string;
  category: string;
  subcategory: string;
  description: string;
  keywords: string;
  type: string;
};

/** Journey roles used for per-role taxonomy retrieval and basket composition. */
export type AudienceRole = "pain" | "category" | "competitor" | "adjacent" | "stage";

export type MatchConfidence = "high" | "medium" | "low";

export type Match = {
  id: string;
  why: string;
  confidence: MatchConfidence;
  role: AudienceRole;
};

export type BasketItem = {
  row: TaxRow;
  why: string;
  confidence: MatchConfidence;
  role: AudienceRole;
};

export type TierInfo = {
  name: string;
  subtitle: string;
  rule: string;
  treatment: string;
  /** Minimum audience membership count for this tier. */
  threshold: number;
  /** Optional extra line shown under treatment (e.g. Diamond scarcity note). */
  note?: string;
};

/** Premade-name pair for Gold “Strongest combinations”. */
export type TierCombination = {
  a: string;
  b: string;
};

export type TierPlan = {
  n: number;
  silver: TierInfo;
  gold: TierInfo;
  diamond: TierInfo;
  /** Competitor/brand × pain/category pairs, capped at 5. */
  combinations: TierCombination[];
  taxonomyIds: string[];
};

export type SavedAudience = {
  basket: BasketItem[];
  tierPlan: TierPlan;
};

export type LetterEmail = {
  day: number;
  subject: string;
  body: string;
};

export type LetterTierName = "Silver" | "Gold" | "Diamond";

export type LetterTierSequence = {
  tier: LetterTierName;
  emails: LetterEmail[];
};

export type LetterResult = {
  tiers: LetterTierSequence[];
  note: string;
};

export type LetterMaterialLink = {
  url: string;
  label: string;
};

export type LetterMaterials = {
  links: LetterMaterialLink[];
  keyMessages: string[];
};

export type ProjectLetter = {
  materials: LetterMaterials;
  result: LetterResult | null;
};

/** Persisted attachment metadata only — never lead rows. */
export type FusionAttachmentMeta = {
  taxonomyId: string;
  fileNames: string[];
  rowCount: number;
  needsReattach: boolean;
};

export type FusionSummary = {
  total: number;
  silver: number;
  gold: number;
  diamond: number;
  exportN: number;
  fusedAt: number;
};

export type ProjectFusion = {
  attachments: FusionAttachmentMeta[];
  summary: FusionSummary | null;
  exportN: number;
};

export type AuditLeadResult = {
  label: string;
  tier: "Silver" | "Gold" | "Diamond";
  fitPercent: number;
  whyFits: string;
  whyNot: string;
  recommendation: string;
};

export type AuditPatterns = {
  highFitSources: string;
  lowFitSources: string;
  basketAdvice: string;
  overall: string;
};

export type ProjectAudit = {
  leads: AuditLeadResult[];
  patterns: AuditPatterns;
  runAt: number;
};

export type {
  FindSource,
  InstantlyFindState,
  InstantlyIncludeExclude,
  InstantlyKeywordFilter,
  InstantlyPreviewLead,
  InstantlySearchFilters,
} from "./instantly";

import type { FindSource, InstantlyFindState } from "./instantly";

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  define: {
    fields: FieldMap;
    messages: ChatMessage[];
  };
  find: {
    messages: ChatMessage[];
    audience: SavedAudience | null;
    taxonomyName: string;
    /** Which Find source panel is active. Defaults to Audience Lab. */
    source?: FindSource;
    /** Instantly SuperSearch panel state (filters, count, preview). */
    instantly?: InstantlyFindState;
  };
  letter: ProjectLetter;
  fusion: ProjectFusion;
  audit: ProjectAudit | null;
};
