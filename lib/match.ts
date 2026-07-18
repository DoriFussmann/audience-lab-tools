import { tokenize } from "./taxonomy";
import type {
  AudienceRole,
  BasketItem,
  FieldMap,
  MatchConfidence,
  TaxRow,
  TierCombination,
  TierPlan,
} from "./types";

/** Brand-side roles for Gold strongest combinations (competitor / brand-adjacent). */
const BRAND_ROLES: AudienceRole[] = ["competitor", "adjacent"];
/** Intent-side roles for Gold strongest combinations. */
const INTENT_ROLES: AudienceRole[] = ["pain", "category"];
const MAX_COMBINATIONS = 5;

/** Pair each competitor/brand-role audience with each pain/category-role audience (cap 5). */
export function strongestCombinations(basket: BasketItem[]): TierCombination[] {
  const brandSide = basket.filter((b) => BRAND_ROLES.includes(b.role));
  const intentSide = basket.filter((b) => INTENT_ROLES.includes(b.role));
  const pairs: TierCombination[] = [];
  for (const brand of brandSide) {
    for (const intent of intentSide) {
      pairs.push({ a: brand.row.premade, b: intent.row.premade });
      if (pairs.length >= MAX_COMBINATIONS) return pairs;
    }
  }
  return pairs;
}

/** Define field key → retrieval role. */
export const ROLE_FIELD_KEYS: Record<AudienceRole, string> = {
  pain: "painPhrases",
  category: "categoryPhrases",
  competitor: "competitorBrands",
  adjacent: "adjacentBrands",
  stage: "stagePhrases",
};

export const AUDIENCE_ROLES: AudienceRole[] = [
  "pain",
  "category",
  "competitor",
  "adjacent",
  "stage",
];

export const TOP_PER_ROLE = 12;

export type ScoredCandidate = {
  row: TaxRow;
  score: number;
  role: AudienceRole;
};

export type RoleCandidates = Record<AudienceRole, ScoredCandidate[]>;

export function splitPhrases(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function nearPremadeMatch(phraseLower: string, premadeLower: string): boolean {
  if (!phraseLower || !premadeLower) return false;
  if (premadeLower === phraseLower) return true;
  if (premadeLower.includes(phraseLower) || phraseLower.includes(premadeLower)) return true;
  // Near: high token Jaccard on short names
  const a = new Set(tokenize(phraseLower));
  const b = new Set(tokenize(premadeLower));
  if (!a.size || !b.size) return false;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 && inter / union >= 0.6;
}

/**
 * Score a single phrase against Premade + Keywords only.
 * Description, Category, Subcategory, and Audience Type never contribute.
 */
export function scorePhraseAgainstRow(phrase: string, row: TaxRow): number {
  const phraseLower = phrase.toLowerCase().trim();
  if (!phraseLower) return 0;

  const premadeLower = row.premade.toLowerCase();
  const keywordsLower = row.keywords.toLowerCase();
  const phraseTokens = tokenize(phrase);
  if (!phraseTokens.length && !premadeLower && !keywordsLower) return 0;

  let score = 0;

  // Exact phrase substring in Keywords — strong boost
  if (keywordsLower.includes(phraseLower)) score += 50;

  // Exact / near match on Premade
  if (premadeLower === phraseLower) score += 80;
  else if (nearPremadeMatch(phraseLower, premadeLower)) score += 40;

  const premadeTokens = new Set(tokenize(row.premade));
  const kwTokens = new Set(tokenize(row.keywords));

  let overlapPremade = 0;
  let overlapKw = 0;
  for (const t of phraseTokens) {
    if (premadeTokens.has(t)) overlapPremade++;
    if (kwTokens.has(t)) overlapKw++;
  }

  if (phraseTokens.length) {
    score += (overlapPremade / phraseTokens.length) * 30;
    score += (overlapKw / phraseTokens.length) * 20;
    score += overlapPremade * 5;
    score += overlapKw * 3;
  }

  return score;
}

export function scoreRowForPhrases(phrases: string[], row: TaxRow): number {
  let total = 0;
  for (const phrase of phrases) total += scorePhraseAgainstRow(phrase, row);
  return total;
}

function passesTypeFilter(row: TaxRow, typeFilter: string): boolean {
  if (!typeFilter || typeFilter === "All") return true;
  return row.type.toUpperCase() === typeFilter.toUpperCase();
}

/** Active roles with confirmed, non-empty phrase lists. */
export function activeRolePhrases(fields: FieldMap): Partial<Record<AudienceRole, string[]>> {
  const out: Partial<Record<AudienceRole, string[]>> = {};
  for (const role of AUDIENCE_ROLES) {
    const key = ROLE_FIELD_KEYS[role];
    const state = fields[key];
    if (!state || state.status !== "confirmed") continue;
    const phrases = splitPhrases(state.value);
    if (!phrases.length) continue;
    out[role] = phrases;
  }
  return out;
}

/**
 * Stage 1 — per-role retrieval (code, not LLM).
 * Top 12 per role, deduplicated within role. Empty/skipped roles omitted.
 * Both b2b_ and b2c_ IDs are eligible whenever typeFilter is All.
 */
export function retrieveByRole(
  rows: TaxRow[],
  fields: FieldMap,
  typeFilter: string = "All",
  topK: number = TOP_PER_ROLE
): RoleCandidates {
  const rolePhrases = activeRolePhrases(fields);
  const result = {} as RoleCandidates;
  for (const role of AUDIENCE_ROLES) result[role] = [];

  for (const role of AUDIENCE_ROLES) {
    const phrases = rolePhrases[role];
    if (!phrases) continue;

    const scored: ScoredCandidate[] = [];
    for (const row of rows) {
      if (!passesTypeFilter(row, typeFilter)) continue;
      const score = scoreRowForPhrases(phrases, row);
      if (score <= 0) continue;
      scored.push({ row, score, role });
    }
    scored.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));

    const seen = new Set<string>();
    const top: ScoredCandidate[] = [];
    for (const c of scored) {
      if (seen.has(c.row.id)) continue;
      seen.add(c.row.id);
      top.push(c);
      if (top.length >= topK) break;
    }
    result[role] = top;
  }

  return result;
}

