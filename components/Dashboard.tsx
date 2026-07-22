"use client";

import { useState } from "react";
import CopyBox from "./CopyBox";
import { allDone, categoryDone, categoryFields, type FieldSchema } from "@/lib/fields";
import { materialsLinksList } from "@/lib/letter";
import { buildProjectSummary } from "@/lib/summary";
import type { FieldMap, ProjectAudit, ProjectFusion, ProjectLetter, SavedAudience } from "@/lib/types";

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

function CollapsibleCard({
  title,
  meta,
  status,
  statusAccent,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  status?: string;
  statusAccent?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-soft"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-ink">{title}</span>
          {meta && <span className="truncate text-muted">{meta}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {status && (
            <span className={statusAccent ? "text-accent" : "text-muted"}>{status}</span>
          )}
          <Chevron open={open} />
        </span>
      </button>
      <div className={`expand-panel ${open ? "open" : ""}`}>
        <div className="expand-panel-inner">
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Mark({ status }: { status: string }) {
  return (
    <span
      className={
        "mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] " +
        (status === "confirmed"
          ? "border-check bg-check text-white"
          : status === "skipped"
          ? "border-line bg-soft text-muted"
          : "border-line text-transparent")
      }
    >
      {status === "confirmed" ? "✓" : status === "skipped" ? "–" : ""}
    </span>
  );
}

function DefinePreview({ fields, schema }: { fields: FieldMap; schema: FieldSchema }) {
  return (
    <div className="flex flex-col gap-4">
      {schema.categories.map((cat) => {
        const done = categoryDone(fields, schema, cat.id);
        const catFields = categoryFields(schema, cat.id);
        const settled = catFields.filter((f) => {
          const s = fields[f.key]?.status;
          return s === "confirmed" || s === "skipped";
        }).length;
        let currentGroup: string | null = null;
        return (
          <div key={cat.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted">{cat.label}</span>
              <span className={done ? "text-accent" : "text-muted"}>
                {done ? "Completed" : `${settled}/${catFields.length}`}
              </span>
            </div>
            {catFields.map((f) => {
              const state = fields[f.key] || {
                value: "",
                status: "empty" as const,
                inferred: false,
              };
              const showGroup = f.group && f.group !== currentGroup;
              if (f.group) currentGroup = f.group;
              return (
                <div key={f.key}>
                  {showGroup && <div className="pb-1 pt-1 text-muted">{f.group}</div>}
                  <div className="flex items-start gap-2">
                    <Mark status={state.status} />
                    <div className="flex min-w-0 flex-col">
                      <span className={state.status === "empty" ? "text-muted" : "text-ink"}>
                        {f.label}
                        {f.optional && <span className="text-muted"> · optional</span>}
                      </span>
                      {state.status === "confirmed" && (
                        <span className="break-words text-muted">
                          {state.value}
                          {state.inferred ? " (inferred)" : ""}
                        </span>
                      )}
                      {state.status === "skipped" && <span className="text-muted">—</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard({
  projectName,
  fields,
  audience,
  letter,
  fusion,
  audit,
  schema,
  onOpen,
}: {
  projectName: string;
  fields: FieldMap;
  audience: SavedAudience | null;
  letter: ProjectLetter;
  fusion: ProjectFusion;
  audit: ProjectAudit | null;
  schema: FieldSchema;
  onOpen: (tab: "define" | "find" | "letter" | "fusion" | "audit") => void;
}) {
  const [projectSummary, setProjectSummary] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const confirmed = schema.fields.filter((f) => fields[f.key]?.status === "confirmed").length;
  const skipped = schema.fields.filter((f) => fields[f.key]?.status === "skipped").length;
  const outstanding = schema.fields.length - confirmed - skipped;
  const defineDone = allDone(fields, schema);
  const findDone = !!audience?.basket?.length;
  const letterDone = !!letter.result;
  const basketCount = audience?.basket?.length ?? 0;
  const plan = audience?.tierPlan;
  const emailCount =
    letter.result?.tiers.reduce((n, t) => n + t.emails.length, 0) ?? 0;
  const materialLinks = materialsLinksList(letter.materials.links);
  const fusionSummary = fusion.summary;
  const fusionNeedsReattach = fusion.attachments.some((a) => a.needsReattach);
  const fusionDone = !!fusionSummary;

  const categoriesDone = schema.categories.filter((cat) =>
    categoryDone(fields, schema, cat.id)
  ).length;

  const defineStatus = defineDone
    ? "Completed"
    : confirmed + skipped === 0
    ? "Not started"
    : "In progress";
  const findStatus = findDone ? "Completed" : "Not started";
  const letterStatus = letterDone ? "Generated" : "Not started";
  const fusionStatus = !findDone
    ? "Waiting on Find"
    : fusionDone && fusionNeedsReattach
    ? "Saved · re-attach to export"
    : fusionDone
    ? "Fused"
    : "Not started";

  const defineMeta =
    confirmed + skipped === 0
      ? `${schema.fields.length} data points`
      : `${confirmed} confirmed · ${skipped} skipped · ${outstanding} left · ${categoriesDone}/${schema.categories.length} categories`;

  const findMeta = findDone
    ? `${basketCount} in basket${plan ? ` · ${plan.n} tier audiences` : ""}`
    : "No audience basket confirmed";

  const letterMeta = letterDone
    ? `${emailCount} emails${
        materialLinks.length ? ` · ${materialLinks.length} links` : ""
      }`
    : "No sequences generated";

  const fusionMeta = fusionSummary
    ? `${fusionSummary.total} unique · ${fusionSummary.silver} Silver · ${fusionSummary.gold} Gold · ${fusionSummary.diamond} Diamond`
    : findDone
    ? "Attach lead CSVs and fuse"
    : "Requires a confirmed Find basket";

  function toggle(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-baseline justify-between pb-2">
          <span className="text-[15px] text-ink">{projectName}</span>
          <span className="text-muted">Project Dashboard</span>
        </div>

        <CollapsibleCard
          title="Audience Define"
          meta={defineMeta}
          status={defineStatus}
          statusAccent={defineDone}
          open={!!openSections.define}
          onToggle={() => toggle("define")}
        >
          <div className="scroll-thin max-h-72 overflow-y-auto">
            <DefinePreview fields={fields} schema={schema} />
          </div>
          <div>
            <button
              onClick={() => onOpen("define")}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Open
            </button>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="Audience Find"
          meta={findMeta}
          status={findStatus}
          statusAccent={findDone}
          open={!!openSections.find}
          onToggle={() => toggle("find")}
        >
          {findDone && plan && (
            <div className="scroll-thin max-h-72 overflow-y-auto">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 text-muted">
                  <div>
                    <span className="text-ink">{plan.silver.name}</span> — {plan.silver.rule}
                  </div>
                  <div>
                    <span className="text-ink">{plan.gold.name}</span> — {plan.gold.rule}
                  </div>
                  <div>
                    <span className="text-ink">{plan.diamond.name}</span> — {plan.diamond.rule}
                  </div>
                  {plan.combinations.length > 0 && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-ink">Strongest combinations</span>
                      {plan.combinations.map((pair) => (
                        <span key={`${pair.a}×${pair.b}`}>
                          {pair.a} × {pair.b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {audience!.basket.map((item) => (
                  <div key={item.row.id} className="flex flex-col gap-0.5 border-t border-line pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink">{item.row.premade}</span>
                      <span className="text-muted">{item.role}</span>
                    </div>
                    <span className="break-words text-muted">{item.row.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <button
              onClick={() => onOpen("find")}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Open
            </button>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="Audience Letter"
          meta={letterMeta}
          status={letterStatus}
          statusAccent={letterDone}
          open={!!openSections.letter}
          onToggle={() => toggle("letter")}
        >
          {letterDone && letter.result && (
            <div className="scroll-thin max-h-72 overflow-y-auto">
              <div className="flex flex-col gap-2 text-muted">
                <div className="text-ink">{emailCount} emails</div>
                {letter.result.tiers.map((tier) => (
                  <div key={tier.tier} className="border-t border-line pt-2">
                    <div className="text-ink">{tier.tier}</div>
                    {tier.emails.map((email, i) => (
                      <div key={`${tier.tier}-${i}`} className="truncate">
                        Email {i + 1} · Day {email.day} · {email.subject}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <button
              onClick={() => onOpen("letter")}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Open
            </button>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="Audience Fusion"
          meta={fusionMeta}
          status={fusionStatus}
          statusAccent={fusionDone}
          open={!!openSections.fusion}
          onToggle={() => toggle("fusion")}
        >
          {fusionSummary && (
            <div className="text-muted">
              {fusionSummary.total} unique leads · {fusionSummary.silver} Silver ·{" "}
              {fusionSummary.gold} Gold · {fusionSummary.diamond} Diamond
              {fusionNeedsReattach
                ? " · re-attach CSVs only if you need to export or re-fuse"
                : ""}
            </div>
          )}
          <div>
            <button
              onClick={() => onOpen("fusion")}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Open
            </button>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="Audience Audit"
          meta={
            audit
              ? audit.patterns.overall.slice(0, 120) + (audit.patterns.overall.length > 120 ? "…" : "")
              : fusionDone
              ? "Run audit after fusing leads"
              : "Requires fusion bottom-lines (run Fusion once)"
          }
          status={audit ? `Run ${new Date(audit.runAt).toLocaleDateString()}` : "Not run"}
          statusAccent={!!audit}
          open={!!openSections.audit}
          onToggle={() => toggle("audit")}
        >
          {audit && (
            <div className="text-muted">
              {audit.leads.length} leads audited · {audit.leads.filter((l) => l.fitPercent >= 70).length} strong fits
            </div>
          )}
          <div>
            <button
              onClick={() => onOpen("audit")}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Open
            </button>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title="Project Summary"
          meta={
            projectSummary
              ? "Copyable summary of define + find + letter"
              : "Generate when define and find are ready"
          }
          status={projectSummary ? "Ready" : "Not created"}
          statusAccent={!!projectSummary}
          open={!!openSections.summary}
          onToggle={() => toggle("summary")}
        >
          <div className="flex items-center justify-end">
            <button
              onClick={() =>
                setProjectSummary(
                  buildProjectSummary(
                    projectName,
                    fields,
                    audience,
                    schema,
                    letter,
                    fusion
                  )
                )
              }
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Create Summary
            </button>
          </div>
          {projectSummary && <CopyBox value={projectSummary} height="h-96" />}
        </CollapsibleCard>
      </div>
    </div>
  );
}
