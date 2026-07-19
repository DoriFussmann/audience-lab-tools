import Papa from "papaparse";
import type {
  AudienceRole,
  BasketItem,
  FusionAttachmentMeta,
  FusionSummary,
  ProjectFusion,
  SavedAudience,
  TierPlan,
} from "./types";

/** Brand-side roles for pair bonuses (same as tier-plan combinations). */
const BRAND_ROLES: AudienceRole[] = ["competitor", "adjacent"];
/** Intent-side roles for pair bonuses. */
const INTENT_ROLES: AudienceRole[] = ["pain", "category"];

const ROLE_POINTS: Record<string, number> = {
  competitor: 40,
  category: 30,
  pain: 30,
  stage: 20,
  adjacent: 10,
};

const DEFAULT_ROLE_POINTS = 10;
const PAIR_BONUS = 15;

export const EXCLUDED_EXPORT_COLUMNS = [
  "SKIPTRACE_ETHNIC_CODE",
  "SKIPTRACE_RELIGION_CODE",
  "SKIPTRACE_CREDIT_RATING",
  "SKIPTRACE_IP",
] as const;

const EXCLUDED_SET = new Set<string>(EXCLUDED_EXPORT_COLUMNS);

/** Canonical column names we look for (case-insensitive header match). */
const KNOWN_HEADERS = [
  "UUID",
  "FIRST_NAME",
  "LAST_NAME",
  "BUSINESS_EMAIL",
  "PERSONAL_EMAILS",
  "PERSONAL_VERIFIED_EMAILS",
  "BUSINESS_VERIFIED_EMAILS",
  "SHA256_PERSONAL_EMAIL",
  "SHA256_BUSINESS_EMAIL",
  "JOB_TITLE",
  "COMPANY_NAME",
  "PERSONAL_STATE",
  "COMPANY_STATE",
  "MOBILE_PHONE",
  "SKIPTRACE_MATCH_SCORE",
  "LINKEDIN_URL",
] as const;

const EMAIL_COLUMN_HINTS = [
  "BUSINESS_EMAIL",
  "PERSONAL_EMAILS",
  "PERSONAL_VERIFIED_EMAILS",
  "BUSINESS_VERIFIED_EMAILS",
  "EMAIL",
  "EMAILS",
];

const NAME_COLUMN_HINTS = ["FIRST_NAME", "LAST_NAME", "NAME", "FULL_NAME"];

export type RawLead = Record<string, string>;

export type AttachedFile = {
  id: string;
  fileName: string;
  contentHash: string;
  taxonomyId: string | null;
  rows: RawLead[];
  error?: string;
};

export type ScoreBreakdown = {
  audiencePoints: number;
  pairBonuses: number;
  contactability: number;
  roleContributions: { taxonomyId: string; name: string; role: AudienceRole; points: number }[];
  pairHits: { a: string; b: string; aName: string; bName: string }[];
};

export type FusedLead = {
  fields: RawLead;
  audienceIds: string[];
  fusionScore: number;
  tier: "Silver" | "Gold" | "Diamond";
  breakdown: ScoreBreakdown;
  hasVerifiedEmail: boolean;
  /** PERSONAL_STATE → COMPANY_STATE → Unknown; 2-letter codes uppercased. */
  geoState: string;
};

export type FuseResult = {
  leads: FusedLead[];
  total: number;
  silver: number;
  gold: number;
  diamond: number;
};

export function emptyProjectFusion(): ProjectFusion {
  return {
    attachments: [],
    summary: null,
    exportN: 250,
  };
}