export function flattenRoleCandidates(byRole: RoleCandidates): TaxRow[] {
  const seen = new Set<string>();
  const out: TaxRow[] = [];
  for (const role of AUDIENCE_ROLES) {
    for (const c of byRole[role] || []) {
      if (seen.has(c.row.id)) continue;
      seen.add(c.row.id);
      out.push(c.row);
    }
  }
  return out;
}

export function nextBestForRole(
  byRole: RoleCandidates,
  role: AudienceRole,
  excludeIds: Set<string>
): ScoredCandidate | null {
  for (const c of byRole[role] || []) {
    if (!excludeIds.has(c.row.id)) return c;
  }
  return null;
}

export function normalizeConfidence(raw: unknown): MatchConfidence {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "medium";
  if (n >= 70) return "high";
  if (n >= 40) return "medium";
  return "low";
}

export function isAudienceRole(v: unknown): v is AudienceRole {
  return typeof v === "string" && (AUDIENCE_ROLES as string[]).includes(v);
}

/**
 * Stage 3 — Tier Plan from confirmed basket size N.
 * Diamond threshold = ceil(0.8 × N).
 */
export function buildTierPlan(basket: BasketItem[]): TierPlan {
  const n = basket.length;
  const diamondThreshold = n > 0 ? Math.ceil(0.8 * n) : 0;
  const taxonomyIds = basket.map((b) => b.row.id);
  const combinations = strongestCombinations(basket);

  return {
    n,
    silver: {
      name: "Silver",
      subtitle: "the full pull",
      rule:
        n > 0
          ? `Every lead pulled from these ${n} audience${n === 1 ? "" : "s"} is Silver — they appear in at least one audience, one confirmed intent signal each.`
          : "Every lead pulled is Silver — they appear in at least one audience, one confirmed intent signal each.",
      treatment: "Broad campaigns.",
      threshold: 1,
    },
    gold: {
      name: "Gold",
      subtitle: "2-3 audiences",
      rule:
        n > 0
          ? `Leads appearing in 2-3 of the ${n} audience${n === 1 ? "" : "s"} — independent signals converging, false positives filtered out.`
          : "Leads appearing in 2-3 audiences — independent signals converging, false positives filtered out.",
      treatment: "Sequenced outreach.",
      threshold: 2,
    },
    diamond: {
      name: "Diamond",
      subtitle: n > 0 ? `in ${diamondThreshold}+ of ${n} audiences` : "in a high share of audiences",
      rule:
        n > 0
          ? `Leads appearing in ${diamondThreshold} or more audiences — the market raising its hand.`
          : "Leads appearing in a high share of audiences — the market raising its hand.",
      treatment: "Personal, high-touch outreach first.",
      threshold: diamondThreshold,
      note: "Expect this to be a small fraction of the pull; that is the point.",
    },
    combinations,
    taxonomyIds,
  };
}

/** Migrate legacy single-audience saves into basket + tier plan. */
export function normalizeSavedAudience(raw: unknown): import("./types").SavedAudience | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.basket)) {
    const basket: BasketItem[] = [];
    for (const item of obj.basket) {
      if (!item || typeof item !== "object") continue;
      const b = item as Record<string, unknown>;
      const row = b.row as TaxRow | undefined;
      if (!row || !row.id || !row.premade) continue;
      basket.push({
        row,
        why: String(b.why || ""),
        confidence: normalizeConfidence(b.confidence),
        role: isAudienceRole(b.role) ? b.role : "category",
      });
    }
    if (!basket.length) return null;
    // Always recompute thresholds from current basket size
    return { basket, tierPlan: buildTierPlan(basket) };
  }

  // Legacy: { row, why, confidence }
  const row = obj.row as TaxRow | undefined;
  if (row && row.id && row.premade) {
    const basket: BasketItem[] = [
      {
        row,
        why: String(obj.why || ""),
        confidence: normalizeConfidence(obj.confidence),
        role: "category",
      },
    ];
    return { basket, tierPlan: buildTierPlan(basket) };
  }

  return null;
}
