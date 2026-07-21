"use client";

import { useState, type ReactNode } from "react";
import { leadDisplayName, type FuseResult, type FusedLead } from "@/lib/fusion";
import LoadingModal from "./LoadingModal";
import { buildSummary, type FieldSchema } from "@/lib/fields";
import {
  formatBasketForLetter,
  formatTierPlanForLetter,
} from "@/lib/prompts";
import type {
  AuditLeadResult,
  AuditPatterns,
  FieldMap,
  ProjectAudit,
  SavedAudience,
} from "@/lib/types";
import type { PseudoLead } from "@/app/api/audit/route";

// ---------------------------------------------------------------------------
// Pseudonymization — ALLOWLIST semantics
//
// pseudonymizeLead constructs PseudoLead by reading only the explicitly
// named column keys below. The return type is a closed object with a fixed
// set of fields; no column from lead.fields can reach the output unless it
// appears in one of the readField() call-sites here.
//
// Excluded by omission (never referenced below, therefore never present):
//   Names:        FIRST_NAME, LAST_NAME, COMPANY_NAME
//   Identifiers:  UUID
//   Emails:       BUSINESS_EMAIL, PERSONAL_EMAILS, PERSONAL_VERIFIED_EMAILS,
//                 BUSINESS_VERIFIED_EMAILS, SHA256_PERSONAL_EMAIL,
//                 SHA256_BUSINESS_EMAIL
//   Phones:       MOBILE_PHONE, PHONE, PERSONAL_PHONE, HOME_PHONE
//   Addresses:    ADDRESS, STREET_ADDRESS, MAILING_ADDRESS
//   Social/Web:   LINKEDIN_URL
//   Exact dates:  DOB, BIRTH_DATE, BIRTHDATE, DATE_OF_BIRTH
//   All SKIPTRACE_* columns without exception (SKIPTRACE_IP,
//                 SKIPTRACE_ETHNIC_CODE, SKIPTRACE_RELIGION_CODE,
//                 SKIPTRACE_CREDIT_RATING, SKIPTRACE_AGE,
//                 SKIPTRACE_AGE_RANGE, SKIPTRACE_NET_WORTH, etc.)
//
// Adding a new column to the output requires an explicit code change here.
// ---------------------------------------------------------------------------

function readField(fields: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = (fields[k] || "").trim();
    if (v) return v;
  }
  return "—";
}

function toAgeRange(fields: Record<string, string>): string {
  // Non-skiptrace age columns only.
  const age = readField(fields, "AGE");
  if (age !== "—") {
    const n = parseInt(age, 10);
    if (!isNaN(n)) {
      const lo = Math.floor(n / 10) * 10;
      return `${lo}–${lo + 9}`;
    }
    return age;
  }
  return readField(fields, "AGE_RANGE", "AGE_GROUP");
}

function pseudonymizeLead(
  lead: FusedLead,
  label: string,
  audience: SavedAudience
): PseudoLead {
  const f = lead.fields;
  const basketById = new Map(audience.basket.map((b) => [b.row.id, b]));

  const matchedAudiences = lead.audienceIds
    .map((id) => {
      const item = basketById.get(id);
      return item ? { name: item.row.premade, role: item.role as string } : null;
    })
    .filter((x) => x !== null) as { name: string; role: string }[];

  // Each field reads only from the named keys. No SKIPTRACE_* columns appear
  // anywhere below; LINKEDIN_URL, UUID, names, emails, phones, addresses, and
  // exact dates are absent from every readField call.
  return {
    label,
    tier: lead.tier,
    ageRange: toAgeRange(f),
    netWorth: readField(f, "NET_WORTH_RANGE", "NET_WORTH", "NETWORTH_RANGE"),
    incomeRange: readField(f, "INCOME_RANGE", "HOUSEHOLD_INCOME", "ANNUAL_INCOME", "INCOME"),
    jobTitle: readField(f, "JOB_TITLE"),
    seniority: readField(f, "SENIORITY", "JOB_LEVEL", "MANAGEMENT_LEVEL", "LEVEL"),
    industry: readField(f, "INDUSTRY", "COMPANY_INDUSTRY", "SIC_DESCRIPTION", "NAICS_DESCRIPTION"),
    companySize: readField(f, "COMPANY_SIZE", "EMPLOYEE_COUNT", "EMPLOYEES", "EMPLOYEE_RANGE"),
    state: lead.geoState || "—",
    homeowner: readField(f, "HOMEOWNER", "HOME_OWNER", "HOMEOWNER_STATUS", "OWNER_RENTER"),
    matchedAudiences,
  };
}

