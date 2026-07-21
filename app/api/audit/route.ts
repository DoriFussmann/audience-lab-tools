import { NextResponse } from "next/server";
import { askJson } from "@/lib/anthropic";
import { DEFAULT_AUDIT_PROMPT } from "@/lib/prompts";
import { requireUser } from "@/lib/supabase/server";
import type { AuditLeadResult, AuditPatterns } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** One pseudonymized lead in the request — no names, emails, UUIDs, phones. */
export type PseudoLead = {
  label: string;
  tier: "Silver" | "Gold" | "Diamond";
  ageRange: string;
  netWorth: string;
  incomeRange: string;
  jobTitle: string;
  seniority: string;
  industry: string;
  companySize: string;
  state: string;
  homeowner: string;
  matchedAudiences: { name: string; role: string }[];
};

type Body = {
  definitionSummary: string;
  basketSummary: string;
  tierRules: string;
  leads: PseudoLead[];
  prompt?: string;
};

type AuditResponse = {
  leads: AuditLeadResult[];
  patterns: AuditPatterns;
};

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Body;
    const { definitionSummary, basketSummary, tierRules, leads } = body;

    if (!leads?.length) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    const systemPrompt =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt
        : DEFAULT_AUDIT_PROMPT;

    const leadLines = leads
      .map((l) => {
        const audiences = l.matchedAudiences
          .map((a) => `${a.name} (${a.role})`)
          .join(", ");
        return [
          `${l.label} [${l.tier}]`,
          `  Age range: ${l.ageRange}`,
          `  Net worth: ${l.netWorth}`,
          `  Income range: ${l.incomeRange}`,
          `  Job title: ${l.jobTitle}`,
          `  Seniority: ${l.seniority}`,
          `  Industry: ${l.industry}`,
          `  Company size: ${l.companySize}`,
          `  State: ${l.state}`,
          `  Homeowner: ${l.homeowner}`,
          `  Matched audiences: ${audiences || "none"}`,
        ].join("\n");
      })
      .join("\n\n");

    const userMessage = [
      "AUDIENCE DEFINITION:",
      definitionSummary,
      "",
      "BASKET:",
      basketSummary,
      "",
      "TIER RULES:",
      tierRules,
      "",
      "LEADS TO AUDIT:",
      leadLines,
    ].join("\n");

    const schema = {
      type: "object",
      properties: {
        leads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              tier: { type: "string", enum: ["Silver", "Gold", "Diamond"] },
              fitPercent: { type: "number" },
              whyFits: { type: "string" },
              whyNot: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["label", "tier", "fitPercent", "whyFits", "whyNot", "recommendation"],
          },
        },
        patterns: {
          type: "object",
          properties: {
            highFitSources: { type: "string" },
            lowFitSources: { type: "string" },
            basketAdvice: { type: "string" },
            overall: { type: "string" },
          },
          required: ["highFitSources", "lowFitSources", "basketAdvice", "overall"],
        },
      },
      required: ["leads", "patterns"],
    };

    const data = await askJson<AuditResponse>(
      systemPrompt,
      [{ role: "user", content: userMessage }],
      schema,
      { maxTokens: 4000 }
    );

    const validTiers = new Set(["Silver", "Gold", "Diamond"]);
    const normalizedLeads: AuditLeadResult[] = (data.leads || []).map((l) => ({
      label: String(l.label || "").trim(),
      tier: validTiers.has(l.tier) ? l.tier : "Silver",
      fitPercent: Math.max(0, Math.min(100, Math.round(Number(l.fitPercent) || 0))),
      whyFits: String(l.whyFits || "").trim(),
      whyNot: String(l.whyNot || "").trim(),
      recommendation: String(l.recommendation || "").trim(),
    }));

    const p = data.patterns || ({} as AuditPatterns);
    const normalizedPatterns: AuditPatterns = {
      highFitSources: String(p.highFitSources || "").trim(),
      lowFitSources: String(p.lowFitSources || "").trim(),
      basketAdvice: String(p.basketAdvice || "").trim(),
      overall: String(p.overall || "").trim(),
    };

    return NextResponse.json({ leads: normalizedLeads, patterns: normalizedPatterns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
