import { NextResponse } from "next/server";
import { askJson } from "@/lib/anthropic";
import {
  DEFAULT_SCHEMA,
  fieldByKey,
  normalizeSchema,
  type FieldSchema,
} from "@/lib/fields";
import {
  AUDIENCE_ROLES,
  isAudienceRole,
  normalizeConfidence,
  type RoleCandidates,
} from "@/lib/match";
import { DEFAULT_FIND_PROMPT, renderPrompt } from "@/lib/prompts";
import { requireUser } from "@/lib/supabase/server";
import type {
  AudienceRole,
  ChatMessage,
  FieldMap,
  Match,
  Proposal,
  TaxRow,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  messages: ChatMessage[];
  fields: FieldMap;
  /** Stage-1 candidates grouped by role (preferred). */
  candidatesByRole?: Partial<Record<AudienceRole, TaxRow[]>>;
  /** Legacy flat candidate list. */
  candidates?: TaxRow[];
  schema?: FieldSchema;
  prompt?: string;
};

type Reply = {
  reply: string;
  matches: Match[];
  proposals: Proposal[];
};

function buildRoleMap(body: Body): {
  byRole: Record<AudienceRole, TaxRow[]>;
  valid: Set<string>;
  roleOf: Map<string, AudienceRole>;
} {
  const byRole = {} as Record<AudienceRole, TaxRow[]>;
  for (const role of AUDIENCE_ROLES) byRole[role] = [];

  const valid = new Set<string>();
  const roleOf = new Map<string, AudienceRole>();

  if (body.candidatesByRole) {
    for (const role of AUDIENCE_ROLES) {
      const list = body.candidatesByRole[role] || [];
      byRole[role] = list;
      for (const row of list) {
        valid.add(row.id);
        if (!roleOf.has(row.id)) roleOf.set(row.id, role);
      }
    }
  } else if (body.candidates?.length) {
    byRole.category = body.candidates;
    for (const row of body.candidates) {
      valid.add(row.id);
      roleOf.set(row.id, "category");
    }
  }

  return { byRole, valid, roleOf };
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Body;
    const { messages, fields } = body;
    const schema = normalizeSchema(body.schema) || DEFAULT_SCHEMA;
    const byKey = fieldByKey(schema);
    const keys = schema.fields.map((f) => f.key);
    const template =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt
        : DEFAULT_FIND_PROMPT;

    const { byRole, valid, roleOf } = buildRoleMap(body);
    if (!valid.size) {
      return NextResponse.json({ error: "No candidates matched. Add more Journey data points." }, { status: 400 });
    }

    const scoredByRole = {} as RoleCandidates;
    for (const role of AUDIENCE_ROLES) {
      scoredByRole[role] = (byRole[role] || []).map((row) => ({ row, score: 0, role }));
    }

    const system = renderPrompt(template, {
      schema,
      fields,
      candidatesByRole: scoredByRole,
    });

    const data = await askJson<Reply>(
      system,
      messages.length
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : [{ role: "user" as const, content: "Select the audience basket for this definition." }],
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
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                role: {
                  type: "string",
                  enum: ["pain", "category", "competitor", "adjacent", "stage"],
                },
              },
              required: ["id", "why", "confidence", "role"],
            },
          },
          proposals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string", enum: keys },
                value: { type: "string" },
                inferred: { type: "boolean" },
              },
              required: ["key", "value"],
            },
          },
        },
        required: ["reply", "matches", "proposals"],
      },
      { maxTokens: 2500 }
    );

    const seen = new Set<string>();
    const matches: Match[] = [];
    for (const m of data.matches || []) {
      if (!m || !valid.has(m.id) || seen.has(m.id)) continue;
      seen.add(m.id);
      const role = isAudienceRole(m.role) ? m.role : roleOf.get(m.id) || "category";
      matches.push({
        id: m.id,
        why: String(m.why || "").trim() || "Selected from Stage-1 candidates.",
        confidence: normalizeConfidence(m.confidence),
        role,
      });
      if (matches.length >= 10) break;
    }

    const proposals = (data.proposals || []).filter(
      (p) => p && byKey[p.key] && String(p.value || "").trim()
    );

    return NextResponse.json({ reply: data.reply || "", matches, proposals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
