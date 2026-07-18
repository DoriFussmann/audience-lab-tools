import type { FieldMap, FieldState } from "./types";

export type FieldDef = {
  key: string;
  label: string;
  category: "offer" | "lead" | "connection";
  group: string | null;
  optional?: boolean;
};

export const CATEGORIES: { id: "offer" | "lead" | "connection"; label: string }[] = [
  { id: "offer", label: "The Offer" },
  { id: "lead", label: "The Lead" },
  { id: "connection", label: "The Connection" },
];

export const FIELDS: FieldDef[] = [
  { key: "valueProp", label: "Core Value Proposition", category: "offer", group: null },
  { key: "benefit", label: "Primary Benefit / ROI", category: "offer", group: null },
  { key: "format", label: "Product / Service Format", category: "offer", group: null },

  { key: "companyName", label: "Name (example account)", category: "lead", group: "The Company", optional: true },
  { key: "industry", label: "Industry", category: "lead", group: "The Company" },
  { key: "companySize", label: "Size", category: "lead", group: "The Company" },
  { key: "techStack", label: "Tech Stack", category: "lead", group: "The Company" },

  { key: "personName", label: "Name (example contact)", category: "lead", group: "The Person", optional: true },
  { key: "jobTitle", label: "Job Title", category: "lead", group: "The Person" },
  { key: "department", label: "Department", category: "lead", group: "The Person" },
  { key: "authority", label: "Decision-Making Authority", category: "lead", group: "The Person" },

  { key: "painPoints", label: "Current Pain Points", category: "lead", group: "The Context" },
  { key: "triggers", label: "Recent Triggers", category: "lead", group: "The Context" },

  { key: "whyNow", label: "Why Now Angle", category: "connection", group: null },
  { key: "hook", label: "Personalized Hook", category: "connection", group: null },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f])
);

export function emptyFields(): FieldMap {
  const out: FieldMap = {};
  for (const f of FIELDS) {
    out[f.key] = { value: "", status: "empty", inferred: false };
  }
  return out;
}

export function isSettled(s: FieldState) {
  return s.status === "confirmed" || s.status === "skipped";
}

export function categoryFields(category: string) {
  return FIELDS.filter((f) => f.category === category);
}

export function categoryDone(fields: FieldMap, category: string) {
  return categoryFields(category).every((f) => f.optional || isSettled(fields[f.key]));
}

export function allDone(fields: FieldMap) {
  return FIELDS.every((f) => f.optional || isSettled(fields[f.key]));
}

export function remainingFields(fields: FieldMap) {
  return FIELDS.filter((f) => !isSettled(fields[f.key]));
}

export function confirmedSummaryLines(fields: FieldMap) {
  return FIELDS.filter((f) => fields[f.key].status === "confirmed").map(
    (f) => `${f.group ? f.group + " / " : ""}${f.label}: ${fields[f.key].value}`
  );
}

export function buildSummary(fields: FieldMap) {
  const lines: string[] = [];
  for (const cat of CATEGORIES) {
    lines.push(cat.label.toUpperCase());
    let currentGroup: string | null = null;
    for (const f of categoryFields(cat.id)) {
      if (f.group && f.group !== currentGroup) {
        currentGroup = f.group;
        lines.push(`  ${f.group}`);
      }
      if (!f.group) currentGroup = null;
      const state = fields[f.key];
      const value =
        state.status === "skipped" || !state.value.trim() ? "—" : state.value.trim();
      const tag = state.inferred && state.status === "confirmed" ? " (inferred)" : "";
      lines.push(`${f.group ? "    " : "  "}${f.label}: ${value}${tag}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function searchQueryFromFields(fields: FieldMap) {
  const weighted: string[] = [];
  const push = (key: string, times: number) => {
    const s = fields[key];
    if (s && s.status === "confirmed" && s.value.trim()) {
      for (let i = 0; i < times; i++) weighted.push(s.value);
    }
  };
  push("techStack", 3);
  push("industry", 3);
  push("painPoints", 2);
  push("valueProp", 2);
  push("format", 2);
  push("jobTitle", 1);
  push("department", 1);
  push("benefit", 1);
  push("triggers", 1);
  push("companyName", 1);
  return weighted.join(" ");
}
