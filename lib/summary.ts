import { buildSummary, type FieldSchema } from "./fields";
import { materialsLinksList } from "./letter";
import type {
  FieldMap,
  LetterResult,
  ProjectFusion,
  ProjectLetter,
  SavedAudience,
  TierPlan,
} from "./types";

function formatTierPlan(plan: TierPlan) {
  const lines: string[] = [
    "Tier plan",
    "",
    `${plan.silver.name}`,
    `  Membership: ${plan.silver.rule}`,
    `  Treatment: ${plan.silver.treatment}`,
    "",
    `${plan.gold.name}`,
    `  Membership: ${plan.gold.rule}`,
    `  Treatment: ${plan.gold.treatment}`,
  ];

  if (plan.combinations.length) {
    lines.push("  Strongest combinations:");
    for (const pair of plan.combinations) {
      lines.push(`    ${pair.a} × ${pair.b}`);
    }
  }

  lines.push(
    "",
    `${plan.diamond.name}`,
    `  Membership: ${plan.diamond.rule}`,
    `  Treatment: ${plan.diamond.treatment}`
  );
  if (plan.diamond.note) {
    lines.push(`  ${plan.diamond.note}`);
  }

  lines.push(
    "",
    "TAXONOMY IDS (for audience pull)",
    ...plan.taxonomyIds.map((id) => `  ${id}`)
  );

  return lines.join("\n");
}

export function buildAudienceSummary(audience: SavedAudience | null) {
  if (!audience || !audience.basket.length) return "";

  const lines: string[] = [
    "MATCHED AUDIENCE BASKET",
    `  Size: ${audience.basket.length}`,
    "",
  ];

  audience.basket.forEach((item, i) => {
    const r = item.row;
    lines.push(
      `${i + 1}. ${r.premade}`,
      `  Taxonomy ID: ${r.id}`,
      `  Role: ${item.role}`,
      `  Confidence: ${item.confidence}`,
      `  Rationale: ${item.why}`,
      `  Category: ${r.category} › ${r.subcategory} · ${r.type}`,
      ""
    );
  });

  lines.push(formatTierPlan(audience.tierPlan));
  return lines.join("\n");
}

export function buildLetterCopyAll(result: LetterResult) {
  const blocks: string[] = [];
  for (const tier of result.tiers) {
    blocks.push(tier.tier, "");
    tier.emails.forEach((email, i) => {
      blocks.push(
        `Email ${i + 1} · Campaign Day ${email.day}`,
        `Subject: ${email.subject}`,
        "",
        email.body,
        ""
      );
    });
  }
  if (result.note) blocks.push(result.note);
  return blocks.join("\n").trim();
}

export function buildLetterSummary(letter: ProjectLetter | null) {
  if (!letter?.result) return "";
  const links = materialsLinksList(letter.materials.links);
  const messages = letter.materials.keyMessages.map((m) => m.trim()).filter(Boolean);
  const lines = [
    links.length ? `Links: ${links.join(", ")}` : "Links: (none)",
    messages.length
      ? `Key messages: ${messages.join(" | ")}`
      : "Key messages: (none)",
    "",
    buildLetterCopyAll(letter.result),
  ];
  return lines.join("\n");
}

export function buildProjectSummary(
  name: string,
  fields: FieldMap,
  audience: SavedAudience | null,
  schema?: FieldSchema,
  letter?: ProjectLetter | null,
  fusion?: ProjectFusion | null
) {
  const fusionLine = fusion?.summary
    ? `${fusion.summary.total} unique leads · ${fusion.summary.silver} Silver · ${fusion.summary.gold} Gold · ${fusion.summary.diamond} Diamond (top ${fusion.summary.exportN})`
    : "No fusion run yet.";

  const parts = [
    `PROJECT: ${name}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "════════════════════════════════",
    "AUDIENCE DEFINE",
    "════════════════════════════════",
    "",
    buildSummary(fields, schema),
    "",
    "════════════════════════════════",
    "AUDIENCE FIND",
    "════════════════════════════════",
    "",
    audience ? buildAudienceSummary(audience) : "No audience basket confirmed.",
    "",
    "════════════════════════════════",
    "AUDIENCE LETTER",
    "════════════════════════════════",
    "",
    letter?.result ? buildLetterSummary(letter) : "No letter sequences generated.",
    "",
    "════════════════════════════════",
    "AUDIENCE FUSION",
    "════════════════════════════════",
    "",
    fusionLine,
  ];
  return parts.join("\n");
}

/** Full pull-ready kit for download. */
export function buildAudienceKit(
  name: string,
  fields: FieldMap,
  audience: SavedAudience,
  letter: ProjectLetter,
  schema?: FieldSchema
) {
  const links = materialsLinksList(letter.materials.links);
  const messages = letter.materials.keyMessages.map((m) => m.trim()).filter(Boolean);
  const materialsLine = [
    links.length ? `Links: ${links.join(", ")}` : "Links: (none)",
    messages.length
      ? `Key messages: ${messages.join(" | ")}`
      : "Key messages: (none)",
  ].join(" · ");

  const parts = [
    `# ${name} — Audience Kit`,
    "",
    `Generated: ${new Date().toLocaleString()}`,
    materialsLine,
    "",
    "## Audience Define",
    "",
    buildSummary(fields, schema),
    "",
    "## Audience Find",
    "",
    buildAudienceSummary(audience),
    "",
    "## Audience Letter",
    "",
  ];

  if (!letter.result) {
    parts.push("No letter sequences generated.");
  } else {
    parts.push(
      "Schedule: Email 1 → Campaign Day 1 · Email 2 → Campaign Day 5 · Email 3 → Campaign Day 10 (Mon–Fri)",
      "",
      buildLetterCopyAll(letter.result)
    );
  }

  return parts.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
}
