"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import LoadingModal from "./LoadingModal";
import StageReset from "./StageReset";
import { allDone, type FieldSchema } from "@/lib/fields";
import {
  INSTANTLY_DEPARTMENTS,
  INSTANTLY_EMPLOYEE_COUNTS,
  INSTANTLY_FUNDING_TYPES,
  INSTANTLY_INDUSTRIES,
  INSTANTLY_LEVELS,
  INSTANTLY_NEWS,
  INSTANTLY_REVENUES,
  omitEmptyFilters,
  type InstantlyFindState,
  type InstantlyIncludeExclude,
  type InstantlyPreviewLead,
  type InstantlySearchFilters,
} from "@/lib/instantly";
import type { FieldMap } from "@/lib/types";

type Phase = "idle" | "translating" | "review" | "previewing" | "results";

const PREVIEW_COLUMNS: { key: string; label: string }[] = [
  { key: "fullName", label: "Name" },
  { key: "jobTitle", label: "Title" },
  { key: "companyName", label: "Company" },
  { key: "location", label: "Location" },
  { key: "linkedIn", label: "LinkedIn" },
];

function leadCell(lead: InstantlyPreviewLead, key: string): string {
  if (key === "fullName") {
    const full = typeof lead.fullName === "string" ? lead.fullName.trim() : "";
    if (full) return full;
    const parts = [lead.firstName, lead.lastName]
      .filter((v): v is string => typeof v === "string" && !!v.trim())
      .map((v) => v.trim());
    return parts.join(" ") || "—";
  }
  const v = lead[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return "—";
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const set = new Set(values);
    for (const p of parts) set.add(p);
    onChange([...set]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
          >
            {v} ×
          </button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          }
        }}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        placeholder={placeholder || "Add and press Enter"}
        className="rounded-lg border border-line px-3 py-2 text-ink placeholder:text-muted"
      />
    </div>
  );
}

