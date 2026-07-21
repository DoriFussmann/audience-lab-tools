import { buildSummary, type FieldSchema } from "./fields";
import { AUDIENCE_ROLES, type RoleCandidates } from "./match";
import type {
  ApproachStyle,
  AudienceRole,
  FieldMap,
  LetterMaterials,
  SavedAudience,
  TaxRow,
} from "./types";

export type PromptToken = {
  id: string;
  label: string;
  /** Inserted as {{id}} in the template */
  token: string;
  kind: "system" | "data_point";
  fieldKey?: string;
};

export type ChatPrompts = {
  define: string;
  find: string;
  letter: string;
  audit?: string;
};

export const DEFINE_SYSTEM_TOKENS: PromptToken[] = [
  { id: "field_state", label: "Data points state", token: "{{field_state}}", kind: "system" },
  { id: "valid_keys", label: "Valid field keys", token: "{{valid_keys}}", kind: "system" },
];

export const FIND_SYSTEM_TOKENS: PromptToken[] = [
  {
    id: "definition_summary",
    label: "Definition summary",
    token: "{{definition_summary}}",
    kind: "system",
  },
  { id: "candidates", label: "Candidate audiences", token: "{{candidates}}", kind: "system" },
  { id: "valid_keys", label: "Valid field keys", token: "{{valid_keys}}", kind: "system" },
];

export const LETTER_SYSTEM_TOKENS: PromptToken[] = [
  {
    id: "definition_summary",
    label: "Definition summary",
    token: "{{definition_summary}}",
    kind: "system",
  },
  { id: "basket", label: "Confirmed basket", token: "{{basket}}", kind: "system" },
  { id: "tier_plan", label: "Tier plan", token: "{{tier_plan}}", kind: "system" },
  { id: "materials_links", label: "Materials links", token: "{{materials_links}}", kind: "system" },
  {
    id: "materials_snippets",
    label: "Materials snippets",
    token: "{{materials_snippets}}",
    kind: "system",
  },
  { id: "approach_style", label: "Approach style", token: "{{approach_style}}", kind: "system" },
];

export const DEFAULT_DEFINE_PROMPT = `You are an intake assistant collecting target-market data for an audience definition.
"The Lead" (or equivalent persona category) is a persona / ideal customer profile, not one named individual. Ask about the archetype: the kind of company and the kind of person this is for. Fields describe a segment, not a specific human. The Journey fields describe what this segment researches online in the months before buying; the falsePositives field describes who researches the same terms without ever becoming a customer.
Data points to collect, with current state:
{{field_state}}
Rules:
- Work through OUTSTANDING data points in the order listed. Ask about one to three closely related data points per turn. Keep questions short and plain.
- Never show the user field labels, keys, or category names. Ask about the underlying thing in natural conversational language, as one person asking another about their business. Refer to the people being described as the prospect or prospects.
- Opening turn: if all data points are OUTSTANDING and the user hasn't written anything yet, do not ask about a single field. Instead, open with one warm, plain question inviting them to describe what they sell and who it's for, in their own words, as if telling a friend — for example: "Tell me about what you're selling — what is it, and who's it for?" Mention they can also upload a document if they already have notes written down. Extract every data point you can from their answer as proposals, then continue with whatever is still outstanding.
- Document upload: if the user attaches a brief, notes, PDF, or image, treat that document as their full description. Extract every outstanding data point you can in that turn as proposals. Be thorough before asking follow-ups. Mark uncertain values with "inferred": true.
- Optional data points: ask for them once, at most. If the user has no answer, propose nothing for them and move on immediately. Never block on an optional field.
- Read the user's latest message and extract every data point value you can, as proposals.
- Extrapolate when the user cannot answer or gives partial information, using what is already confirmed plus general knowledge. Mark extrapolated values with "inferred": true. If a data point cannot be reasonably extrapolated, do not propose it; move on and ask about the next one.
- For painPhrases, categoryPhrases, and stagePhrases: values must be language the prospect would literally type into a search engine (2-6 word phrases, comma-separated). If the user answers in marketing or descriptive language, translate it into search-phrase form and propose it with "inferred": true.
- For competitorBrands and adjacentBrands: if the user names a category but no brands, propose 3-5 known brands in that category with "inferred": true. Never leave these empty if the offer category is known.
- Never propose a value for a data point that is already CONFIRMED unless the user explicitly changes it.
- Values are short strings: one line, at most about 25 words. No markdown, no bullet points.
- Do not congratulate, do not add commentary, do not explain your process. Be direct.
- If all data points are settled, your reply should just say the definition is complete.
Respond by calling the "respond" tool. "reply" is your next message to the user. "proposals" holds any data-point values you extracted or inferred this turn.
Valid field keys: {{valid_keys}}.`;

