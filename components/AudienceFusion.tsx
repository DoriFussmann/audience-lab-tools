"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  attachedAudiencesHaveDisjointGeography,
  buildAttachmentMeta,
  buildFusionCsv,
  downloadFusionCsv,
  filterLeadsByGeoState,
  formatFusionSummaryLine,
  fuseLeads,
  fuseResultFromLeads,
  geoStateCounts,
  hashFileBytes,
  leadDisplayName,
  matchTaxonomyIdInFilename,
  parseLeadCsv,
  type AttachedFile,
  type FuseResult,
  type FusedLead,
  EXCLUDED_EXPORT_COLUMNS,
} from "@/lib/fusion";
import type { BasketItem, ProjectFusion, SavedAudience } from "@/lib/types";

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

function ExpandPanel({
  open,
  children,
  className = "",
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`expand-panel ${open ? "open" : ""}`}>
      <div className="expand-panel-inner">
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}

function TierPanel({
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
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-ink"
      >
        <span className="min-w-0 truncate">{header}</span>
        <Chevron open={open} />
      </button>
      <ExpandPanel open={open} className="flex flex-col gap-1.5 border-t border-line px-3 py-3">
        {children}
      </ExpandPanel>
    </div>
  );
}

function LeadBar({
  rank,
  lead,
  basket,
  open,
  onToggle,
}: {
  rank: number;
  lead: FusedLead;
  basket: BasketItem[];
  open: boolean;
  onToggle: () => void;
}) {
  const nameById = useMemo(
    () => new Map(basket.map((b) => [b.row.id, b.row.premade])),
    [basket]
  );
  const name = leadDisplayName(lead.fields);
  const company = (lead.fields.COMPANY_NAME || "").trim();
  const score = Math.round(lead.fusionScore * 10) / 10;

  return (
    <div className="border border-line">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0 truncate text-ink">
          {rank}. {name}
          {company ? ` · ${company}` : ""}
          {" · "}
          {score}
          {" · "}
          {lead.audienceIds.length} aud
        </span>
        <Chevron open={open} />
      </button>
      <ExpandPanel open={open} className="flex flex-col gap-2 border-t border-line px-3 py-3 text-muted">
        <div>
          <span className="text-ink">Audiences</span>
          <div className="flex flex-col gap-0.5 pt-1">
            {lead.audienceIds.map((id) => (
              <span key={id}>
                {nameById.get(id) || id}
                {" · "}
                {id}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="text-ink">Emails</span>
          <div className="flex flex-col gap-0.5 pt-1">
            {(lead.fields.PERSONAL_VERIFIED_EMAILS ||
              lead.fields.BUSINESS_VERIFIED_EMAILS ||
              lead.fields.BUSINESS_EMAIL ||
              lead.fields.PERSONAL_EMAILS ||
              "—")
              .split(/[,;]+/)
              .map((e) => e.trim())
              .filter(Boolean)
              .slice(0, 6)
              .map((e) => (
                <span key={e}>{e}</span>
              ))}
          </div>
        </div>
        {(lead.fields.JOB_TITLE || "").trim() && (
          <div>
            <span className="text-ink">Title</span>
            <div className="pt-1">{lead.fields.JOB_TITLE}</div>
          </div>
        )}
        <div>
          <span className="text-ink">Score breakdown</span>
          <div className="flex flex-col gap-0.5 pt-1">
            <span>Audience points · {lead.breakdown.audiencePoints}</span>
            {lead.breakdown.roleContributions.map((c) => (
              <span key={c.taxonomyId} className="pl-3">
                {c.name} ({c.role}) · +{c.points}
              </span>
            ))}
            <span>Pair bonuses · {lead.breakdown.pairBonuses}</span>
            {lead.breakdown.pairHits.map((p) => (
              <span key={`${p.a}×${p.b}`} className="pl-3">
                {p.aName} × {p.bName} · +15
              </span>
            ))}
            <span>Contactability · {Math.round(lead.breakdown.contactability * 10) / 10}</span>
            <span className="pt-1 text-ink">
              Total · {Math.round(lead.fusionScore * 10) / 10}
            </span>
          </div>
        </div>
      </ExpandPanel>
    </div>
  );
}

function fileId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function AudienceFusion({
  projectName,
  audience,
  fusion,
  setFusion,
  onOpenTab,
}: {
  projectName: string;
  audience: SavedAudience | null;
  fusion: ProjectFusion;
  setFusion: (updater: (prev: ProjectFusion) => ProjectFusion) => void;
  onOpenTab: (tab: "find") => void;
}) {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<FuseResult | null>(null);
  const [geoFilter, setGeoFilter] = useState<string | null>(null);
  const [geoMismatch, setGeoMismatch] = useState(false);
  const [exportN, setExportN] = useState(fusion.exportN || 250);
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [exportColsOpen, setExportColsOpen] = useState(false);
  const [openTiers, setOpenTiers] = useState({
    silver: false,
    gold: false,
    diamond: false,
  });
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenHashes = useRef<Set<string>>(new Set());

  const basket = audience?.basket || [];
  const ready = basket.length > 0;
  const taxonomyIds = useMemo(() => basket.map((b) => b.row.id), [basket]);
  const basketKey = audience?.tierPlan?.taxonomyIds?.join(",") || "";

  // Clear in-memory lead buffers when the confirmed basket identity changes.
  useEffect(() => {
    setFiles([]);
    setResult(null);
    setGeoFilter(null);
    setGeoMismatch(false);
    seenHashes.current = new Set();
    setExportN(fusion.exportN || 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session reset only
  }, [basketKey]);

  const viewResult = useMemo(() => {
    if (!result) return null;
    return fuseResultFromLeads(filterLeadsByGeoState(result.leads, geoFilter));
  }, [result, geoFilter]);

  const stateOptions = useMemo(
    () => (result ? geoStateCounts(result.leads) : []),
    [result]
  );

  const attachedCount = useMemo(() => {
    const ids = new Set(
      files.filter((f) => f.taxonomyId && !f.error).map((f) => f.taxonomyId as string)
    );
    return ids.size;
  }, [files]);

  const metaById = useMemo(() => {
    const m = new Map(fusion.attachments.map((a) => [a.taxonomyId, a]));
    return m;
  }, [fusion.attachments]);

  function audienceStatus(item: BasketItem): string {
    const assigned = files.filter((f) => f.taxonomyId === item.row.id && !f.error);
    if (assigned.length) {
      const n = assigned.reduce((sum, f) => sum + f.rows.length, 0);
      return `attached · ${n.toLocaleString()} leads`;
    }
    const meta = metaById.get(item.row.id);
    if (meta?.needsReattach && (meta.fileNames.length || meta.rowCount > 0)) {
      return "re-attach needed";
    }
    return "waiting";
  }

  function firstUnattached(): string | null {
    for (const item of basket) {
      const has = files.some((f) => f.taxonomyId === item.row.id && !f.error);
      if (!has) return item.row.id;
    }
    return basket[0]?.row.id || null;
  }

  async function ingestFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) =>
      f.name.toLowerCase().endsWith(".csv")
    );
    if (!incoming.length) return;

    const next: AttachedFile[] = [];
    for (const file of incoming) {
      const hash = await hashFileBytes(file);
      if (seenHashes.current.has(hash)) continue;
      seenHashes.current.add(hash);

      const text = await file.text();
      const parsed = parseLeadCsv(text);
      const autoId = matchTaxonomyIdInFilename(file.name, taxonomyIds);

      if (!parsed.ok) {
        next.push({
          id: fileId(),
          fileName: file.name,
          contentHash: hash,
          taxonomyId: autoId,
          rows: [],
          error: parsed.error,
        });
        continue;
      }

      next.push({
        id: fileId(),
        fileName: file.name,
        contentHash: hash,
        taxonomyId: autoId || firstUnattached(),
        rows: parsed.rows,
      });
    }

    if (!next.length) return;

    setFiles((prev) => {
      const used = new Set(
        prev.filter((x) => x.taxonomyId && !x.error).map((x) => x.taxonomyId as string)
      );
      const assignedNew: AttachedFile[] = next.map((f) => {
        if (f.taxonomyId || f.error) {
          if (f.taxonomyId) used.add(f.taxonomyId);
          return f;
        }
        const pick =
          basket.find((b) => !used.has(b.row.id))?.row.id || basket[0]?.row.id || null;
        if (pick) used.add(pick);
        return { ...f, taxonomyId: pick };
      });
      const merged = [...prev, ...assignedNew];
      queueMicrotask(() => syncAttachments(merged));
      return merged;
    });
    setResult(null);
  }

  function syncAttachments(nextFiles: AttachedFile[], summary?: ProjectFusion["summary"] | null) {
    setFusion((prev) => ({
      ...prev,
      exportN,
      attachments: buildAttachmentMeta(basket, nextFiles, prev.attachments),
      ...(summary !== undefined ? { summary } : {}),
    }));
  }

  function assignFile(id: string, taxonomyId: string) {
    setFiles((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, taxonomyId } : f));
      queueMicrotask(() => syncAttachments(next));
      return next;
    });
    setResult(null);
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const victim = prev.find((f) => f.id === id);
      if (victim) seenHashes.current.delete(victim.contentHash);
      const next = prev.filter((f) => f.id !== id);
      queueMicrotask(() => syncAttachments(next));
      return next;
    });
    setResult(null);
  }

  function runFuse() {
    if (!audience || attachedCount < 2) return;
    const assigned = files.filter((f) => f.taxonomyId && !f.error && f.rows.length);
    const byAudience = new Map<string, { taxonomyId: string; rows: typeof assigned[0]["rows"] }>();
    for (const f of assigned) {
      const id = f.taxonomyId!;
      const existing = byAudience.get(id);
      if (existing) {
        existing.rows = existing.rows.concat(f.rows);
      } else {
        byAudience.set(id, { taxonomyId: id, rows: [...f.rows] });
      }
    }
    const audienceFiles = [...byAudience.values()];
    const fused = fuseLeads(basket, audienceFiles, audience.tierPlan);
    setResult(fused);
    setGeoFilter(null);
    setGeoMismatch(attachedAudiencesHaveDisjointGeography(audienceFiles));
    setOpenTiers({ silver: false, gold: false, diamond: false });
    setExpandedLead(null);
    syncAttachments(files, {
      total: fused.total,
      silver: fused.silver,
      gold: fused.gold,
      diamond: fused.diamond,
      exportN,
      fusedAt: Date.now(),
    });
  }

  function onExportNChange(v: number) {
    const n = Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
    setExportN(n);
    setFusion((prev) => ({ ...prev, exportN: n }));
  }

  function download() {
    if (!viewResult || !audience) return;
    const csv = buildFusionCsv(viewResult.leads, basket, exportN, includeExcluded);
    downloadFusionCsv(projectName, csv, exportN, geoFilter);
  }

  if (!ready) {
    return (
      <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl text-muted">
          Confirm a basket in{" "}
          <button
            type="button"
            onClick={() => onOpenTab("find")}
            className="text-ink underline decoration-line underline-offset-2 hover:text-accent"
          >
            Audience Find
          </button>{" "}
          first
        </div>
      </div>
    );
  }

  const unassignedOrErrored = files.filter((f) => !f.taxonomyId || f.error);
  const assignedFiles = files.filter((f) => f.taxonomyId && !f.error);

  function tierLeads(tier: "Silver" | "Gold" | "Diamond") {
    if (!viewResult) return [];
    return viewResult.leads.filter((l) => l.tier === tier).slice(0, 20);
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-ink">Audience Fusion</span>
        </div>

        <div className="flex flex-col gap-2">
          {basket.map((item) => (
            <div
              key={item.row.id}
              className="flex items-baseline justify-between gap-3 border-b border-line py-2"
            >
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-ink">{item.row.premade}</span>
                <span className="text-muted">
                  {item.row.id} · {item.role}
                </span>
              </div>
              <span className="shrink-0 text-muted">{audienceStatus(item)}</span>
            </div>
          ))}
        </div>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              dragDepth.current = 0;
              setDragging(false);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (e.dataTransfer.files?.length) ingestFiles(e.dataTransfer.files);
          }}
          className={
            "flex items-center justify-center rounded-lg border border-dashed px-4 py-8 " +
            (dragging ? "border-accent bg-soft" : "border-line")
          }
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-muted hover:text-ink"
          >
            Drop lead CSV files here, or click to browse
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) ingestFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {(assignedFiles.length > 0 || unassignedOrErrored.length > 0) && (
          <div className="flex flex-col gap-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2"
              >
                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="truncate text-ink">{f.fileName}</span>
                  {f.error ? (
                    <span className="text-muted">{f.error}</span>
                  ) : (
                    <span className="text-muted">
                      {f.rows.length.toLocaleString()} leads
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!f.error && (
                    <select
                      value={f.taxonomyId || ""}
                      onChange={(e) => assignFile(f.id, e.target.value)}
                      className="rounded border border-line bg-white px-2 py-1 text-muted"
                    >
                      {basket.map((item) => (
                        <option key={item.row.id} value={item.row.id}>
                          {item.row.premade}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={attachedCount < 2}
            onClick={runFuse}
            className={
              "rounded-lg border px-3 py-1.5 " +
              (attachedCount < 2
                ? "border-line text-muted opacity-50"
                : "border-line text-ink hover:bg-soft")
            }
          >
            Fuse
          </button>
          <label className="flex items-center gap-2 text-muted">
            Leads to export
            <input
              type="number"
              min={1}
              value={exportN}
              onChange={(e) => onExportNChange(Number(e.target.value))}
              className="w-20 rounded border border-line px-2 py-1 text-ink"
            />
          </label>
          {attachedCount < basket.length && (
            <span className="text-muted">
              {attachedCount} of {basket.length} audiences attached
            </span>
          )}
        </div>

        {result && viewResult && (
          <div className="flex flex-col gap-4">
            {geoMismatch && (
              <span className="text-muted">
                Attached files appear to cover different geographies — overlap will
                be minimal.
              </span>
            )}

            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-ink">{formatFusionSummaryLine(viewResult)}</span>
                <select
                  value={geoFilter || ""}
                  onChange={(e) => {
                    setGeoFilter(e.target.value || null);
                    setExpandedLead(null);
                  }}
                  className="rounded border border-line bg-white px-2 py-1 text-muted"
                >
                  <option value="">All states</option>
                  {stateOptions.map(({ state, count }) => (
                    <option key={state} value={state}>
                      {state} · {count}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setExportColsOpen((v) => !v)}
                  className="flex items-center gap-1 text-muted hover:text-ink"
                >
                  Export columns
                  <Chevron open={exportColsOpen} />
                </button>
                <ExpandPanel open={exportColsOpen} className="text-muted">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={includeExcluded}
                      onChange={(e) => setIncludeExcluded(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      Include excluded columns (
                      {EXCLUDED_EXPORT_COLUMNS.join(", ")})
                    </span>
                  </label>
                </ExpandPanel>
                <button
                  type="button"
                  onClick={download}
                  className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
                >
                  Download CSV
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <TierPanel
                header={`Silver · ${viewResult.silver}`}
                open={openTiers.silver}
                onToggle={() =>
                  setOpenTiers((p) => ({ ...p, silver: !p.silver }))
                }
              >
                {tierLeads("Silver").map((lead, i) => (
                  <LeadBar
                    key={`s-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`}
                    rank={i + 1}
                    lead={lead}
                    basket={basket}
                    open={
                      expandedLead ===
                      `s-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`
                    }
                    onToggle={() => {
                      const key = `s-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`;
                      setExpandedLead((prev) => (prev === key ? null : key));
                    }}
                  />
                ))}
                {!tierLeads("Silver").length && (
                  <span className="text-muted">No Silver leads</span>
                )}
              </TierPanel>

              <div className="ml-5 flex flex-col gap-2">
                <TierPanel
                  header={`Gold · ${viewResult.gold}`}
                  open={openTiers.gold}
                  onToggle={() =>
                    setOpenTiers((p) => ({ ...p, gold: !p.gold }))
                  }
                >
                  {tierLeads("Gold").map((lead, i) => (
                    <LeadBar
                      key={`g-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`}
                      rank={i + 1}
                      lead={lead}
                      basket={basket}
                      open={
                        expandedLead ===
                        `g-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`
                      }
                      onToggle={() => {
                        const key = `g-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`;
                        setExpandedLead((prev) => (prev === key ? null : key));
                      }}
                    />
                  ))}
                  {!tierLeads("Gold").length && (
                    <span className="text-muted">No Gold leads</span>
                  )}
                </TierPanel>

                <div className="ml-5">
                  <TierPanel
                    header={`Diamond · ${viewResult.diamond}`}
                    open={openTiers.diamond}
                    onToggle={() =>
                      setOpenTiers((p) => ({ ...p, diamond: !p.diamond }))
                    }
                  >
                    {tierLeads("Diamond").map((lead, i) => (
                      <LeadBar
                        key={`d-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`}
                        rank={i + 1}
                        lead={lead}
                        basket={basket}
                        open={
                          expandedLead ===
                          `d-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`
                        }
                        onToggle={() => {
                          const key = `d-${i}-${lead.fields.UUID || leadDisplayName(lead.fields)}`;
                          setExpandedLead((prev) => (prev === key ? null : key));
                        }}
                      />
                    ))}
                    {!tierLeads("Diamond").length && (
                      <span className="text-muted">No Diamond leads</span>
                    )}
                  </TierPanel>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