export function normalizeProjectFusion(raw: unknown): ProjectFusion {
  const empty = emptyProjectFusion();
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;

  const exportN = Number(obj.exportN);
  const attachments: FusionAttachmentMeta[] = [];
  if (Array.isArray(obj.attachments)) {
    for (const item of obj.attachments) {
      if (!item || typeof item !== "object") continue;
      const a = item as Record<string, unknown>;
      const taxonomyId = typeof a.taxonomyId === "string" ? a.taxonomyId : "";
      if (!taxonomyId) continue;
      const fileNames = Array.isArray(a.fileNames)
        ? a.fileNames.filter((n): n is string => typeof n === "string")
        : [];
      const rowCount = Number(a.rowCount);
      attachments.push({
        taxonomyId,
        fileNames,
        rowCount: Number.isFinite(rowCount) && rowCount >= 0 ? rowCount : 0,
        // After reload, prior attachments always need re-attach (leads not persisted).
        needsReattach: true,
      });
    }
  }

  let summary: FusionSummary | null = null;
  if (obj.summary && typeof obj.summary === "object") {
    const s = obj.summary as Record<string, unknown>;
    const total = Number(s.total);
    const silver = Number(s.silver);
    const gold = Number(s.gold);
    const diamond = Number(s.diamond);
    const sn = Number(s.exportN);
    const fusedAt = Number(s.fusedAt);
    if (
      Number.isFinite(total) &&
      Number.isFinite(silver) &&
      Number.isFinite(gold) &&
      Number.isFinite(diamond)
    ) {
      summary = {
        total,
        silver,
        gold,
        diamond,
        exportN: Number.isFinite(sn) && sn >= 1 ? sn : 250,
        fusedAt: Number.isFinite(fusedAt) ? fusedAt : Date.now(),
      };
    }
  }

  return {
    attachments,
    summary,
    exportN: Number.isFinite(exportN) && exportN >= 1 ? Math.floor(exportN) : 250,
  };
}

/** Mark all persisted attachments as needing re-attach (call on project open). */
export function markFusionNeedsReattach(fusion: ProjectFusion): ProjectFusion {
  if (!fusion.attachments.length) return fusion;
  return {
    ...fusion,
    attachments: fusion.attachments.map((a) => ({ ...a, needsReattach: true })),
  };
}

export function rolePoints(role: AudienceRole | string): number {
  return ROLE_POINTS[role] ?? DEFAULT_ROLE_POINTS;
}

/**
 * PERSONAL_STATE if present, else COMPANY_STATE, else "Unknown".
 * Uppercase 2-letter codes when possible; otherwise keep the raw trimmed value.
 */
export function deriveGeoState(fields: RawLead): string {
  const personal = (fields.PERSONAL_STATE || "").trim();
  const company = (fields.COMPANY_STATE || "").trim();
  const raw = personal || company;
  if (!raw) return "Unknown";
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return raw;
}

/** Top-N geo states by row count (desc), then name. */
export function topGeoStates(rows: RawLead[], n = 5): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const s = deriveGeoState(row);
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([s]) => s);
}

/**
 * True if any two audiences have disjoint top-5 state sets.
 * Informational only — never blocks fusing.
 */
export function attachedAudiencesHaveDisjointGeography(
  audiences: { rows: RawLead[] }[]
): boolean {
  if (audiences.length < 2) return false;
  const tops = audiences.map((a) => new Set(topGeoStates(a.rows, 5)));
  for (let i = 0; i < tops.length; i++) {
    for (let j = i + 1; j < tops.length; j++) {
      let shared = false;
      for (const s of tops[i]) {
        if (tops[j].has(s)) {
          shared = true;
          break;
        }
      }
      if (!shared) return true;
    }
  }
  return false;
}

