import { NextResponse } from "next/server";
import { askJson } from "@/lib/anthropic";
import { DEFAULT_SCHEMA, normalizeSchema, type FieldSchema } from "@/lib/fields";
import { normalizeLetterResult, normalizeMaterials } from "@/lib/letter";
import {
  DEFAULT_LETTER_PROMPT,
  buildLetterUserPayload,
  renderPrompt,
} from "@/lib/prompts";
import { requireUser } from "@/lib/supabase/server";
import type {
  FieldMap,
  LetterMaterials,
  LetterResult,
  SavedAudience,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  fields: FieldMap;
  audience: SavedAudience;
  materials?: LetterMaterials;
  schema?: FieldSchema;
  prompt?: string;
  /** One-shot revision notes for this generate call only. */
  feedback?: string;
  /** Current draft to revise when feedback is provided. */
  previous?: LetterResult | null;
};

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Body;
    const schema = normalizeSchema(body.schema) || DEFAULT_SCHEMA;
    const fields = body.fields;
    const audience = body.audience;
    if (!audience?.basket?.length || !audience.tierPlan) {
      return NextResponse.json(
        { error: "Confirmed Audience Find basket required." },
        { status: 400 }
      );
    }

    const materials = normalizeMaterials(body.materials);

    const template =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt
        : DEFAULT_LETTER_PROMPT;

    const system = renderPrompt(template, {
      schema,
      fields,
      audience,
      materials,
    });

    const userContent = buildLetterUserPayload({
      fields,
      schema,
      audience,
      materials,
      feedback:
        typeof body.feedback === "string" && body.feedback.trim()
          ? body.feedback.trim()
          : undefined,
      previous: body.previous && typeof body.previous === "object" ? body.previous : null,
    });

    const data = await askJson<{
      tiers?: unknown;
      note?: unknown;
    }>(
      system,
      [{ role: "user", content: userContent }],
      {
        type: "object",
        properties: {
          tiers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tier: { type: "string", enum: ["Silver", "Gold", "Diamond"] },
                emails: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      day: { type: "number" },
                      subject: { type: "string" },
                      body: { type: "string" },
                    },
                    required: ["day", "subject", "body"],
                  },
                },
              },
              required: ["tier", "emails"],
            },
          },
          note: { type: "string" },
        },
        required: ["tiers", "note"],
      },
      { maxTokens: 8000 }
    );

    const result = normalizeLetterResult(data);
    if (!result) {
      return NextResponse.json(
        { error: "Letter generation returned incomplete sequences." },
        { status: 502 }
      );
    }

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
