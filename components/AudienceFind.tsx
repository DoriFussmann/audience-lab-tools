"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Chat from "./Chat";
import CopyBox from "./CopyBox";
import Proposals from "./Proposals";
import type { FieldSchema } from "@/lib/fields";
import {
  AUDIENCE_ROLES,
  buildTierPlan,
  retrieveByRole,
} from "@/lib/match";
import { buildAudienceSummary } from "@/lib/summary";
import type {
  AudienceRole,
  BasketItem,
  ChatMessage,
  FieldMap,
  Match,
  Proposal,
  SavedAudience,
  TaxRow,
  TierInfo,
  TierPlan,
} from "@/lib/types";

function BasketBar({
  item,
  index,
  animate,
  expanded,
  onToggle,
  onReject,
}: {
  item: BasketItem;
  index: number;
  animate: boolean;
  expanded: boolean;
  onToggle: () => void;
  onReject?: () => void;
}) {
  const row = item.row;
  return (
    <div
      className={`border border-line ${animate ? "basket-bar-enter" : ""}`}
      style={animate ? { animationDelay: `${index * 80}ms` } : undefined}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 truncate text-ink">{row.premade}</span>
          <span className="shrink-0 text-muted">
            {item.role} · {item.confidence}
          </span>
        </button>
        {onReject && (
          <button
            type="button"
            onClick={onReject}
            className="shrink-0 rounded border border-line px-2 py-1 text-muted hover:text-ink"
          >
            Reject
          </button>
        )}
      </div>
      <div className={`expand-panel ${expanded ? "open" : ""}`}>
        <div className="expand-panel-inner">
          <div className="flex flex-col gap-1.5 border-t border-line px-3 py-3 text-muted">
            <div>{row.id}</div>
            <div>{item.role}</div>
            <div>{item.confidence}</div>
            <div>{item.why}</div>
            <div>Premade Keywords · {row.keywords || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BasketSection({
  basket,
  onClear,
  onReject,
}: {
  basket: BasketItem[];
  onClear?: () => void;
  onReject?: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const ms = basket.length * 80 + 400;
    const t = window.setTimeout(() => setAnimate(false), ms);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted">Basket · {basket.length} audiences</div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {basket.map((item, index) => (
          <BasketBar
            key={item.row.id}
            item={item}
            index={index}
            animate={animate}
            expanded={expandedId === item.row.id}
            onToggle={() =>
              setExpandedId((prev) => (prev === item.row.id ? null : item.row.id))
            }
            onReject={onReject ? () => onReject(item.row.id) : undefined}
          />
        ))}
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
        className="flex w-full px-3 py-2.5 text-left text-ink"
      >
        {header}
      </button>
      <div className={`expand-panel ${open ? "open" : ""}`}>
        <div className="expand-panel-inner">
          <div className="flex flex-col gap-2 border-t border-line px-3 py-3 text-muted">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function tierHeader(tier: TierInfo) {
  return `${tier.name} · ${tier.subtitle}`;
}

function TierSection({ plan }: { plan: TierPlan }) {
  const [open, setOpen] = useState({ silver: false, gold: false, diamond: false });

  function toggle(key: keyof typeof open) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex flex-col gap-2">
      <TierPanel
        header={tierHeader(plan.silver)}
        open={open.silver}
        onToggle={() => toggle("silver")}
      >
        <div>{plan.silver.rule}</div>
        <div>{plan.silver.treatment}</div>
      </TierPanel>

      <div className="ml-5 flex flex-col gap-2">
        <TierPanel
          header={tierHeader(plan.gold)}
          open={open.gold}
          onToggle={() => toggle("gold")}
        >
          <div>{plan.gold.rule}</div>
          <div>{plan.gold.treatment}</div>
          {plan.combinations.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5">
              <div className="text-ink">Strongest combinations</div>
              {plan.combinations.map((pair) => (
                <div key={`${pair.a}×${pair.b}`}>
                  {pair.a} × {pair.b}
                </div>
              ))}
            </div>
          )}
        </TierPanel>

        <div className="ml-5">
          <TierPanel
            header={tierHeader(plan.diamond)}
            open={open.diamond}
            onToggle={() => toggle("diamond")}
          >
            <div>{plan.diamond.rule}</div>
            <div>{plan.diamond.treatment}</div>
            {plan.diamond.note && <div>{plan.diamond.note}</div>}
          </TierPanel>
        </div>
      </div>
    </div>
  );
}

function ConfirmedResults({
  audience,
  onClear,
  onReject,
}: {
  audience: SavedAudience;
  onClear: () => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <BasketSection
        basket={audience.basket}
        onClear={onClear}
        onReject={onReject}
      />
      <TierSection plan={audience.tierPlan} />
      <CopyBox value={buildAudienceSummary(audience)} />
    </div>
  );
}

