import type { FieldMap, FieldState } from "./types";

export type CategoryDef = {
  id: string;
  label: string;
};

export type FieldDef = {
  key: string;
  label: string;
  category: string;
  group: string | null;
  optional?: boolean;
};

export type FieldSchema = {
  categories: CategoryDef[];
  fields: FieldDef[];
};

export const DEFAULT_SCHEMA: FieldSchema = {
  categories: [
    { id: "offer", label: "The Offer" },
    { id: "journey", label: "The Journey" },
    { id: "precision", label: "The Precision" },
    { id: "lead", label: "The Lead" },
    { id: "letter", label: "The Letter" },
  ],
  fields: [
    {
      key: "valueProp",
      label: "Core Value Proposition (in the prospect's words)",
      category: "offer",
      group: null,
    },
    {
      key: "format",
      label: "Product or Service Format",
      category: "offer",
      group: null,
      optional: true,
    },

    { key: "painPhrases", label: "Pain Search Phrases", category: "journey", group: null },
    { key: "categoryPhrases", label: "Category Search Phrases", category: "journey", group: null },
    {
      key: "competitorBrands",
      label: "Competitor Brands Compared",
      category: "journey",
      group: null,
    },
    {
      key: "adjacentBrands",
      label: "Adjacent Brands & Tools Used",
      category: "journey",
      group: null,
    },
    {
      key: "stagePhrases",
      label: "Late-Stage Search Phrases (pricing, reviews, financing, migration)",
      category: "journey",
      group: null,
    },

    {
      key: "falsePositives",
      label: "False Positives (who trips these searches but never buys)",
      category: "precision",
      group: null,
    },
    {
      key: "channelVolume",
      label: "Channel & Minimum List Size",
      category: "precision",
      group: null,
    },

    { key: "industry", label: "Industry", category: "lead", group: null },
    { key: "jobTitle", label: "Job Title of Reader", category: "lead", group: null },
    { key: "companySize", label: "Company Size", category: "lead", group: null, optional: true },
    { key: "department", label: "Department", category: "lead", group: null, optional: true },
    {
      key: "authority",
      label: "Decision-Making Authority",
      category: "lead",
      group: null,
      optional: true,
    },
    { key: "companyName", label: "Example Account", category: "lead", group: null, optional: true },

    { key: "benefit", label: "Reader's Personal Gain", category: "letter", group: null },
    {
      key: "proofPoint",
      label: "Proof Point (one number, name, or result)",
      category: "letter",
      group: null,
    },
    {
      key: "triggers",
      label: "Market Trigger (regulation, season, event — if any)",
      category: "letter",
      group: null,
      optional: true,
    },
    { key: "singleAsk", label: "Single Ask", category: "letter", group: null },
  ],
};

/** Map removed/renamed keys from previously saved projects onto current keys. */
export const FIELD_KEY_ALIASES: Record<string, string> = {
  painPoints: "painPhrases",
  techStack: "adjacentBrands",
};

/** Keys removed from the schema; dropped silently when loading project field maps. */
const OBSOLETE_FIELD_KEYS = ["personName", "hook", "whyNow"] as const;

const LEGACY_SCHEMA_KEYS = ["painPoints", "techStack", "personName", "hook", "whyNow"] as const;

/** True when a stored schema still uses the pre-migration field set. */
export function schemaNeedsMigration(schema: FieldSchema): boolean {
  const keys = new Set(schema.fields.map((f) => f.key));
  if (LEGACY_SCHEMA_KEYS.some((k) => keys.has(k))) return true;
  if (!keys.has("painPhrases") || !keys.has("adjacentBrands")) return true;
  return false;
}

export function migrateFieldKeys(fields: FieldMap): FieldMap {
  const out: FieldMap = { ...fields };
  for (const [from, to] of Object.entries(FIELD_KEY_ALIASES)) {
    if (out[from] !== undefined) {
      if (out[to] === undefined) out[to] = out[from];
      delete out[from];
    }
  }
  return out;
}

/** @deprecated Prefer schema.categories — kept for callers that still import CATEGORIES. */
export const CATEGORIES = DEFAULT_SCHEMA.categories;

/** @deprecated Prefer schema.fields — kept for callers that still import FIELDS. */
export const FIELDS = DEFAULT_SCHEMA.fields;

export function fieldByKey(schema: FieldSchema): Record<string, FieldDef> {
  return Object.fromEntries(schema.fields.map((f) => [f.key, f]));
}

export const FIELD_BY_KEY: Record<string, FieldDef> = fieldByKey(DEFAULT_SCHEMA);

