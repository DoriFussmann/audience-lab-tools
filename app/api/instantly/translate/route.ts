import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import {
  DEFAULT_SCHEMA,
  normalizeSchema,
  type FieldSchema,
} from "@/lib/fields";
import { parseJsonLoose, sanitizeSearchFilters } from "@/lib/instantly";
import {
  DEFAULT_INSTANTLY_FIND_PROMPT,
  renderPrompt,
} from "@/lib/prompts";
import { requireUser } from "@/lib/supabase/server";
import type { FieldMap } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  fields: FieldMap;
  schema?: FieldSchema;
  prompt?: string;
};

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Body;
    const { fields } = body;
    if (!fields || typeof fields !== "object") {
      return NextResponse.json({ error: "fields required" }, { status: 400 });
    }

    const schema = normalizeSchema(body.schema) || DEFAULT_SCHEMA;
    const template =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt
        : DEFAULT_INSTANTLY_FIND_PROMPT;

    const system = renderPrompt(template, { schema, fields });

    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [
        {
          role: "user",
          content:
            "Translate the target-market definition into Instantly SuperSearch search_filters JSON. Output only the JSON object.",
        },
      ],
    });

    const rawText = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    let parsed: unknown;
    try {
      parsed = parseJsonLoose(rawText);
    } catch {
      return NextResponse.json(
        { error: "Model did not return valid JSON", raw: rawText },
        { status: 422 }
      );
    }

    const search_filters = sanitizeSearchFilters(parsed);
    return NextResponse.json({ search_filters });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