// ---------------------------------------------------------------------------
// Sampling — 3 random per tier
// ---------------------------------------------------------------------------

const TIER_ORDER: Array<"Silver" | "Gold" | "Diamond"> = ["Silver", "Gold", "Diamond"];
const SAMPLE_SIZE = 3;
const TIER_LABEL_START: Record<string, number> = { Silver: 0, Gold: 3, Diamond: 6 };
const LABEL_CHARS = "ABCDEFGHI";

function sampleTier(leads: FusedLead[], tier: "Silver" | "Gold" | "Diamond") {
  const pool = leads.filter((l) => l.tier === tier);
  if (!pool.length) return [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, SAMPLE_SIZE);
}

function labelForIndex(tierName: "Silver" | "Gold" | "Diamond", idx: number) {
  return "Lead " + LABEL_CHARS[TIER_LABEL_START[tierName] + idx];
}

// ---------------------------------------------------------------------------
// Small shared UI
// ---------------------------------------------------------------------------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={
        "h-4 w-4 shrink-0 text-muted transition-transform duration-200 " +
        (open ? "rotate-180" : "")
      }
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ExpandPanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`expand-panel ${open ? "open" : ""}`}>
      <div className="expand-panel-inner">{children}</div>
    </div>
  );
}

function TierSection({
  header,
  open,
  onToggle,
  children,
  className = "",
}: {
  header: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-line ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-soft"
      >
        <span className="text-ink">{header}</span>
        <Chevron open={open} />
      </button>
      <ExpandPanel open={open}>
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">{children}</div>
      </ExpandPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attribute KPI grid
// ---------------------------------------------------------------------------

function KpiPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="text-[13px] text-ink">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lead card (in-session: real name + label; read-only: label only)
// ---------------------------------------------------------------------------

type LeadCardMode =
  | { kind: "session"; lead: FusedLead; pseudo: PseudoLead; verdict: AuditLeadResult | null }
  | { kind: "readonly"; result: AuditLeadResult };

function LeadCard({ mode }: { mode: LeadCardMode }) {
  const [open, setOpen] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(false);

  const label = mode.kind === "session" ? mode.pseudo.label : mode.result.label;
  const tier = mode.kind === "session" ? mode.pseudo.tier : mode.result.tier;
  const verdict = mode.kind === "session" ? mode.verdict : mode.result;

  // Real name/title — in-session only, never persisted
  const realName =
    mode.kind === "session" ? leadDisplayName(mode.lead.fields) : null;
  const realTitle =
    mode.kind === "session"
      ? (mode.lead.fields.JOB_TITLE || "").trim() || null
      : null;

  const pseudo = mode.kind === "session" ? mode.pseudo : null;
  const audienceCount =
    mode.kind === "session" ? mode.lead.audienceIds.length : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-white">
      {/* Card header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-soft"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          {realName ? (
            <span className="truncate text-ink">{realName}</span>
          ) : (
            <span className="truncate text-ink">{label}</span>
          )}
          {realTitle && (
            <span className="truncate text-muted text-[12px]">{realTitle}</span>
          )}
          {realName && (
            <span className="text-[11px] text-muted">{label}</span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-muted text-[12px]">{tier}</span>
          <Chevron open={open} />
        </span>
      </button>

      {/* Collapsed KPI summary row */}
      {pseudo && !open && (
        <div className="grid grid-cols-3 gap-x-3 gap-y-2 border-t border-line px-3 py-2">
          <KpiPill label="Age" value={pseudo.ageRange} />
          <KpiPill label="Net worth" value={pseudo.netWorth} />
          <KpiPill label="Income" value={pseudo.incomeRange} />
          <KpiPill label="Industry" value={pseudo.industry} />
          <KpiPill label="State" value={pseudo.state} />
          <KpiPill label="Audiences" value={String(audienceCount ?? "—")} />
        </div>
      )}

      {/* Expanded full slice */}
      <ExpandPanel open={open}>
        {pseudo ? (
          <div className="flex flex-col gap-3 border-t border-line px-3 py-2.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <KpiPill label="Age range" value={pseudo.ageRange} />
              <KpiPill label="Net worth" value={pseudo.netWorth} />
              <KpiPill label="Income range" value={pseudo.incomeRange} />
              <KpiPill label="Job title" value={pseudo.jobTitle} />
              <KpiPill label="Seniority" value={pseudo.seniority} />
              <KpiPill label="Industry" value={pseudo.industry} />
              <KpiPill label="Company size" value={pseudo.companySize} />
              <KpiPill label="State" value={pseudo.state} />
              <KpiPill label="Homeowner" value={pseudo.homeowner} />
            </div>
            {pseudo.matchedAudiences.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-line pt-2">
                <span className="text-[11px] text-muted">Matched audiences</span>
                {pseudo.matchedAudiences.map((a, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-ink">{a.name}</span>
                    <span className="text-[11px] text-muted">{a.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-line px-3 py-2.5 text-muted text-[12px]">
            Sample details unavailable — re-run fusion to audit again.
          </div>
        )}
      </ExpandPanel>

      {/* Verdict panel — only after audit run */}
      {verdict && (
        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => setVerdictOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 hover:bg-soft"
          >
            <span className="text-ink">{verdict.fitPercent}% fit</span>
            <Chevron open={verdictOpen} />
          </button>
          <ExpandPanel open={verdictOpen}>
            <div className="flex flex-col gap-2.5 border-t border-line px-3 py-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted">Why fits</span>
                <span className="text-[13px] text-ink">{verdict.whyFits}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted">Why might not</span>
                <span className="text-[13px] text-ink">{verdict.whyNot}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted">Recommendation</span>
                <span className="text-[13px] text-ink">{verdict.recommendation}</span>
              </div>
            </div>
          </ExpandPanel>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AudienceAudit({
  fuseResult,
  audience,
  fields,
  schema,
  prompt,
  persistedAudit,
  onAuditResult,
}: {
  fuseResult: FuseResult | null;
  audience: SavedAudience | null;
  fields: FieldMap;
  schema: FieldSchema;
  prompt: string;
  persistedAudit: ProjectAudit | null;
  onAuditResult: (r: ProjectAudit) => void;
}) {
  type Tier = "Silver" | "Gold" | "Diamond";
  type SampleMap = Record<Tier, FusedLead[]>;

  const [sample, setSample] = useState<SampleMap>(() => drawSample(fuseResult));
  const [verdicts, setVerdicts] = useState<AuditLeadResult[] | null>(null);
  const [patterns, setPatterns] = useState<AuditPatterns | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTiers, setOpenTiers] = useState({ Silver: true, Gold: true, Diamond: true });
  const [patternsOpen, setPatternsOpen] = useState(false);

  function drawSample(result: FuseResult | null): SampleMap {
    if (!result) return { Silver: [], Gold: [], Diamond: [] };
    return {
      Silver: sampleTier(result.leads, "Silver"),
      Gold: sampleTier(result.leads, "Gold"),
      Diamond: sampleTier(result.leads, "Diamond"),
    };
  }

  function reshuffle() {
    setSample(drawSample(fuseResult));
    setVerdicts(null);
    setPatterns(null);
    setError(null);
  }

  async function runAudit() {
    if (!fuseResult || !audience) return;
    setLoading(true);
    setError(null);

    try {
      const definitionSummary = buildSummary(fields, schema);
      const basketSummary = formatBasketForLetter(audience);
      const tierRules = formatTierPlanForLetter(audience);

      const leads: PseudoLead[] = TIER_ORDER.flatMap((tier) =>
        sample[tier].map((lead, idx) =>
          pseudonymizeLead(lead, labelForIndex(tier, idx), audience)
        )
      );

      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definitionSummary, basketSummary, tierRules, leads, prompt }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { leads: AuditLeadResult[]; patterns: AuditPatterns };
      setVerdicts(data.leads);
      setPatterns(data.patterns);

      const projectAudit: ProjectAudit = {
        leads: data.leads,
        patterns: data.patterns,
        runAt: Date.now(),
      };
      onAuditResult(projectAudit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }

  function verdictFor(label: string): AuditLeadResult | null {
    if (!verdicts) return null;
    return verdicts.find((v) => v.label === label) ?? null;
  }

  // ── Gate: no in-session fusion and no persisted audit ──
  if (!fuseResult && !persistedAudit) {
    return (
      <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl">
          <span className="text-muted">Run Audience Fusion first — audit needs the fused leads in memory.</span>
        </div>
      </div>
    );
  }

  // ── Read-only mode: no in-session fusion, but have persisted verdicts ──
  if (!fuseResult && persistedAudit) {
    const runDate = new Date(persistedAudit.runAt).toLocaleDateString();
    return (
      <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <div className="flex items-baseline justify-between pb-1">
            <span className="text-[15px] text-ink">Audience Audit</span>
            <span className="text-muted">Run {runDate} · read-only</span>
          </div>
          <span className="text-[12px] text-muted">
            Sample details unavailable — re-run Audience Fusion to audit again.
          </span>
          <p className="text-[11px] text-muted">
            A 9-lead sample is directional, not statistical — reshuffle a few times before acting on patterns.
          </p>

          {TIER_ORDER.map((tier) => {
            const tierLeads = persistedAudit.leads.filter((l) => l.tier === tier);
            if (!tierLeads.length) return null;
            return (
              <TierSection
                key={tier}
                header={tier}
                open={openTiers[tier]}
                onToggle={() => setOpenTiers((p) => ({ ...p, [tier]: !p[tier] }))}
                className={tier === "Gold" ? "ml-5" : tier === "Diamond" ? "ml-10" : ""}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {tierLeads.map((r) => (
                    <LeadCard key={r.label} mode={{ kind: "readonly", result: r }} />
                  ))}
                </div>
              </TierSection>
            );
          })}

          {/* Patterns */}
          <div className="border border-line">
            <button
              type="button"
              onClick={() => setPatternsOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-soft"
            >
              <span className="text-ink">Patterns</span>
              <Chevron open={patternsOpen} />
            </button>
            <ExpandPanel open={patternsOpen}>
              <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
                {[
                  { label: "High-fit sources", value: persistedAudit.patterns.highFitSources },
                  { label: "Low-fit sources", value: persistedAudit.patterns.lowFitSources },
                  { label: "Basket advice", value: persistedAudit.patterns.basketAdvice },
                  { label: "Overall", value: persistedAudit.patterns.overall },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted">{label}</span>
                    <span className="text-[13px] text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </ExpandPanel>
          </div>
        </div>
      </div>
    );
  }

  // ── Active mode: in-session fusion available ──
  const emptiedTiers = TIER_ORDER.filter((t) => sample[t].length === 0);
  const hasAnySample = TIER_ORDER.some((t) => sample[t].length > 0);

  return (
    <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
      {loading && <LoadingModal message="Running audit…" />}
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {/* Header */}
        <div className="flex items-baseline justify-between pb-1">
          <span className="text-[15px] text-ink">Audience Audit</span>
          <div className="flex items-center gap-3">
            {(verdicts || patterns) && (
              <span className="text-muted text-[12px]">
                {new Date().toLocaleDateString()}
              </span>
            )}
            <button
              type="button"
              onClick={reshuffle}
              disabled={loading}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink disabled:opacity-40"
            >
              Reshuffle
            </button>
            <button
              type="button"
              onClick={runAudit}
              disabled={loading || !hasAnySample}
              className="rounded-lg border border-line px-3 py-1.5 text-ink hover:bg-soft disabled:opacity-40"
            >
              {loading ? "Running…" : "Run audit"}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-muted">
          A 9-lead sample is directional, not statistical — reshuffle a few times before acting on patterns.
        </p>

        {error && <span className="text-muted">{error}</span>}

        {emptiedTiers.length > 0 && (
          <span className="text-muted text-[12px]">
            {emptiedTiers.join(", ")} {emptiedTiers.length === 1 ? "has" : "have"} no leads — skipped.
          </span>
        )}

        {/* Tier sections — nested funnel geometry */}
        <TierSection
          header={`Silver · ${sample.Silver.length} sampled`}
          open={openTiers.Silver}
          onToggle={() => setOpenTiers((p) => ({ ...p, Silver: !p.Silver }))}
        >
          {sample.Silver.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {sample.Silver.map((lead, idx) => {
                const lbl = labelForIndex("Silver", idx);
                const pseudo = pseudonymizeLead(lead, lbl, audience!);
                return (
                  <LeadCard
                    key={lbl}
                    mode={{ kind: "session", lead, pseudo, verdict: verdictFor(lbl) }}
                  />
                );
              })}
            </div>
          ) : (
            <span className="text-muted">No Silver leads in fused result.</span>
          )}
        </TierSection>

        <div className="ml-5 flex flex-col gap-2">
          <TierSection
            header={`Gold · ${sample.Gold.length} sampled`}
            open={openTiers.Gold}
            onToggle={() => setOpenTiers((p) => ({ ...p, Gold: !p.Gold }))}
          >
            {sample.Gold.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {sample.Gold.map((lead, idx) => {
                  const lbl = labelForIndex("Gold", idx);
                  const pseudo = pseudonymizeLead(lead, lbl, audience!);
                  return (
                    <LeadCard
                      key={lbl}
                      mode={{ kind: "session", lead, pseudo, verdict: verdictFor(lbl) }}
                    />
                  );
                })}
              </div>
            ) : (
              <span className="text-muted">No Gold leads in fused result.</span>
            )}
          </TierSection>

          <div className="ml-5">
            <TierSection
              header={`Diamond · ${sample.Diamond.length} sampled`}
              open={openTiers.Diamond}
              onToggle={() => setOpenTiers((p) => ({ ...p, Diamond: !p.Diamond }))}
            >
              {sample.Diamond.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {sample.Diamond.map((lead, idx) => {
                    const lbl = labelForIndex("Diamond", idx);
                    const pseudo = pseudonymizeLead(lead, lbl, audience!);
                    return (
                      <LeadCard
                        key={lbl}
                        mode={{ kind: "session", lead, pseudo, verdict: verdictFor(lbl) }}
                      />
                    );
                  })}
                </div>
              ) : (
                <span className="text-muted">No Diamond leads in fused result.</span>
              )}
            </TierSection>
          </div>
        </div>

        {/* Patterns panel — only after audit */}
        {patterns && (
          <div className="border border-line">
            <button
              type="button"
              onClick={() => setPatternsOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-soft"
            >
              <span className="text-ink">Patterns</span>
              <Chevron open={patternsOpen} />
            </button>
            <ExpandPanel open={patternsOpen}>
              <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
                {[
                  { label: "High-fit sources", value: patterns.highFitSources },
                  { label: "Low-fit sources", value: patterns.lowFitSources },
                  { label: "Basket advice", value: patterns.basketAdvice },
                  { label: "Overall", value: patterns.overall },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted">{label}</span>
                    <span className="text-[13px] text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </ExpandPanel>
          </div>
        )}
      </div>
    </div>
  );
}