export function geoStateCounts(
  leads: FusedLead[]
): { state: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    counts.set(lead.geoState, (counts.get(lead.geoState) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export function filterLeadsByGeoState(
  leads: FusedLead[],
  state: string | null
): FusedLead[] {
  if (!state) return leads;
  return leads.filter((l) => l.geoState === state);
}

export function fuseResultFromLeads(leads: FusedLead[]): FuseResult {
  let silver = 0;
  let gold = 0;
  let diamond = 0;
  for (const lead of leads) {
    if (lead.tier === "Diamond") diamond++;
    else if (lead.tier === "Gold") gold++;
    else silver++;
  }
  return {
    leads,
    total: leads.length,
    silver,
    gold,
    diamond,
  };
}

/**
 * Pair set from live basket by taxonomy ID:
 * (competitor|adjacent) × (pain|category). Uncapped; names are not used.
 */
export function fusionPairIds(basket: BasketItem[]): { a: string; b: string }[] {
  const brandSide = basket.filter((b) => BRAND_ROLES.includes(b.role));
  const intentSide = basket.filter((b) => INTENT_ROLES.includes(b.role));
  const pairs: { a: string; b: string }[] = [];
  for (const brand of brandSide) {
    for (const intent of intentSide) {
      pairs.push({ a: brand.row.id, b: intent.row.id });
    }
  }
  return pairs;
}

function normHeader(h: string): string {
  return h.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function normalizeNamePart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function normalizeCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function splitEmails(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export async function hashFileBytes(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function mapHeaders(fields: string[]): {
  map: Record<string, string>;
  hasEmail: boolean;
  hasName: boolean;
} {
  const map: Record<string, string> = {};
  const seen = new Set<string>();
  for (const raw of fields) {
    const n = normHeader(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    map[n] = raw;
  }

  let hasEmail = false;
  let hasName = false;
  for (const hint of EMAIL_COLUMN_HINTS) {
    if (map[hint] || [...seen].some((h) => h.includes("EMAIL"))) {
      hasEmail = true;
      break;
    }
  }
  for (const hint of NAME_COLUMN_HINTS) {
    if (map[hint] || [...seen].some((h) => h.includes("NAME") && !h.includes("COMPANY"))) {
      hasName = true;
      break;
    }
  }
  // Also accept COMPANY_NAME alone only with email — name check already covers FIRST/LAST
  if (!hasName && (map.FIRST_NAME || map.LAST_NAME)) hasName = true;

  return { map, hasEmail, hasName };
}

function getField(row: RawLead, headerMap: Record<string, string>, canonical: string): string {
  const rawKey = headerMap[canonical];
  if (!rawKey) return "";
  return String(row[rawKey] ?? "").trim();
}

function rowToCanonical(row: RawLead, headerMap: Record<string, string>): RawLead {
  const out: RawLead = {};
  // Prefer canonical names for known columns; keep all originals too under their headers
  for (const [key, val] of Object.entries(row)) {
    out[key] = String(val ?? "").trim();
  }
  for (const canonical of KNOWN_HEADERS) {
    const v = getField(row, headerMap, canonical);
    if (v) out[canonical] = v;
  }
  // Normalize any header that matches known names
  for (const [norm, rawKey] of Object.entries(headerMap)) {
    if (KNOWN_HEADERS.includes(norm as (typeof KNOWN_HEADERS)[number])) {
      const v = String(row[rawKey] ?? "").trim();
      if (v) out[norm] = v;
    }
  }
  return out;
}

export type ParseCsvResult =
  | { ok: true; rows: RawLead[]; headers: string[] }
  | { ok: false; error: string };

export function parseLeadCsv(text: string): ParseCsvResult {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length && !parsed.data.length) {
    const first = parsed.errors[0];
    return { ok: false, error: first.message || "Could not parse CSV" };
  }

  const fields = parsed.meta.fields || [];
  if (!fields.length) {
    return { ok: false, error: "No header row found" };
  }

  const { map, hasEmail, hasName } = mapHeaders(fields);
  if (!hasEmail && !hasName) {
    return { ok: false, error: "No recognizable email or name columns" };
  }

  const rows: RawLead[] = [];
  for (const r of parsed.data) {
    if (!r || typeof r !== "object") continue;
    const canonical = rowToCanonical(r as RawLead, map);
    // Skip completely empty rows
    if (!Object.values(canonical).some((v) => v)) continue;
    rows.push(canonical);
  }

  if (!rows.length) {
    return { ok: false, error: "No data rows found" };
  }

  return { ok: true, rows, headers: fields };
}

function verifiedEmails(fields: RawLead): string[] {
  const personal = splitEmails(fields.PERSONAL_VERIFIED_EMAILS || "");
  const business = splitEmails(fields.BUSINESS_VERIFIED_EMAILS || "");
  return [...new Set([...personal, ...business])];
}

function fullNameKey(fields: RawLead): string {
  const first = normalizeNamePart(fields.FIRST_NAME || "");
  const last = normalizeNamePart(fields.LAST_NAME || "");
  if (!first && !last) return "";
  return `${first}|${last}`;
}

function namesAgree(a: RawLead, b: RawLead): boolean {
  const ka = fullNameKey(a);
  const kb = fullNameKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

function namesDisagree(a: RawLead, b: RawLead): boolean {
  const ka = fullNameKey(a);
  const kb = fullNameKey(b);
  if (!ka || !kb) return false;
  return ka !== kb;
}

function companyNameKey(fields: RawLead): string {
  const name = fullNameKey(fields);
  const company = normalizeCompany(fields.COMPANY_NAME || "");
  if (!name || !company) return "";
  return `${name}|${company}`;
}

function mergeFields(into: RawLead, from: RawLead): RawLead {
  const out = { ...into };
  for (const [k, v] of Object.entries(from)) {
    if (!v) continue;
    if (!out[k]) out[k] = v;
  }
  return out;
}

type WorkingLead = {
  fields: RawLead;
  audienceIds: Set<string>;
};

/**
 * Fuse attached files into ranked leads.
 * files: each must have taxonomyId set and rows parsed.
 */
export function fuseLeads(
  basket: BasketItem[],
  files: { taxonomyId: string; rows: RawLead[] }[],
  tierPlan: TierPlan
): FuseResult {
  const byUuid = new Map<string, WorkingLead>();
  const noUuid: WorkingLead[] = [];

  function addRecord(fields: RawLead, taxonomyId: string) {
    const uuid = (fields.UUID || "").trim();
    if (uuid) {
      const existing = byUuid.get(uuid);
      if (existing) {
        if (namesDisagree(existing.fields, fields)) {
          // Safety: same UUID but names disagree — keep separate under synthetic path
          noUuid.push({
            fields: { ...fields },
            audienceIds: new Set([taxonomyId]),
          });
          return;
        }
        existing.fields = mergeFields(existing.fields, fields);
        existing.audienceIds.add(taxonomyId);
        return;
      }
      byUuid.set(uuid, {
        fields: { ...fields },
        audienceIds: new Set([taxonomyId]),
      });
      return;
    }
    noUuid.push({
      fields: { ...fields },
      audienceIds: new Set([taxonomyId]),
    });
  }

  for (const file of files) {
    for (const row of file.rows) {
      addRecord(row, file.taxonomyId);
    }
  }

  // Cross-match no-UUID records and UUID records via verified email + name
  const working: WorkingLead[] = [...byUuid.values()];

  function tryMergeInto(target: WorkingLead, source: WorkingLead): boolean {
    if (namesDisagree(target.fields, source.fields)) return false;

    const tUuid = (target.fields.UUID || "").trim();
    const sUuid = (source.fields.UUID || "").trim();

    // Same UUID already handled; different UUIDs require verified email + name
    if (tUuid && sUuid && tUuid !== sUuid) {
      const tEmails = new Set(verifiedEmails(target.fields));
      const sEmails = verifiedEmails(source.fields);
      const shared = sEmails.some((e) => tEmails.has(e));
      if (!shared || !namesAgree(target.fields, source.fields)) return false;
      target.fields = mergeFields(target.fields, source.fields);
      for (const id of source.audienceIds) target.audienceIds.add(id);
      return true;
    }

    // At least one missing UUID
    const tEmails = new Set(verifiedEmails(target.fields));
    const sEmails = verifiedEmails(source.fields);
    const sharedVerified = sEmails.some((e) => tEmails.has(e));

    if (sharedVerified && namesAgree(target.fields, source.fields)) {
      target.fields = mergeFields(target.fields, source.fields);
      for (const id of source.audienceIds) target.audienceIds.add(id);
      return true;
    }

    // Fallback: name+company when no UUID and no verified email on source
    if (!sUuid && !verifiedEmails(source.fields).length) {
      const sk = companyNameKey(source.fields);
      const tk = companyNameKey(target.fields);
      if (sk && tk && sk === tk) {
        target.fields = mergeFields(target.fields, source.fields);
        for (const id of source.audienceIds) target.audienceIds.add(id);
        return true;
      }
    }

    return false;
  }

  const orphans: WorkingLead[] = [];
  for (const src of noUuid) {
    let merged = false;
    for (const target of working) {
      if (tryMergeInto(target, src)) {
        merged = true;
        break;
      }
    }
    if (!merged) {
      // Try merge among orphans
      let intoOrphan = false;
      for (const o of orphans) {
        if (tryMergeInto(o, src)) {
          intoOrphan = true;
          break;
        }
      }
      if (!intoOrphan) orphans.push(src);
    }
  }

  const all = [...working, ...orphans];
  const pairs = fusionPairIds(basket);
  const roleById = new Map(basket.map((b) => [b.row.id, b]));

  const scored: FusedLead[] = all.map((w) => {
    const audienceIds = [...w.audienceIds];
    const breakdown: ScoreBreakdown = {
      audiencePoints: 0,
      pairBonuses: 0,
      contactability: 0,
      roleContributions: [],
      pairHits: [],
    };

    for (const id of audienceIds) {
      const item = roleById.get(id);
      if (!item) continue;
      const pts = rolePoints(item.role);
      breakdown.audiencePoints += pts;
      breakdown.roleContributions.push({
        taxonomyId: id,
        name: item.row.premade,
        role: item.role,
        points: pts,
      });
    }

    const idSet = new Set(audienceIds);
    for (const pair of pairs) {
      if (idSet.has(pair.a) && idSet.has(pair.b)) {
        breakdown.pairBonuses += PAIR_BONUS;
        const aItem = roleById.get(pair.a);
        const bItem = roleById.get(pair.b);
        breakdown.pairHits.push({
          a: pair.a,
          b: pair.b,
          aName: aItem?.row.premade || pair.a,
          bName: bItem?.row.premade || pair.b,
        });
      }
    }

    const vEmails = verifiedEmails(w.fields);
    const hasVerifiedEmail = vEmails.length > 0;
    let contactability = 0;
    if (hasVerifiedEmail) contactability += 4;
    if ((w.fields.MOBILE_PHONE || "").trim()) contactability += 3;
    const skip = Number(w.fields.SKIPTRACE_MATCH_SCORE);
    if (Number.isFinite(skip)) {
      contactability += (skip / 10) * 3;
    }
    // Cap conceptually at ~10 scale per spec; allow slight over from skiptrace
    breakdown.contactability = contactability;

    const fusionScore =
      breakdown.audiencePoints + breakdown.pairBonuses + breakdown.contactability;

    const audienceCount = audienceIds.length;
    const hasUuid = !!(w.fields.UUID || "").trim();
    const hasNameCompany = !!companyNameKey(w.fields);
    // No UUID, no verified email, and no name+company key → Silver only
    const silverOnly = !hasUuid && !hasVerifiedEmail && !hasNameCompany;

    let tier: "Silver" | "Gold" | "Diamond" = "Silver";
    if (!silverOnly) {
      if (audienceCount >= tierPlan.diamond.threshold && tierPlan.diamond.threshold > 0) {
        tier = "Diamond";
      } else if (audienceCount >= tierPlan.gold.threshold) {
        tier = "Gold";
      }
    }

    return {
      fields: w.fields,
      audienceIds,
      fusionScore,
      tier,
      breakdown,
      hasVerifiedEmail,
      geoState: deriveGeoState(w.fields),
    };
  });

  scored.sort((a, b) => {
    if (b.fusionScore !== a.fusionScore) return b.fusionScore - a.fusionScore;
    if (b.audienceIds.length !== a.audienceIds.length) {
      return b.audienceIds.length - a.audienceIds.length;
    }
    if (a.hasVerifiedEmail !== b.hasVerifiedEmail) {
      return a.hasVerifiedEmail ? -1 : 1;
    }
    return 0;
  });

  let silver = 0;
  let gold = 0;
  let diamond = 0;
  for (const lead of scored) {
    if (lead.tier === "Diamond") diamond++;
    else if (lead.tier === "Gold") gold++;
    else silver++;
  }

  return {
    leads: scored,
    total: scored.length,
    silver,
    gold,
    diamond,
  };
}

export function leadDisplayName(fields: RawLead): string {
  const first = (fields.FIRST_NAME || "").trim();
  const last = (fields.LAST_NAME || "").trim();
  const name = [first, last].filter(Boolean).join(" ");
  return name || (fields.BUSINESS_EMAIL || "").trim() || "Unknown";
}

export function slugFilename(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildFusionCsv(
  leads: FusedLead[],
  basket: BasketItem[],
  exportN: number,
  includeExcluded: boolean
): string {
  const top = leads.slice(0, Math.max(1, exportN));
  const nameById = new Map(basket.map((b) => [b.row.id, b.row.premade]));

  const originalKeys = new Set<string>();
  for (const lead of top) {
    for (const k of Object.keys(lead.fields)) {
      if (!includeExcluded && EXCLUDED_SET.has(k)) continue;
      // Skip our canonical duplicates if raw also present — keep all field keys
      originalKeys.add(k);
    }
  }

  // Stable column order: known headers first, then rest alpha
  const knownOrder = KNOWN_HEADERS.filter((h) => originalKeys.has(h));
  const rest = [...originalKeys]
    .filter((k) => !KNOWN_HEADERS.includes(k as (typeof KNOWN_HEADERS)[number]))
    .filter((k) => includeExcluded || !EXCLUDED_SET.has(k))
    .sort((a, b) => a.localeCompare(b));

  // Always include DNC columns if present — they are never in EXCLUDED_SET
  const dataCols = [...knownOrder, ...rest].filter(
    (k) => includeExcluded || !EXCLUDED_SET.has(k)
  );

  const headers = [
    "RANK",
    "FUSION_SCORE",
    "TIER",
    "AUDIENCE_COUNT",
    "GEO_STATE",
    "AUDIENCES",
    ...dataCols,
  ];

  const lines = [headers.map(csvEscape).join(",")];
  top.forEach((lead, i) => {
    const audiences = lead.audienceIds
      .map((id) => nameById.get(id) || id)
      .join(" | ");
    const cells = [
      String(i + 1),
      String(Math.round(lead.fusionScore * 100) / 100),
      lead.tier,
      String(lead.audienceIds.length),
      lead.geoState,
      audiences,
      ...dataCols.map((k) => lead.fields[k] || ""),
    ];
    lines.push(cells.map(csvEscape).join(","));
  });

  return lines.join("\r\n");
}

function stateFilenameToken(state: string): string {
  if (/^[A-Za-z]{2}$/.test(state)) return state.toUpperCase();
  return slugFilename(state) || "geo";
}

export function downloadFusionCsv(
  projectName: string,
  csv: string,
  exportN: number,
  stateFilter?: string | null
) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const statePart = stateFilter ? `-${stateFilenameToken(stateFilter)}` : "";
  a.download = `${slugFilename(projectName)}-fused${statePart}-top${exportN}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildAttachmentMeta(
  basket: BasketItem[],
  files: AttachedFile[],
  previous: FusionAttachmentMeta[] = []
): FusionAttachmentMeta[] {
  const prevById = new Map(previous.map((a) => [a.taxonomyId, a]));
  return basket.map((item) => {
    const assigned = files.filter((f) => f.taxonomyId === item.row.id && !f.error);
    const rowCount = assigned.reduce((n, f) => n + f.rows.length, 0);
    if (assigned.length) {
      return {
        taxonomyId: item.row.id,
        fileNames: assigned.map((f) => f.fileName),
        rowCount,
        needsReattach: false,
      };
    }
    const prev = prevById.get(item.row.id);
    if (prev && (prev.fileNames.length || prev.rowCount > 0 || prev.needsReattach)) {
      return {
        taxonomyId: item.row.id,
        fileNames: prev.fileNames,
        rowCount: prev.rowCount,
        needsReattach: true,
      };
    }
    return {
      taxonomyId: item.row.id,
      fileNames: [],
      rowCount: 0,
      needsReattach: false,
    };
  });
}

export function matchTaxonomyIdInFilename(
  fileName: string,
  taxonomyIds: string[]
): string | null {
  const lower = fileName.toLowerCase();
  // Prefer longer IDs first to avoid partial collisions
  const sorted = [...taxonomyIds].sort((a, b) => b.length - a.length);
  for (const id of sorted) {
    if (id && lower.includes(id.toLowerCase())) return id;
  }
  return null;
}

export function formatFusionSummaryLine(result: FuseResult): string {
  return `${result.total} unique leads · ${result.silver} Silver · ${result.gold} Gold · ${result.diamond} Diamond`;
}

/** Sync persisted fusion attachments to current basket IDs. */
export function reconcileFusionAttachments(
  fusion: ProjectFusion,
  audience: SavedAudience | null
): ProjectFusion {
  if (!audience?.basket.length) {
    return { ...fusion, attachments: [] };
  }
  const byId = new Map(fusion.attachments.map((a) => [a.taxonomyId, a]));
  const attachments = audience.basket.map((item) => {
    const prev = byId.get(item.row.id);
    if (prev) return prev;
    return {
      taxonomyId: item.row.id,
      fileNames: [],
      rowCount: 0,
      needsReattach: false,
    };
  });
  return { ...fusion, attachments };
}
