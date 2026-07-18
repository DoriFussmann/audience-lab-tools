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

export type ApproachStyle = "Direct" | "Consultative" | "Challenger" | "Warm";

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
  style: ApproachStyle;
};

export type LetterMaterials = {
  links: string;
  snippets: string;
};

export type ProjectLetter = {
  materials: LetterMaterials;
  style: ApproachStyle;
  result: LetterResult | null;
};

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
  };
  letter: ProjectLetter;
};
