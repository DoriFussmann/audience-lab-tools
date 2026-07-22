import { NextResponse } from "next/server";
import {
  sanitizeSearchFilters,
  toInstantlyWireFilters,
} from "@/lib/instantly";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const COUNT_URL =
  "https://api.instantly.ai/api/v2/supersearch-enrichment/count-leads-from-supersearch";
const PREVIEW_URL =
  "https://api.instantly.ai/api/v2/supersearch-enrichment/preview-leads-from-supersearch";

type Body = {
  mode: "count" | "preview";
  search_filters: unknown;
};

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.INSTANTLY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "INSTANTLY_API_KEY is not set on the server" },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as Body;
    if (body.mode !== "count" && body.mode !== "preview") {
      return NextResponse.json(
        { error: 'mode must be "count" or "preview"' },
        { status: 400 }
      );
    }

    const filters = sanitizeSearchFilters(body.search_filters);
    const search_filters = toInstantlyWireFilters(filters);
    const url = body.mode === "count" ? COUNT_URL : PREVIEW_URL;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ search_filters }),
    });

    const text = await upstream.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      const status = upstream.status;
      let error = "Instantly request failed";
      if (status === 401) error = "Instantly API unauthorized (check INSTANTLY_API_KEY)";
      else if (status === 402) error = "Instantly plan or credits issue";
      else if (status === 429) error = "Instantly rate limit exceeded";
      else if (data && typeof data === "object") {
        const obj = data as { message?: unknown; error?: unknown };
        // Prefer Instantly's validation detail over the generic "Bad Request" label.
        if (typeof obj.message === "string" && obj.message.trim()) {
          error = obj.message.trim();
        } else if (typeof obj.error === "string" && obj.error.trim()) {
          error = obj.error.trim();
        }
      }

      return NextResponse.json({ error, status }, { status });
    }

    return NextResponse.json(data ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
