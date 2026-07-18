"use client";

import { useEffect, useState } from "react";
import { fieldByKey, type FieldSchema } from "@/lib/fields";
import type { Proposal } from "@/lib/types";

export default function Proposals({
  proposals,
  schema,
  onConfirm,
  onSkip,
  onConfirmAll,
}: {
  proposals: Proposal[];
  schema: FieldSchema;
  onConfirm: (p: Proposal, value: string) => void;
  onSkip: (p: Proposal) => void;
  onConfirmAll: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const byKey = fieldByKey(schema);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const p of proposals) next[p.key] = p.value;
    setValues(next);
  }, [proposals]);

  if (!proposals.length) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      {proposals.map((p) => {
        const def = byKey[p.key];
        if (!def) return null;
        return (
          <div key={p.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted">
              <span>{def.group ? `${def.group} / ${def.label}` : def.label}</span>
              {p.inferred && <span className="text-[11px] text-accent">inferred</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={values[p.key] ?? ""}
                onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
                className="flex-1 rounded border border-line px-2 py-1"
              />
              <button
                onClick={() => onConfirm(p, values[p.key] ?? "")}
                className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
              >
                Confirm
              </button>
              <button
                onClick={() => onSkip(p)}
                className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
              >
                Skip
              </button>
            </div>
          </div>
        );
      })}
      {proposals.length > 1 && (
        <div className="pt-1">
          <button
            onClick={() => onConfirmAll(values)}
            className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
          >
            Confirm all
          </button>
        </div>
      )}
    </div>
  );
}
