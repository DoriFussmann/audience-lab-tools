import { NextResponse } from "next/server";
import { askJson } from "@/lib/anthropic";
import { FIELDS, FIELD_BY_KEY } from "@/lib/fields";
import type { ChatMessage, FieldMap, Proposal } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { messages: ChatMessage[]; fields: FieldMap };
type Reply = { reply: string; proposals: Proposal[] };

function fieldStateText(fields: FieldMap) {
  return FIELDS.map((f) => {
    const s = fields[f.key];
    const path = `${f.category}${f.group ? " / " + f.group : ""} / ${f.label} [${f.key}]`;
    if (s.status === "confirmed") return `${path} = CONFIRMED: ${s.value}`;
    if (s.status === "skipped") return `${path} = SKIPPED`;
    return `${path} = OUTSTANDING${f.optional ? " (optional)" : ""}`;
  }).join("\n");
}

export async function POST(req: Request) {
  try {
    const { messages, fields } = (await req.json()) as Body;

    const system = `You are an intake assistant collecting target-market data for an audience definition.

"The Lead" is a persona / ideal customer profile, not one named individual. Ask about the archetype: the kind of company and the kind of person who buys this. Job title, department, authority, industry, size, tech stack, pain points and triggers describe a segment, not a specific human.

Data points to collect, with current state:
${fieldStateText(fields)}

Rules:
- Work through OUTSTANDING data points in the order listed. Ask about one to three closely related data points per turn. Keep questions short and plain.
- The two name data points are optional and exist only to sharpen the personalized hook. Ask for them once, at most, as a representative or example account. If the user has no specific one in mind, propose nothing for them and move on immediately. Never block on a name.
- Read the user's latest message and extract every data point value you can, as proposals.
- Extrapolate when the user cannot answer or gives partial information, using what is already confirmed plus general knowledge. Mark extrapolated values with "inferred": true. If a data point cannot be reasonably extrapolated, do not propose it; move on and ask about the next one.
- Never propose a value for a data point that is already CONFIRMED unless the user explicitly changes it.
- Values are short strings: one line, at most about 25 words. No markdown, no bullet points.
- Do not congratulate, do not add commentary, do not explain your process. Be direct.
- If all data points are settled, your reply should just say the definition is complete.

Respond by calling the "respond" tool. "reply" is your next message to the user. "proposals" holds any data-point values you extracted or inferred this turn.
Valid field keys: ${FIELDS.map((f) => f.key).join(", ")}`;

    const data = await askJson<Reply>(
      system,
      messages.map((m) => ({ role: m.role, content: m.content })),
      {
        type: "object",
        properties: {
          reply: { type: "string" },
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
        required: ["reply", "proposals"],
      }
    );

    const proposals = (data.proposals || []).filter(
      (p) => p && FIELD_BY_KEY[p.key] && String(p.value || "").trim()
    );

    return NextResponse.json({ reply: data.reply || "", proposals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
