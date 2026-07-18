"use client";

import { useMemo, useState } from "react";
import Chat from "./Chat";
import CopyBox from "./CopyBox";
import Proposals from "./Proposals";
import { FIELD_BY_KEY, searchQueryFromFields } from "@/lib/fields";
import { search, type Index } from "@/lib/taxonomy";
import { buildAudienceSummary } from "@/lib/summary";
import type { ChatMessage, FieldMap, Match, Proposal, SavedAudience, TaxRow } from "@/lib/types";

const CANDIDATE_COUNT = 40;

export default function AudienceFind({
  fields,
  applyProposal,
  messages,
  setMessages,
  rows,
  index,
  taxonomyName,
  loadingTaxonomy,
  onFile,
  audience,
  setAudience,
}: {
  fields: FieldMap;
  applyProposal: (key: string, value: string, inferred: boolean) => void;
  messages: ChatMessage[];
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  rows: TaxRow[];
  index: Index | null;
  taxonomyName: string;
  loadingTaxonomy: boolean;
  onFile: (file: File) => void;
  audience: SavedAudience | null;
  setAudience: (a: SavedAudience | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [pending, setPending] = useState<Proposal[]>([]);
  const [typeFilter, setTypeFilter] = useState("All");

  const rowById = useMemo(() => {
    const m = new Map<string, TaxRow>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  const ready = rows.length > 0 && !!index;

  function candidates(extra: string) {
    if (!index) return [];
    const query = `${searchQueryFromFields(fields)} ${extra}`.trim();
    return search(index, rows, query, CANDIDATE_COUNT, typeFilter).map((r) => r.row);
  }

  async function call(history: ChatMessage[], extraQuery: string) {
    setBusy(true);
    setError("");
    try {
      const cands = candidates(extraQuery);
      if (!cands.length) throw new Error("No candidates matched. Add more data points.");
      const res = await fetch("/api/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, fields, candidates: cands }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
      setMatches(data.matches || []);
      setPending(
        (data.proposals as Proposal[]).filter(
          (p) => fields[p.key] && fields[p.key].value.trim() !== p.value.trim()
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function run() {
    setMessages(() => []);
    call([], "");
  }

  function send(text: string) {
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(() => history);
    setPending([]);
    call(history, text);
  }

  function confirmMatch(m: Match) {
    const row = rowById.get(m.id);
    if (!row) return;
    setAudience({ row, why: m.why, confidence: m.confidence });
    setMatches([]);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `Confirmed audience: ${row.premade} (${row.id}).` },
    ]);
  }

  const footer = (
    <>
      {error && <div className="text-accent">{error}</div>}
      <Proposals
        proposals={pending}
        onConfirm={(p, value) => {
          applyProposal(p.key, value, !!p.inferred);
          setPending(pending.filter((x) => x.key !== p.key));
        }}
        onSkip={(p) => setPending(pending.filter((x) => x.key !== p.key))}
        onConfirmAll={(values) => {
          for (const p of pending) applyProposal(p.key, values[p.key] ?? p.value, !!p.inferred);
          setPending([]);
        }}
      />
      {audience && (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <div>Audience Find complete. Audience confirmed.</div>
          <CopyBox value={buildAudienceSummary(audience)} />
        </div>
      )}
      {matches.length > 0 && (
        <div className="flex flex-col gap-2">
          {matches.map((m) => {
            const row = rowById.get(m.id);
            if (!row) return null;
            return (
              <div key={m.id} className="flex flex-col gap-1 rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <span>{row.premade}</span>
                  <span className="text-muted">{m.confidence}</span>
                </div>
                <div className="text-muted">
                  {row.category} › {row.subcategory} · {row.type} · {row.id}
                </div>
                <div className="text-muted">{m.why}</div>
                <div className="pt-1">
                  <button
                    onClick={() => confirmMatch(m)}
                    className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line px-6 py-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className={
              "flex flex-1 items-center justify-center rounded-lg border border-dashed px-4 py-3 " +
              (dragging ? "border-accent bg-soft" : "border-line")
            }
          >
            <label className="cursor-pointer text-muted">
              {loadingTaxonomy
                ? "Loading taxonomy…"
                : ready
                ? `${taxonomyName} · ${rows.length.toLocaleString()} audiences · drop to replace`
                : "Drag & drop taxonomy file"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-line px-2 py-2 text-muted"
          >
            <option value="All">All</option>
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
          </select>

          <button
            onClick={run}
            disabled={!ready || busy}
            className="rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40"
          >
            Submit
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <Chat
            messages={messages}
            busy={busy}
            disabled={!ready}
            placeholder={ready ? "Message" : "Upload a taxonomy to start"}
            onSend={send}
            footer={footer}
          />
        </div>
      </div>

      <div className="scroll-thin w-[340px] shrink-0 overflow-y-auto border-l border-line p-5">
        <div className="pb-4 text-muted">Audience</div>

        {!audience && <div className="text-muted">No audience confirmed.</div>}

        {audience && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span>{audience.row.premade}</span>
                <span className="text-accent">Confirmed</span>
              </div>
              <div className="flex flex-col gap-2 border-t border-line pt-2">
                {[
                  ["Taxonomy ID", audience.row.id],
                  ["Category", audience.row.category],
                  ["Subcategory", audience.row.subcategory],
                  ["Audience Type", audience.row.type],
                  ["Confidence", String(audience.confidence)],
                  ["Rationale", audience.why],
                  ["Description", audience.row.description],
                  ["Keywords", audience.row.keywords],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col">
                    <span className="text-ink">{label}</span>
                    <span className="break-words text-muted">{value || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <button
                onClick={() => setAudience(null)}
                className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
