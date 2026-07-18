"use client";

import { useState } from "react";
import { CATEGORIES, categoryDone, categoryFields } from "@/lib/fields";
import type { FieldMap } from "@/lib/types";

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

function Mark({ status }: { status: string }) {
  return (
    <span
      className={
        "mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] " +
        (status === "confirmed"
          ? "border-ink bg-ink text-white"
          : status === "skipped"
          ? "border-line bg-soft text-muted"
          : "border-line text-transparent")
      }
    >
      {status === "confirmed" ? "✓" : status === "skipped" ? "–" : ""}
    </span>
  );
}

export default function DataPanel({ fields }: { fields: FieldMap }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-3">
      {CATEGORIES.map((cat) => {
        const done = categoryDone(fields, cat.id);
        const open = !collapsed[cat.id];
        let currentGroup: string | null = null;
        return (
          <div
            key={cat.id}
            className="overflow-hidden rounded-xl border border-line bg-white"
          >
            <button
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
              }
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-soft"
            >
              <span className="font-medium text-ink">{cat.label}</span>
              <span className="flex items-center gap-2">
                <span className={done ? "text-accent" : "text-muted"}>
                  {done ? "Completed" : "In progress"}
                </span>
                <Chevron open={open} />
              </span>
            </button>

            {open && (
              <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                {categoryFields(cat.id).map((f) => {
                  const state = fields[f.key];
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
                            {f.optional && (
                              <span className="text-muted"> · optional</span>
                            )}
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
            )}
          </div>
        );
      })}
    </div>
  );
}