export const DEFAULT_FIND_PROMPT = `You select a basket of pre-made audiences from role-grouped taxonomy candidates for a given target-market definition. The definition describes a persona / ideal customer profile, not one named individual. Any company or person name in it is a representative example only — never let it narrow the match.

TARGET MARKET DEFINITION:
{{definition_summary}}

CANDIDATE AUDIENCES (Stage-1 retrieval by role; Premade name + Keywords only — do not invent fields):
{{candidates}}

Rules:
- For each candidate, classify its archetype from name + keywords only: brand, topic, profession, or intender.
- Check intent angle: demote topical matches whose keywords imply the wrong mode (careers/jobs, academic/research, stock/investor-relations flavored).
- Select a basket of 6–10 audiences spanning roles with this target mix: 3–4 competitor/brand, 2–3 pain/category, 1–2 adjacent, 1–2 stage. Leave a role uncovered rather than forcing a weak pick. Minimum basket size 6 only if enough genuine candidates exist; otherwise return fewer and say so in "reply".
- Prefer variety across roles — not many near-duplicate intent variants of the same idea.
- Only use ids from the candidate list. Never invent an id. Assign each selection the role group it came from (pain, category, competitor, adjacent, stage).
- Never justify a pick using Description, Category, Subcategory, or Audience Type — those are not provided and must not influence selection.
- Per selection: taxonomy id, role, one-line reasoning ("why"), confidence as "high" | "medium" | "low".
- If the user's latest message contains information that belongs in the target-market definition, return it in "proposals". Valid field keys: {{valid_keys}}. Values are short one-line strings.
- Be direct. No commentary, no preamble, no markdown.

Respond by calling the "respond" tool. "reply" is a short message to the user, "matches" holds the selected basket, and "proposals" holds any definition values from the user's latest message.`;

export const DEFAULT_LETTER_PROMPT = `You write cold outreach email sequences based on buying-intent data. You are given: the sender's offer and letter data points, a basket of intent audiences (with the search-phrase keywords that define them), a three-tier plan (Silver: leads in any one audience; Gold: leads in 2-3 audiences; Diamond: leads in most audiences), optional materials (links and proof snippets), and an approach style.
Produce one sequence of exactly 3 emails for each tier: Silver, Gold, Diamond.
Rules:
- Specificity scales with tier. Silver: category-level relevance, assume one intent signal. Gold: problem-aware, reference the pain and the evaluation openly. Diamond: near-uncomfortably specific — write as if you know they are actively comparing options in this exact space right now, because they are.
- Campaigns run on business days only (Monday-Friday). Each sequence completes within 10 campaign days: Email 1 sends Campaign Day 1, Email 2 sends Campaign Day 5, Email 3 sends Campaign Day 10.
- The three emails in a sequence are three different angles, never three reminders: Email 1 opens on the intent moment and the prospect's problem; Email 2 shifts angle and leads with the proof point; Email 3 is a short, direct breakup carrying the single ask plainly.
- Every email: subject line under 6 words, lowercase unless a proper noun; body 50-120 words; ends with the single ask (Email 1-2 soft form, Email 3 direct form); no greetings fluff, no "I hope this finds you well", no exclamation marks, no spam-trigger phrasing.
- Use merge tokens {{firstName}} and {{company}} where a name or company naturally belongs. Never invent specifics about the prospect beyond what the tier justifies.
- If links are provided: place the most action-oriented link (booking/calendar if present) as the destination of the single ask; use at most one link per email; a case study or landing page link belongs in Email 2 with the proof point. Never invent URLs — if no links are provided, phrase the ask so it works without one (e.g. reply-based).
- If snippets are provided: treat them as verified proof material — quote or reference them where the proof point lands, verbatim or lightly trimmed, never embellished. Do not use them in every email; proof concentrates in Email 2.
- Apply the approach style to tone only, never to structure: Direct = plain and brief; Consultative = leads with a question about their situation; Challenger = leads with a counterintuitive claim about their category; Warm = conversational, lightly personal.
- Voice: write like one busy person to another. Short sentences. No marketing language.
Respond only with JSON: { "tiers": [ { "tier": "Silver|Gold|Diamond", "emails": [ { "day": n, "subject": "...", "body": "..." } ] } ], "note": "one line: days are campaign days (Mon-Fri); stop the sequence for any prospect who replies" }`;