function ChipSelect({
  options,
  selected,
  onChange,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selected);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = set.has(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              if (on) onChange(selected.filter((x) => x !== opt));
              else onChange([...selected, opt]);
            }}
            className={`rounded border px-2 py-1 ${
              on
                ? "border-ink text-ink"
                : "border-line text-muted hover:text-ink"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function IncludeExcludeEditor({
  value,
  onChange,
  includeLabel = "Include",
  excludeLabel = "Exclude",
}: {
  value: InstantlyIncludeExclude | undefined;
  onChange: (next: InstantlyIncludeExclude | undefined) => void;
  includeLabel?: string;
  excludeLabel?: string;
}) {
  const include = value?.include || [];
  const exclude = value?.exclude || [];

  function setInclude(next: string[]) {
    const out: InstantlyIncludeExclude = {};
    if (next.length) out.include = next;
    if (exclude.length) out.exclude = exclude;
    onChange(out.include || out.exclude ? out : undefined);
  }

  function setExclude(next: string[]) {
    const out: InstantlyIncludeExclude = {};
    if (include.length) out.include = include;
    if (next.length) out.exclude = next;
    onChange(out.include || out.exclude ? out : undefined);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <div className="text-muted">{includeLabel}</div>
        <TagInput values={include} onChange={setInclude} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-muted">{excludeLabel}</div>
        <TagInput values={exclude} onChange={setExclude} />
      </div>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <div className="text-ink">{title}</div>
      {children}
    </div>
  );
}

export default function InstantlyFind({
  fields,
  schema,
  prompt,
  instantly,
  setInstantly,
  resetBlockedMessage,
  onResetStage,
}: {
  fields: FieldMap;
  schema: FieldSchema;
  prompt: string;
  instantly: InstantlyFindState;
  setInstantly: (next: InstantlyFindState) => void;
  resetBlockedMessage?: string | null;
  onResetStage?: () => void;
}) {
  const defineReady = allDone(fields, schema);
  const [phase, setPhase] = useState<Phase>(() =>
    instantly.preview?.length
      ? "results"
      : instantly.filters
        ? "review"
        : "idle"
  );
  const [error, setError] = useState("");
  const [countLoading, setCountLoading] = useState(false);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countReq = useRef(0);
  const instantlyRef = useRef(instantly);
  instantlyRef.current = instantly;

  const filters = instantly.filters;
  const filtersKey = JSON.stringify(filters || null);

  // Drop invalid enum values left over from older translates (e.g. free-text industries).
  useEffect(() => {
    if (!instantly.filters) return;
    const cleaned = omitEmptyFilters(instantly.filters);
    const next = Object.keys(cleaned).length ? cleaned : null;
    if (JSON.stringify(next) === JSON.stringify(instantly.filters)) return;
    setInstantly({ ...instantlyRef.current, filters: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot cleanup on mount / filter hydrate
  }, [filtersKey]);

  useEffect(() => {
    if (!filters) return;
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(() => {
      void refreshCount(filters);
    }, 600);
    return () => {
      if (countTimer.current) clearTimeout(countTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on serialized filters
  }, [filtersKey]);

  function patchFilters(patch: InstantlySearchFilters) {
    const current = instantlyRef.current.filters || {};
    const next = omitEmptyFilters({ ...current, ...patch });
    const cleaned = Object.keys(next).length ? next : null;
    setInstantly({
      ...instantlyRef.current,
      filters: cleaned,
      // Clear stale preview when filters change.
      preview: null,
      redactedCount: null,
    });
    if (cleaned) setPhase("review");
    else setPhase("idle");
  }

  function setEnumKey<K extends keyof InstantlySearchFilters>(
    key: K,
    values: string[]
  ) {
    patchFilters({ [key]: values.length ? values : undefined } as InstantlySearchFilters);
  }

  async function refreshCount(current: InstantlySearchFilters) {
    const id = ++countReq.current;
    setCountLoading(true);
    setError("");
    try {
      const res = await fetch("/api/instantly/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "count",
          search_filters: current,
        }),
      });
      const data = await res.json();
      if (id !== countReq.current) return;
      if (!res.ok) throw new Error(data.error || "Count failed");
      // Ignore if filters changed while this request was in flight.
      if (JSON.stringify(instantlyRef.current.filters) !== JSON.stringify(current)) {
        return;
      }
      const count =
        typeof data.number_of_leads === "number"
          ? data.number_of_leads
          : typeof data.count === "number"
            ? data.count
            : null;
      const redacted =
        typeof data.number_of_redacted_results === "number"
          ? data.number_of_redacted_results
          : null;
      setInstantly({
        ...instantlyRef.current,
        count,
        redactedCount: redacted,
      });
    } catch (e) {
      if (id !== countReq.current) return;
      setError(e instanceof Error ? e.message : "Count failed");
    } finally {
      if (id === countReq.current) setCountLoading(false);
    }
  }

  async function generateFilters() {
    if (!defineReady) return;
    setPhase("translating");
    setError("");
    try {
      const res = await fetch("/api/instantly/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, schema, prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          data.error ||
          (typeof data.raw === "string" ? data.raw.slice(0, 200) : "Translate failed");
        throw new Error(msg);
      }
      const next = omitEmptyFilters(data.search_filters || {});
      setInstantly({
        filters: Object.keys(next).length ? next : null,
        count: null,
        redactedCount: null,
        preview: null,
      });
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translate failed");
      setPhase(filters ? "review" : "idle");
    }
  }

  async function previewResults() {
    if (!filters) return;
    setPhase("previewing");
    setError("");
    try {
      const res = await fetch("/api/instantly/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          search_filters: filters,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      const leads = Array.isArray(data.leads)
        ? (data.leads as InstantlyPreviewLead[])
        : [];
      const prev = instantlyRef.current;
      const count =
        typeof data.number_of_leads === "number"
          ? data.number_of_leads
          : prev.count;
      const redacted =
        typeof data.number_of_redacted_results === "number"
          ? data.number_of_redacted_results
          : prev.redactedCount;
      setInstantly({
        filters,
        count,
        redactedCount: redacted,
        preview: leads,
      });
      setPhase("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPhase("review");
    }
  }

  const busy = phase === "translating" || phase === "previewing";
  const keywordInclude =
    typeof filters?.keyword_filter?.include === "string"
      ? filters.keyword_filter.include
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : filters?.keyword_filter?.include || [];
  const keywordExclude =
    typeof filters?.keyword_filter?.exclude === "string"
      ? filters.keyword_filter.exclude
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : filters?.keyword_filter?.exclude || [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {busy && (
        <LoadingModal
          message={
            phase === "translating" ? "Generating filters…" : "Previewing leads…"
          }
        />
      )}

      <div className="flex items-center gap-3 border-b border-line px-6 py-3">
        <div className="flex-1 text-muted">Instantly SuperSearch</div>
        {onResetStage && (
          <StageReset
            blockedMessage={resetBlockedMessage ?? null}
            onReset={onResetStage}
          />
        )}
        <button
          type="button"
          onClick={generateFilters}
          disabled={!defineReady || busy}
          title={
            defineReady
              ? undefined
              : "Complete Audience Define first"
          }
          className="rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40"
        >
          Generate Filters
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="text-muted">
            Search and preview are free. Importing and email enrichment (paid) come later.
          </div>

          {!defineReady && (
            <div className="text-muted">
              Complete Audience Define first to generate Instantly filters.
            </div>
          )}

          {error && <div className="text-accent">{error}</div>}

          {filters && (phase === "review" || phase === "results" || phase === "previewing") && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-ink">Review filters</div>
                <div className="text-muted">
                  {countLoading
                    ? "Counting…"
                    : instantly.count == null
                      ? "—"
                      : `${instantly.count.toLocaleString()} results found`}
                </div>
              </div>

              {!countLoading && instantly.count === 0 && (
                <div className="text-muted">
                  No leads match — try broadening filters (fewer departments, wider titles, or remove location).
                </div>
              )}

              <FilterSection title="Locations">
                <IncludeExcludeEditor
                  value={filters.locations}
                  onChange={(locations) => patchFilters({ locations })}
                />
              </FilterSection>

              <FilterSection title="Department">
                <ChipSelect
                  options={INSTANTLY_DEPARTMENTS}
                  selected={filters.department || []}
                  onChange={(v) => setEnumKey("department", v)}
                />
              </FilterSection>

              <FilterSection title="Level">
                <ChipSelect
                  options={INSTANTLY_LEVELS}
                  selected={filters.level || []}
                  onChange={(v) => setEnumKey("level", v)}
                />
              </FilterSection>

              <FilterSection title="Employee count">
                <ChipSelect
                  options={INSTANTLY_EMPLOYEE_COUNTS}
                  selected={filters.employee_count || []}
                  onChange={(v) => setEnumKey("employee_count", v)}
                />
              </FilterSection>

              <FilterSection title="Revenue">
                <ChipSelect
                  options={INSTANTLY_REVENUES}
                  selected={filters.revenue || []}
                  onChange={(v) => setEnumKey("revenue", v)}
                />
              </FilterSection>

              <FilterSection title="Title keywords">
                <IncludeExcludeEditor
                  value={filters.title}
                  onChange={(title) => patchFilters({ title })}
                />
              </FilterSection>

              <FilterSection title="Industry">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <div className="text-muted">Include</div>
                    <ChipSelect
                      options={INSTANTLY_INDUSTRIES}
                      selected={filters.industry?.include || []}
                      onChange={(include) => {
                        const exclude = filters.industry?.exclude || [];
                        const next: InstantlyIncludeExclude = {};
                        if (include.length) next.include = include;
                        if (exclude.length) next.exclude = exclude;
                        patchFilters({
                          industry: next.include || next.exclude ? next : undefined,
                        });
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="text-muted">Exclude</div>
                    <ChipSelect
                      options={INSTANTLY_INDUSTRIES}
                      selected={filters.industry?.exclude || []}
                      onChange={(exclude) => {
                        const include = filters.industry?.include || [];
                        const next: InstantlyIncludeExclude = {};
                        if (include.length) next.include = include;
                        if (exclude.length) next.exclude = exclude;
                        patchFilters({
                          industry: next.include || next.exclude ? next : undefined,
                        });
                      }}
                    />
                  </div>
                </div>
              </FilterSection>

              <FilterSection title="Keywords">
                <IncludeExcludeEditor
                  value={{
                    include: keywordInclude,
                    exclude: keywordExclude,
                  }}
                  onChange={(keyword_filter) => patchFilters({ keyword_filter })}
                />
              </FilterSection>

              <FilterSection title="Company name">
                <IncludeExcludeEditor
                  value={filters.company_name}
                  onChange={(company_name) => patchFilters({ company_name })}
                />
              </FilterSection>

              <FilterSection title="Domains">
                <TagInput
                  values={filters.domains || []}
                  onChange={(domains) =>
                    patchFilters({ domains: domains.length ? domains : undefined })
                  }
                  placeholder="acme.com"
                />
              </FilterSection>

              <FilterSection title="Look-alike domain">
                <input
                  value={filters.look_alike || ""}
                  onChange={(e) =>
                    patchFilters({
                      look_alike: e.target.value.trim() || undefined,
                    })
                  }
                  placeholder="google.com"
                  className="rounded-lg border border-line px-3 py-2 text-ink placeholder:text-muted"
                />
              </FilterSection>

              <FilterSection title="Funding type">
                <ChipSelect
                  options={INSTANTLY_FUNDING_TYPES}
                  selected={filters.funding_type || []}
                  onChange={(v) => setEnumKey("funding_type", v)}
                />
              </FilterSection>

              <FilterSection title="News">
                <ChipSelect
                  options={INSTANTLY_NEWS}
                  selected={filters.news || []}
                  onChange={(v) => setEnumKey("news", v)}
                />
              </FilterSection>

              <FilterSection title="Options">
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-muted">
                    <input
                      type="checkbox"
                      checked={!!filters.skip_owned_leads}
                      onChange={(e) =>
                        patchFilters({ skip_owned_leads: e.target.checked })
                      }
                    />
                    Skip owned leads
                  </label>
                  <label className="flex items-center gap-2 text-muted">
                    <input
                      type="checkbox"
                      checked={!!filters.show_one_lead_per_company}
                      onChange={(e) =>
                        patchFilters({
                          show_one_lead_per_company: e.target.checked,
                        })
                      }
                    />
                    One lead per company
                  </label>
                </div>
              </FilterSection>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={previewResults}
                  disabled={busy || !filters}
                  className="rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40"
                >
                  Preview Results
                </button>
              </div>
            </div>
          )}

          {instantly.preview && instantly.preview.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-line pt-6">
              <div className="text-ink">
                Preview · {instantly.preview.length.toLocaleString()} leads
              </div>
              {instantly.redactedCount != null && instantly.redactedCount > 0 && (
                <div className="text-muted">
                  {instantly.redactedCount.toLocaleString()} results redacted/hidden
                </div>
              )}
              <div className="overflow-x-auto border border-line">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      {PREVIEW_COLUMNS.map((col) => (
                        <th key={col.key} className="px-3 py-2 font-normal">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {instantly.preview.map((lead, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        {PREVIEW_COLUMNS.map((col) => (
                          <td key={col.key} className="px-3 py-2 text-ink">
                            {col.key === "linkedIn" &&
                            typeof lead.linkedIn === "string" &&
                            lead.linkedIn.trim() ? (
                              <a
                                href={
                                  lead.linkedIn.startsWith("http")
                                    ? lead.linkedIn
                                    : `https://${lead.linkedIn}`
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted hover:text-ink"
                              >
                                Profile
                              </a>
                            ) : (
                              leadCell(lead, col.key)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {phase === "results" && instantly.preview && instantly.preview.length === 0 && (
            <div className="text-muted">Preview returned no leads.</div>
          )}
        </div>
      </div>
    </div>
  );
}
