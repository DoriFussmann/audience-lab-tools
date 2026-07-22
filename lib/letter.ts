import type {
  LetterEmail,
  LetterMaterialLink,
  LetterMaterials,
  LetterResult,
  LetterTierName,
  LetterTierSequence,
  ProjectLetter,
} from "./types";

export const LETTER_TIER_ORDER: LetterTierName[] = ["Silver", "Gold", "Diamond"];

export function emptyProjectLetter(): ProjectLetter {
  return {
    materials: { links: [], keyMessages: [] },
    result: null,
  };
}

function isTierName(v: unknown): v is LetterTierName {
  return v === "Silver" || v === "Gold" || v === "Diamond";
}

function normalizeEmail(raw: unknown): LetterEmail | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as { day?: unknown; subject?: unknown; body?: unknown };
  const day = Number(e.day);
  const subject = typeof e.subject === "string" ? e.subject.trim() : "";
  const body = typeof e.body === "string" ? e.body.trim() : "";
  if (!Number.isFinite(day) || !subject || !body) return null;
  return { day, subject, body };
}

function normalizeTier(raw: unknown): LetterTierSequence | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as { tier?: unknown; emails?: unknown };
  if (!isTierName(t.tier) || !Array.isArray(t.emails)) return null;
  const emails = t.emails.map(normalizeEmail).filter((e): e is LetterEmail => !!e);
  if (emails.length < 3) return null;
  return { tier: t.tier, emails: emails.slice(0, 3) };
}

export function normalizeLetterResult(raw: unknown): LetterResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { tiers?: unknown; note?: unknown };
  if (!Array.isArray(obj.tiers)) return null;

  const byTier = new Map<LetterTierName, LetterTierSequence>();
  for (const item of obj.tiers) {
    const tier = normalizeTier(item);
    if (tier) byTier.set(tier.tier, tier);
  }

  const tiers = LETTER_TIER_ORDER.map((name) => byTier.get(name)).filter(
    (t): t is LetterTierSequence => !!t
  );
  if (tiers.length !== 3) return null;

  return {
    tiers,
    note:
      typeof obj.note === "string" && obj.note.trim()
        ? obj.note.trim()
        : "Days are campaign days (Mon-Fri); stop the sequence for any prospect who replies.",
  };
}

function normalizeMaterialLink(raw: unknown): LetterMaterialLink | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    return url ? { url, label: "" } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { url?: unknown; label?: unknown };
  const url = typeof obj.url === "string" ? obj.url.trim() : "";
  if (!url) return null;
  return {
    url,
    label: typeof obj.label === "string" ? obj.label.trim() : "",
  };
}

function normalizeLinks(raw: unknown): LetterMaterialLink[] {
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((url) => ({ url, label: "" }));
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeMaterialLink)
    .filter((l): l is LetterMaterialLink => !!l);
}

function normalizeKeyMessages(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => (typeof m === "string" ? m.trim() : ""))
    .filter(Boolean);
}

export function normalizeMaterials(raw: unknown): LetterMaterials {
  if (!raw || typeof raw !== "object") {
    return { links: [], keyMessages: [] };
  }
  const obj = raw as {
    links?: unknown;
    keyMessages?: unknown;
    snippets?: unknown;
  };
  return {
    links: normalizeLinks(obj.links),
    keyMessages: normalizeKeyMessages(obj.keyMessages),
  };
}

export function normalizeProjectLetter(raw: unknown): ProjectLetter {
  const empty = emptyProjectLetter();
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as {
    materials?: unknown;
    result?: unknown;
  };
  return {
    materials: normalizeMaterials(obj.materials),
    result: normalizeLetterResult(obj.result),
  };
}

export function materialsLinksList(links: LetterMaterialLink[]): string[] {
  return links.map((l) => l.url.trim()).filter(Boolean);
}

export function formatMaterialLink(link: LetterMaterialLink): string {
  const url = link.url.trim();
  const label = link.label.trim();
  if (!url) return "";
  return label ? `${label}: ${url}` : url;
}