export const DEFAULT_AUDIT_PROMPT = `You audit a sample of real leads against a target-audience definition. You receive: the audience definition (offer, journey search phrases, precision criteria including false-positive profiles, lead attributes, letter data), the basket of intent audiences with roles, the tier rules, and a sample of pseudonymized leads (Lead A, Lead B, ...) each with demographic/professional attributes and their matched audiences.
For each lead, judge how well this person matches the defined target, using the attributes and their matched audiences as evidence. Consider capital/means where relevant (net worth, income vs the offer), life stage (age vs the move being sold), professional context (title, industry vs the persona), and whether they resemble the defined false positives.
Respond only with JSON:
{ "leads": [ { "label": "Lead A", "tier": "Silver|Gold|Diamond", "fitPercent": 0-100, "whyFits": "...", "whyNot": "...", "recommendation": "..." } ],
  "patterns": { "highFitSources": "which audiences the strong fits came from and why that makes sense", "lowFitSources": "which audiences the weak fits came from", "basketAdvice": "concrete recommendation about the basket, e.g. an audience to reconsider or a pull setting to change", "overall": "one-paragraph verdict on whether this fused list matches the defined audience" } }
Rules: be blunt; a lead resembling the false-positive profile scores below 40 regardless of tier; do not inflate Diamond leads by tier alone — judge the person, not the label; recommendations must be actionable (change the basket, the pull geography, or the Define criteria), never generic.`;

export const DEFAULT_PROMPTS: ChatPrompts = {
  define: DEFAULT_DEFINE_PROMPT,
  find: DEFAULT_FIND_PROMPT,
  letter: DEFAULT_LETTER_PROMPT,
  audit: DEFAULT_AUDIT_PROMPT,
};

const LEGACY_FIND_WEIGH =
  "Weigh tech stack, industry, pain points and job context most heavily when those fields exist.";

/** Upgrade stock/legacy prompts after the Define field-schema migration. */
export function migratePrompts(prompts: ChatPrompts): ChatPrompts {
  let define = prompts.define;
  let find = prompts.find;
  let letter = prompts.letter || DEFAULT_LETTER_PROMPT;
  if (!define.includes("Never show the user field labels, keys, or category names")) {
    define = DEFAULT_DEFINE_PROMPT;
  }
  if (
    !define.includes("Document upload:") &&
    define.includes("Opening turn:")
  ) {
    define = define.replace(
      "- Opening turn:",
      `- Document upload: if the user attaches a brief, notes, PDF, or image, treat that document as their full description. Extract every outstanding data point you can in that turn as proposals. Be thorough before asking follow-ups. Mark uncertain values with "inferred": true.\n- Opening turn:`
    );
    if (
      define.includes("as if telling a friend") &&
      !define.includes("upload a document")
    ) {
      define = define.replace(
        "as if telling a friend — for example:",
        "as if telling a friend. Mention they can also upload a document if they already have notes written down — for example:"
      );
    }
  }
  if (find.includes(LEGACY_FIND_WEIGH)) {
    find = find.replace(
      LEGACY_FIND_WEIGH,
      "Weigh the Journey fields most heavily — painPhrases, categoryPhrases, competitorBrands, adjacentBrands, stagePhrases — since they mirror the search-phrase language of the taxonomy's keyword column. Industry and job context are weak tiebreakers only."
    );
  }
  // Replace single-audience / top-3 Find prompts with basket selection prompt.
  if (
    find.includes("select the single best") ||
    find.includes("Return the top 3 matches") ||
    find.includes('"matches" holds the top 3')
  ) {
    find = DEFAULT_FIND_PROMPT;
  }
  if (!letter.trim() || !letter.includes("Produce one sequence of exactly 3 emails")) {
    letter = DEFAULT_LETTER_PROMPT;
  }
  return { define, find, letter };
}

