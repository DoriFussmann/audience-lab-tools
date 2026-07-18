import type {
  ApproachStyle,
  LetterEmail,
  LetterResult,
  LetterTierName,
  LetterTierSequence,
  ProjectLetter,
} from "./types";

export const APPROACH_STYLES: ApproachStyle[] = [
  "Direct",
  "Consultative",
  "Challenger",
  "Warm",
];

export const LETTER_TIER_ORDER: LetterTierName[] = ["Silver", "Gold", "Diamond"];

export function emptyProjectLetter(): ProjectLetter {
  return {
    materials: { links: "", snippets: "" },
    style: "Direct",
    result: null,
  };
}

function isApproachStyle(v: unknown): v is ApproachStyle {
  return typeof v === "string" && (APPROACH_STYLES as string[]).includes(v);
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

export function normalizeLetterResult(
  raw: unknown,
  style: ApproachStyle
): LetterResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { tiers?: unknown; note?: unknown; style?: unknown };
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
    style: isApproachStyle(obj.style) ? obj.style : style,
  };
}

export function normalizeProjectLetter(raw: unknown): ProjectLetter {
  const empty = emptyProjectLetter();
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as {
    materials?: { links?: unknown; snippets?: unknown };
    style?: unknown;
    result?: unknown;
  };
  const style = isApproachStyle(obj.style) ? obj.style : empty.style;
  return {
    materials: {
      links: typeof obj.materials?.links === "string" ? obj.materials.links : "",
      snippets: typeof obj.materials?.snippets === "string" ? obj.materials.snippets : "",
    },
    style,
    result: normalizeLetterResult(obj.result, style),
  };
}

export function materialsLinksList(links: string): string[] {
  return links
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
