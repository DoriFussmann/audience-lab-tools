import { NextResponse } from "next/server";
import { askJson } from "@/lib/anthropic";
import { FIELDS, FIELD_BY_KEY, buildSummary } from "@/lib/fields";
import type { ChatMessage, FieldMap, Match, Proposal, TaxRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  messages: ChatMessage[];
  fields: FieldMap;
  candidates: TaxRow[];
};

type Reply = {
  reply: string;
  matches: Match[];
  proposals: Proposal[];
};

function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export async function POST(req: Request) {
  try {
    const { messages, fields, candidates } = (await req.json()) as Body;

    const candidateText = candidates
      .map(
        (c, i) =>
          `${i + 1}. id=${c.id} | ${c.premade} | ${c.category} > ${c.subcategory} | ${c.type}\n   desc: ${trim(
            c.description,
            220
          )}\n   keywords: ${trim(c.keywords, 220)}`
      )
      .join("\n");

    const system = `You select the single best pre-made audience from a taxonomy for a given target-market definition. The definition describes a persona / ideal customer profile, not one named individual. Any company or person name in it is a representative example only — never let it narrow the match.

TARGET MARKET DEFINITION:
${buildSummary(fields)}

CANDIDATE AUDIENCES (pre-filtered by keyword retrieval, ranked by lexical score):
${candidateText}

Rules:
- Rank the candidates by how well they capture the people who would buy this offer. Weigh the tech stack, industry, pain points and job context most heavily. Lexical rank is a hint, not an answer.
- Return the top 3 matches, best first, with a one-sentence reason each and a confidence from 0 to 100.
- Only use ids from the candidate list. Never invent an id.
- If the definition is too thin to choose confidently, still return your best 3, and use "reply" to ask the single most useful clarifying question.
- If the user's latest message contains information that belongs in the target-market definition, return it in "proposals". Valid field keys: ${FIELDS.map(
      (f) => f.key
    ).join(", ")}. Values are short one-line strings.
- Be direct. No commentary, no preamble, no markdown.

Respond by calling the "respond" tool. "reply" is a short message to the user, "matches" holds the top 3 audiences (best first), and "proposals" holds any definition values from the user's latest message.`;

    const data = await askJson<Reply>(
      system,
      messages.length
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : [{ role: "user" as const, content: "Find the best audience for this definition." }],
      {
        type: "object",
        properties: {
          reply: { type: "string" },
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                why: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["id", "why", "confidence"],
            },
          },
          proposals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string", enum: FIELDS.map((f) => f.key) },
                value: { type: "string" },
                inferred: { type: "boolean" },
              },
              required: ["key", "value"],
            },
          },
        },
        required: ["reply", "matches", "proposals"],
      }
    );

    const valid = new Set(candidates.map((c) => c.id));
    const matches = (data.matches || []).filter((m) => m && valid.has(m.id)).slice(0, 3);
    const proposals = (data.proposals || []).filter(
      (p) => p && FIELD_BY_KEY[p.key] && String(p.value || "").trim()
    );

    return NextResponse.json({ reply: data.reply || "", matches, proposals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