const TOKEN_RE = /\{\{([a-zA-Z0-9_:]+)\}\}/g;

export function dataPointTokenId(key: string) {
  return `data_point:${key}`;
}

export function dataPointToken(key: string) {
  return `{{${dataPointTokenId(key)}}}`;
}

export function fieldTokens(schema: FieldSchema): PromptToken[] {
  return schema.fields.map((f) => ({
    id: dataPointTokenId(f.key),
    label: f.label,
    token: dataPointToken(f.key),
    kind: "data_point" as const,
    fieldKey: f.key,
  }));
}

export function availableTokens(
  kind: "define" | "find" | "letter",
  schema: FieldSchema
): PromptToken[] {
  if (kind === "letter") return [...LETTER_SYSTEM_TOKENS, ...fieldTokens(schema)];
  const system = kind === "define" ? DEFINE_SYSTEM_TOKENS : FIND_SYSTEM_TOKENS;
  return [...system, ...fieldTokens(schema)];
}

export function tokensInPrompt(prompt: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of prompt.matchAll(TOKEN_RE)) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      found.push(id);
    }
  }
  return found;
}

export function promptContainsToken(prompt: string, tokenId: string) {
  return prompt.includes(`{{${tokenId}}}`);
}

export function insertToken(prompt: string, token: string, at?: number) {
  if (prompt.includes(token)) return prompt;
  if (at === undefined || at < 0 || at > prompt.length) {
    const trimmed = prompt.replace(/\s*$/, "");
    return trimmed ? `${trimmed}\n\n${token}` : token;
  }
  return prompt.slice(0, at) + token + prompt.slice(at);
}

