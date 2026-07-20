import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { askJson } from "@/lib/anthropic";
import {
  DEFAULT_SCHEMA,
  fieldByKey,
  normalizeSchema,
  type FieldSchema,
} from "@/lib/fields";
import { DEFAULT_DEFINE_PROMPT, renderPrompt } from "@/lib/prompts";
import { requireUser } from "@/lib/supabase/server";
import type { ChatMessage, FieldMap, Proposal } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type DocumentPayload =
  | { kind: "text"; name: string; text: string }
  | { kind: "pdf"; name: string; mediaType: "application/pdf"; data: string }
  | {
      kind: "image";
      name: string;
      mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
      data: string;
    };

type Body = {
  messages: ChatMessage[];
  fields: FieldMap;
  schema?: FieldSchema;
  prompt?: string;
  document?: DocumentPayload;
};

type Reply = { reply: string; proposals: Proposal[] };

/** Content blocks — includes PDF `document` which older SDK typings omit. */
type AnyContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
        data: string;
      };
    }
  | {
      type: "document";
      source: {
        type: "base64";
        media_type: "application/pdf";
        data: string;
      };
    };

const DOCUMENT_RULE = `
Document upload turn:
- The user uploaded a brief or notes instead of typing. Treat the attached document as their description of the offer and audience.
- Extract every outstanding data point you can from the document as proposals in this turn. Be thorough — prefer filling many fields from one document over asking follow-up questions first.
- Mark uncertain or extrapolated values with "inferred": true.
- In "reply", briefly say what you pulled out and ask only about what is still clearly missing. Do not restate every proposed value.`;

function documentBlocks(doc: DocumentPayload): AnyContentBlock[] {
  const intro: AnyContentBlock = {
    type: "text",
    text: `I uploaded a document (${doc.name}) with my audience / offer notes. Please scan it and fill in every data point you can.`,
  };

  if (doc.kind === "text") {
    return [
      intro,
      {
        type: "text",
        text: `--- Document: ${doc.name} ---\n${doc.text}\n--- End document ---`,
      },
    ];
  }

  if (doc.kind === "pdf") {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: doc.mediaType,
          data: doc.data,
        },
      },
      intro,
    ];
  }

  return [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: doc.mediaType,
        data: doc.data,
      },
    },
    intro,
  ];
}

function toHistory(
  messages: ChatMessage[],
  document?: DocumentPayload
): Anthropic.MessageParam[] {
  if (!messages.length) {
    return [{ role: "user", content: "Begin the intake." }];
  }

  if (!document) {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  const prior = messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Cast: SDK 0.27 typings lack `document` blocks; the Messages API accepts them.
  return [
    ...prior,
    {
      role: "user" as const,
      content: documentBlocks(document) as Anthropic.MessageParam["content"],
    },
  ];
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Body;
    const { fields } = body;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const schema = normalizeSchema(body.schema) || DEFAULT_SCHEMA;
    const byKey = fieldByKey(schema);
    const keys = schema.fields.map((f) => f.key);
    const template =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt
        : DEFAULT_DEFINE_PROMPT;
    let system = renderPrompt(template, { schema, fields });
    if (body.document) system = `${system}\n${DOCUMENT_RULE}`;

    const history = toHistory(messages, body.document);
    const maxTokens = body.document ? 2500 : 1500;

    const data = await askJson<Reply>(
      system,
      history,
      {
        type: "object",
        properties: {
          reply: { type: "string" },
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
        required: ["reply", "proposals"],
      },
      { maxTokens }
    );

    const proposals = (data.proposals || []).filter(
      (p) => p && byKey[p.key] && String(p.value || "").trim()
    );

    return NextResponse.json({ reply: data.reply || "", proposals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
