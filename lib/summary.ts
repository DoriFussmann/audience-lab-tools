import { buildSummary } from "./fields";
import type { FieldMap, SavedAudience } from "./types";

export function buildAudienceSummary(audience: SavedAudience | null) {
  if (!audience) return "";
  const r = audience.row;
  return [
    "MATCHED AUDIENCE",
    `  Premade: ${r.premade}`,
    `  Taxonomy ID: ${r.id}`,
    `  Category: ${r.category}`,
    `  Subcategory: ${r.subcategory}`,
    `  Audience Type: ${r.type}`,
    `  Confidence: ${audience.confidence}`,
    `  Rationale: ${audience.why}`,
    "",
    "  Description:",
    `    ${r.description}`,
    "",
    "  Keywords:",
    `    ${r.keywords}`,
  ].join("\n");
}

export function buildProjectSummary(
  name: string,
  fields: FieldMap,
  audience: SavedAudience | null
) {
  const parts = [
    `PROJECT: ${name}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "════════════════════════════════",
    "AUDIENCE DEFINE",
    "════════════════════════════════",
    "",
    buildSummary(fields),
    "",
    "════════════════════════════════",
    "AUDIENCE FIND",
    "════════════════════════════════",
    "",
    audience ? buildAudienceSummary(audience) : "No audience confirmed.",
  ];
  return parts.join("\n");
}
