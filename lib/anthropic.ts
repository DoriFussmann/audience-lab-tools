import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

let client: Anthropic | null = null;

export function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to the server environment " +
        "(e.g. your Vercel project env vars, scoped to the deployment you are hitting)."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

export function extractJson<T>(text: string): T | null {
  let s = text.trim();
  s = s.replace(/```json/gi, "```").trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```/, "").replace(/```$/, "").trim();
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Ask the model for a structured JSON reply. Uses forced tool use so the model
 * must return a parsed JSON object matching `schema`; falls back to scraping the
 * text response, and finally to wrapping the raw text as `{ reply }` so the
 * caller never fails hard on a non-JSON response.
 */
export async function askJson<T>(
  system: string,
  messages: Anthropic.MessageParam[],
  schema?: Record<string, unknown>,
  opts?: { maxTokens?: number }
): Promise<T> {
  const tool: Anthropic.Tool = {
    name: "respond",
    description: "Return your structured response to the user.",
    input_schema: (schema as Anthropic.Tool.InputSchema) ?? {
      type: "object",
      properties: { reply: { type: "string" } },
    },
  };

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: opts?.maxTokens ?? 1500,
    system,
    messages,
    tools: [tool],
    tool_choice: { type: "tool", name: "respond" },
  });

  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (toolUse) return toolUse.input as T;

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = extractJson<T>(text);
  if (parsed) return parsed;

  return { reply: text } as T;
}