function BasketRow({
  item,
  onReject,
}: {
  item: BasketItem | { row: TaxRow; why: string; confidence: string; role: AudienceRole };
  onReject?: () => void;
}) {
  const row = item.row;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <span>{row.premade}</span>
        <span className="text-muted">{item.confidence}</span>
      </div>
      <div className="text-muted">
        role:{item.role} · {row.category} › {row.subcategory} · {row.type} · {row.id}
      </div>
      <div className="text-muted">{item.why}</div>
      {onReject && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onReject}
            className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function AudienceFind({
  fields,
  applyProposal,
  messages,
  setMessages,
  rows,
  taxonomyName,
  audience,
  setAudience,
  schema,
  prompt,
}: {
  fields: FieldMap;
  applyProposal: (key: string, value: string, inferred: boolean) => void;
  messages: ChatMessage[];
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  rows: TaxRow[];
  taxonomyName: string;
  audience: SavedAudience | null;
  setAudience: (a: SavedAudience | null) => void;
  schema: FieldSchema;
  prompt: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Proposal[]>([]);
  const [typeFilter, setTypeFilter] = useState("All");
  /** Proposed basket before confirm (resolved rows). */
  const [proposed, setProposed] = useState<BasketItem[]>([]);

  const rowById = useMemo(() => {
    const m = new Map<string, TaxRow>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  const ready = rows.length > 0;

  const resultsKey = audience
    ? audience.tierPlan.taxonomyIds.join(",")
    : "";

  function buildCandidatesByRole() {
    const byRole = retrieveByRole(rows, fields, typeFilter);
    const payload: Partial<Record<AudienceRole, TaxRow[]>> = {};
    let total = 0;
    for (const role of AUDIENCE_ROLES) {
      const list = (byRole[role] || []).map((c) => c.row);
      if (list.length) {
        payload[role] = list;
        total += list.length;
      }
    }
    return { byRole, payload, total };
  }

  async function call(history: ChatMessage[]) {
    setBusy(true);
    setError("");
    try {
      const { payload, total } = buildCandidatesByRole();
      if (!total) throw new Error("No candidates matched. Confirm Journey fields (pain, category, competitor, adjacent, stage).");

      const res = await fetch("/api/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          fields,
          candidatesByRole: payload,
          schema,
          prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }

      const nextMatches: Match[] = data.matches || [];
      const basket: BasketItem[] = [];
      for (const m of nextMatches) {
        const row = rowById.get(m.id);
        if (!row) continue;
        basket.push({
          row,
          why: m.why,
          confidence: m.confidence,
          role: m.role,
        });
      }
      setProposed(basket);
      setAudience(null);

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
    setProposed([]);
    setAudience(null);
    call([]);
  }

  function send(text: string) {
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(() => history);
    setPending([]);
    call(history);
  }

  function confirmBasket() {
    if (!proposed.length) return;
    const saved: SavedAudience = {
      basket: proposed,
      tierPlan: buildTierPlan(proposed),
    };
    setAudience(saved);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: `Confirmed basket of ${proposed.length}: ${proposed.map((b) => b.row.id).join(", ")}.`,
      },
    ]);
  }

  /** Remove from proposed basket (no auto-replace — user is shrinking the list). */
  function rejectFromProposed(id: string) {
    const current = proposed.find((b) => b.row.id === id);
    if (!current) return;
    setProposed((prev) => prev.filter((b) => b.row.id !== id));
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Rejected ${current.row.premade}. Removed from the proposed basket.`,
      },
    ]);
  }

  function rejectFromConfirmed(id: string) {
    if (!audience) return;
    const current = audience.basket.find((b) => b.row.id === id);
    if (!current) return;
    const nextBasket = audience.basket.filter((b) => b.row.id !== id);
    if (!nextBasket.length) {
      setAudience(null);
      setProposed([]);
    } else {
      setAudience({
        basket: nextBasket,
        tierPlan: buildTierPlan(nextBasket),
      });
      setProposed(nextBasket);
    }
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Rejected ${current.row.premade}. Removed from the confirmed basket.`,
      },
    ]);
  }

  const showProposal = !audience && proposed.length > 0;

  const footer = (
    <>
      {error && <div className="text-accent">{error}</div>}
      <Proposals
        proposals={pending}
        schema={schema}
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
        <ConfirmedResults
          key={resultsKey}
          audience={audience}
          onClear={() => {
            setAudience(null);
            setProposed([]);
          }}
          onReject={rejectFromConfirmed}
        />
      )}

      {showProposal && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink">Proposed basket · {proposed.length}</span>
            <button
              onClick={confirmBasket}
              className="rounded border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Confirm basket
            </button>
          </div>
          {proposed.map((item) => (
            <BasketRow key={item.row.id} item={item} onReject={() => rejectFromProposed(item.row.id)} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-6 py-3">
        <div className="flex-1 text-muted">
          {ready
            ? `${taxonomyName} · ${rows.length.toLocaleString()} audiences`
            : "No taxonomy loaded — set the file source in Admin"}
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
          placeholder={ready ? "Message" : "Set taxonomy in Admin to start"}
          onSend={send}
          footer={footer}
        />
      </div>
    </div>
  );
}