export function emptyFields(schema: FieldSchema = DEFAULT_SCHEMA): FieldMap {
  const out: FieldMap = {};
  for (const f of schema.fields) {
    out[f.key] = { value: "", status: "empty", inferred: false };
  }
  return out;
}

export function reconcileFields(fields: FieldMap, schema: FieldSchema): FieldMap {
  const migrated = migrateFieldKeys(fields);
  for (const key of OBSOLETE_FIELD_KEYS) {
    delete migrated[key];
  }
  const next = emptyFields(schema);
  for (const key of Object.keys(next)) {
    if (migrated[key]) next[key] = migrated[key];
  }
  return next;
}

export function isSettled(s: FieldState) {
  return s.status === "confirmed" || s.status === "skipped";
}

export function categoryFields(schema: FieldSchema, category: string) {
  return schema.fields.filter((f) => f.category === category);
}

export function categoryDone(fields: FieldMap, schema: FieldSchema, category: string) {
  return categoryFields(schema, category).every(
    (f) => f.optional || isSettled(fields[f.key] || { value: "", status: "empty", inferred: false })
  );
}

export function allDone(fields: FieldMap, schema: FieldSchema = DEFAULT_SCHEMA) {
  return schema.fields.every(
    (f) => f.optional || isSettled(fields[f.key] || { value: "", status: "empty", inferred: false })
  );
}

export function remainingFields(fields: FieldMap, schema: FieldSchema = DEFAULT_SCHEMA) {
  return schema.fields.filter(
    (f) => !isSettled(fields[f.key] || { value: "", status: "empty", inferred: false })
  );
}

export function confirmedSummaryLines(fields: FieldMap, schema: FieldSchema = DEFAULT_SCHEMA) {
  return schema.fields
    .filter((f) => fields[f.key]?.status === "confirmed")
    .map((f) => `${f.group ? f.group + " / " : ""}${f.label}: ${fields[f.key].value}`);
}

export function buildSummary(fields: FieldMap, schema: FieldSchema = DEFAULT_SCHEMA) {
  const lines: string[] = [];
  for (const cat of schema.categories) {
    lines.push(cat.label.toUpperCase());
    let currentGroup: string | null = null;
    for (const f of categoryFields(schema, cat.id)) {
      if (f.group && f.group !== currentGroup) {
        currentGroup = f.group;
        lines.push(`  ${f.group}`);
      }
      if (!f.group) currentGroup = null;
      const state = fields[f.key] || { value: "", status: "empty" as const, inferred: false };
      const value =
        state.status === "skipped" || !state.value.trim() ? "—" : state.value.trim();
      const tag = state.inferred && state.status === "confirmed" ? " (inferred)" : "";
      lines.push(`${f.group ? "    " : "  "}${f.label}: ${value}${tag}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function searchQueryFromFields(fields: FieldMap, schema: FieldSchema = DEFAULT_SCHEMA) {
  const parts: string[] = [];
  for (const f of schema.fields) {
    const s = fields[f.key];
    if (s && s.status === "confirmed" && s.value.trim()) {
      parts.push(s.value.trim());
    }
  }
  return parts.join(" ");
}

export function slugify(label: string, used: Set<string>) {
  let base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  if (!base) base = "field";
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  used.add(key);
  return key;
}

export function normalizeSchema(raw: unknown): FieldSchema | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { categories?: unknown; fields?: unknown };
  if (!Array.isArray(obj.categories) || !Array.isArray(obj.fields)) return null;
  const categories: CategoryDef[] = [];
  const catIds = new Set<string>();
  for (const c of obj.categories) {
    if (!c || typeof c !== "object") continue;
    const id = String((c as CategoryDef).id || "").trim();
    const label = String((c as CategoryDef).label || "").trim();
    if (!id || !label || catIds.has(id)) continue;
    catIds.add(id);
    categories.push({ id, label });
  }
  if (!categories.length) return null;

  const fields: FieldDef[] = [];
  const keys = new Set<string>();
  for (const f of obj.fields) {
    if (!f || typeof f !== "object") continue;
    const key = String((f as FieldDef).key || "").trim();
    const label = String((f as FieldDef).label || "").trim();
    const category = String((f as FieldDef).category || "").trim();
    if (!key || !label || !catIds.has(category) || keys.has(key)) continue;
    keys.add(key);
    const groupRaw = (f as FieldDef).group;
    const group =
      groupRaw === null || groupRaw === undefined || String(groupRaw).trim() === ""
        ? null
        : String(groupRaw).trim();
    fields.push({
      key,
      label,
      category,
      group,
      optional: !!(f as FieldDef).optional,
    });
  }
  if (!fields.length) return null;
  return { categories, fields };
}
