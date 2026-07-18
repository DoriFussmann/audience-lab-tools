import { NextResponse } from "next/server";
import { askJson } from "@/lib/anthropic";
import { DEFAULT_SCHEMA, normalizeSchema, type FieldSchema } from "@/lib/fields";
import { normalizeLetterResult } from "@/lib/letter";
import {
  DEFAULT_LETTER_PROMPT,
  buildLetterUserPayload,
  renderPrompt,
} from "@/lib/prompts";
import type {
  ApproachStyle,
  FieldMap,
  LetterMaterials,
  SavedAudience,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  fields: FieldMap;
  audience: SavedAudience;
  materials?: LetterMaterials;
  style?: ApproachStyle;
  schema?: FieldSchema;
  prompt?: string;
};

export async function POST(req: Request) {
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

    const style: ApproachStyle =
      body.style === "Consultative" ||
      body.style === "Challenger" ||
      body.style === "Warm"
        ? body.style
        : "Direct";

    const materials: LetterMaterials = {
      links: typeof body.materials?.links === "string" ? body.materials.links : "",
      snippets: typeof body.materials?.snippets === "string" ? body.materials.snippets : "",
    };

    const template =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt
        : DEFAULT_LETTER_PROMPT;

    const system = renderPrompt(template, {
      schema,
      fields,
      audience,
      materials,
      approachStyle: style,
    });

    const userContent = buildLetterUserPayload({
      fields,
      schema,
      audience,
      materials,
      style,
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

    const result = normalizeLetterResult(data, style);
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