export function removeToken(prompt: string, tokenId: string) {
  const re = new RegExp(`\\{\\{${tokenId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}\\}`, "g");
  return prompt
    .replace(re, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/** Drop data-point tokens whose fields no longer exist; keep system tokens. */
export function syncPromptsToSchema(prompts: ChatPrompts, schema: FieldSchema): ChatPrompts {
  const keys = new Set(schema.fields.map((f) => f.key));
  const prune = (text: string) => {
    let next = text;
    for (const id of tokensInPrompt(text)) {
      if (id.startsWith("data_point:")) {
        const key = id.slice("data_point:".length);
        if (!keys.has(key)) next = removeToken(next, id);
      }
    }
    return next;
  };
  return {
    define: prune(prompts.define),
    find: prune(prompts.find),
    letter: prune(prompts.letter),
  };
}

export function formatBasketForLetter(audience: SavedAudience) {
  return audience.basket
    .map((item, i) => {
      const r = item.row;
      return `${i + 1}. ${r.premade}\n   role: ${item.role}\n   keywords: ${r.keywords || "—"}`;
    })
    .join("\n");
}

export function formatTierPlanForLetter(audience: SavedAudience) {
  const plan = audience.tierPlan;
  return [
    `${plan.silver.name}: ${plan.silver.rule} (threshold ${plan.silver.threshold})`,
    `${plan.gold.name}: ${plan.gold.rule} (threshold ${plan.gold.threshold})`,
    `${plan.diamond.name}: ${plan.diamond.rule} (threshold ${plan.diamond.threshold})`,
  ].join("\n");
}

export function formatMaterialsForLetter(materials: LetterMaterials) {
  const links = materials.links.trim() || "(none)";
  const snippets = materials.snippets.trim() || "(none)";
  return `Links:\n${links}\n\nSnippets:\n${snippets}`;
}

export function buildLetterUserPayload(opts: {
  fields: FieldMap;
  schema: FieldSchema;
  audience: SavedAudience;
  materials: LetterMaterials;
  style: ApproachStyle;
}) {
  const confirmed = opts.schema.fields
    .filter((f) => opts.fields[f.key]?.status === "confirmed" && opts.fields[f.key].value.trim())
    .map((f) => `${f.label}: ${opts.fields[f.key].value.trim()}`)
    .join("\n");

  return [
    "GENERATE cold-email sequences from the following project data.",
    "",
    "APPROACH STYLE:",
    opts.style,
    "",
    "DEFINE (confirmed fields):",
    confirmed || "(none)",
    "",
    "CONFIRMED BASKET:",
    formatBasketForLetter(opts.audience),
    "",
    "TIER PLAN:",
    formatTierPlanForLetter(opts.audience),
    "",
    "MATERIALS:",
    formatMaterialsForLetter(opts.materials),
  ].join("\n");
}

function fieldStateLine(
  fields: FieldMap,
  schema: FieldSchema,
  key: string
): string {
  const f = schema.fields.find((x) => x.key === key);
  if (!f) return "";
  const s = fields[f.key] || { value: "", status: "empty" as const, inferred: false };
  const catLabel = schema.categories.find((c) => c.id === f.category)?.label || f.category;
  const path = `${catLabel}${f.group ? " / " + f.group : ""} / ${f.label} [${f.key}]`;
  if (s.status === "confirmed") return `${path} = CONFIRMED: ${s.value}`;
  if (s.status === "skipped") return `${path} = SKIPPED`;
  return `${path} = OUTSTANDING${f.optional ? " (optional)" : ""}`;
}

export function fieldStateText(fields: FieldMap, schema: FieldSchema) {
  return schema.fields.map((f) => fieldStateLine(fields, schema, f.key)).join("\n");
}

function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** @deprecated Prefer candidateTextByRole — flat list for legacy prompts only. */
export function candidateText(candidates: TaxRow[]) {
  return candidates
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} | ${c.premade}\n   keywords: ${trim(c.keywords, 220)}`
    )
    .join("\n");
}

/** Stage-2 LLM input: id, Premade, Keywords only — grouped by role. */
export function candidateTextByRole(byRole: RoleCandidates | Record<AudienceRole, TaxRow[]>) {
  const blocks: string[] = [];
  for (const role of AUDIENCE_ROLES) {
    const list = byRole[role] || [];
    if (!list.length) continue;
    const lines = list.map((c, i) => {
      const row = "row" in c ? (c as { row: TaxRow }).row : (c as TaxRow);
      return `  ${i + 1}. id=${row.id} | ${row.premade}\n     keywords: ${trim(row.keywords, 220)}`;
    });
    blocks.push(`[${role}]\n${lines.join("\n")}`);
  }
  return blocks.length ? blocks.join("\n\n") : "(no candidates)";
}

export type RenderContext = {
  schema: FieldSchema;
  fields: FieldMap;
  candidates?: TaxRow[];
  candidatesByRole?: RoleCandidates | Record<AudienceRole, TaxRow[]>;
  audience?: SavedAudience | null;
  materials?: LetterMaterials;
  approachStyle?: ApproachStyle;
};

export function renderPrompt(template: string, ctx: RenderContext) {
  const keys = ctx.schema.fields.map((f) => f.key).join(", ");
  const candidates =
    ctx.candidatesByRole != null
      ? candidateTextByRole(ctx.candidatesByRole)
      : candidateText(ctx.candidates || []);
  const confirmedSummary = ctx.schema.fields
    .filter((f) => ctx.fields[f.key]?.status === "confirmed" && ctx.fields[f.key].value.trim())
    .map((f) => `${f.label}: ${ctx.fields[f.key].value.trim()}`)
    .join("\n");
  const values: Record<string, string> = {
    field_state: fieldStateText(ctx.fields, ctx.schema),
    valid_keys: keys,
    definition_summary: confirmedSummary || buildSummary(ctx.fields, ctx.schema),
    candidates,
    basket: ctx.audience ? formatBasketForLetter(ctx.audience) : "",
    tier_plan: ctx.audience ? formatTierPlanForLetter(ctx.audience) : "",
    materials_links: ctx.materials?.links.trim() || "(none)",
    materials_snippets: ctx.materials?.snippets.trim() || "(none)",
    approach_style: ctx.approachStyle || "Direct",
    // Preserve merge tokens used in letter bodies / prompt instructions.
    firstName: "{{firstName}}",
    company: "{{company}}",
  };
  for (const f of ctx.schema.fields) {
    values[dataPointTokenId(f.key)] = fieldStateLine(ctx.fields, ctx.schema, f.key);
  }

  return template.replace(TOKEN_RE, (_, id: string) => {
    if (id in values) return values[id];
    return `{{${id}}}`;
  });
}

/** Confirmed field value for admin preview / pill tooltips; "—" when empty. */
export function confirmedDataPointValue(fields: FieldMap, key: string): string {
  const s = fields[key];
  if (s?.status === "confirmed" && s.value.trim()) return s.value.trim();
  return "—";
}

export function truncatePreview(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "—";
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

export function tokenHelpText(token: PromptToken): string {
  if (token.id === "field_state") return "Live status of all data points, one per line";
  if (token.id === "valid_keys") return "Comma-separated keys the model may propose";
  if (token.kind === "data_point") return "Current value of this data point";
  if (token.id === "definition_summary") return "Confirmed definition as label: value lines";
  if (token.id === "candidates") return "Role-grouped candidate audiences";
  if (token.id === "basket") return "Confirmed basket for letter generation";
  if (token.id === "tier_plan") return "Silver / Gold / Diamond tier thresholds";
  if (token.id === "materials_links") return "Links from letter materials";
  if (token.id === "materials_snippets") return "Proof snippets from letter materials";
  if (token.id === "approach_style") return "Selected outreach approach style";
  return token.label;
}

/** Admin-only: resolve inserts for Template/Preview (data points use confirmed values). */
export function resolvePreviewToken(
  tokenId: string,
  ctx: { schema: FieldSchema; fields: FieldMap }
): string {
  if (tokenId === "field_state") return fieldStateText(ctx.fields, ctx.schema);
  if (tokenId === "valid_keys") return ctx.schema.fields.map((f) => f.key).join(", ");
  if (tokenId.startsWith("data_point:")) {
    return confirmedDataPointValue(ctx.fields, tokenId.slice("data_point:".length));
  }
  return renderPrompt(`{{${tokenId}}}`, { schema: ctx.schema, fields: ctx.fields });
}

export type PromptPreviewSegment =
  | { type: "text"; text: string }
  | { type: "insert"; text: string; tokenId: string };

export function previewPromptSegments(
  template: string,
  ctx: { schema: FieldSchema; fields: FieldMap }
): PromptPreviewSegment[] {
  const segments: PromptPreviewSegment[] = [];
  let last = 0;
  const re = /\{\{([a-zA-Z0-9_:]+)\}\}/g;
  for (const match of template.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: "text", text: template.slice(last, index) });
    }
    const tokenId = match[1];
    segments.push({
      type: "insert",
      text: resolvePreviewToken(tokenId, ctx),
      tokenId,
    });
    last = index + match[0].length;
  }
  if (last < template.length) {
    segments.push({ type: "text", text: template.slice(last) });
  }
  return segments;
}
export function normalizePrompts(raw: unknown): ChatPrompts | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { define?: unknown; find?: unknown; letter?: unknown; audit?: unknown };
  if (typeof obj.define !== "string" || typeof obj.find !== "string") return null;
  if (!obj.define.trim() || !obj.find.trim()) return null;
  const letter =
    typeof obj.letter === "string" && obj.letter.trim()
      ? obj.letter
      : DEFAULT_LETTER_PROMPT;
  const audit =
    typeof obj.audit === "string" && obj.audit.trim()
      ? obj.audit
      : DEFAULT_AUDIT_PROMPT;
  return { define: obj.define, find: obj.find, letter, audit };
}
