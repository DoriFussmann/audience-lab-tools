"use client";

import { useEffect, useRef, useState } from "react";
import Chat from "./Chat";
import CopyBox from "./CopyBox";
import DataPanel from "./DataPanel";
import Proposals from "./Proposals";
import StageReset from "./StageReset";
import { prepareDocument, type PreparedDocument } from "@/lib/document";
import { allDone, buildSummary, fieldByKey, type FieldSchema } from "@/lib/fields";
import type { ChatMessage, FieldMap, Proposal } from "@/lib/types";

function actionableProposals(proposals: Proposal[], snapshot: FieldMap) {
  return proposals.filter((p) => {
    const cur = snapshot[p.key];
    if (!cur) return false;
    const next = String(p.value || "").trim();
    if (!next) return false;
    if (cur.status === "empty") return true;
    return cur.value.trim() !== next;
  });
}

export default function AudienceDefine({
  fields,
  setFields,
  messages,
  setMessages,
  schema,
  prompt,
  resetBlockedMessage,
  onResetStage,
}: {
  fields: FieldMap;
  setFields: (updater: (prev: FieldMap) => FieldMap) => void;
  messages: ChatMessage[];
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  schema: FieldSchema;
  prompt: string;
  resetBlockedMessage?: string | null;
  onResetStage?: () => void;
}) {
  const [pending, setPending] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settlements = useRef<string[]>([]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const done = allDone(fields, schema);
  const byKey = fieldByKey(schema);
  const confirmedCount = schema.fields.filter(
    (f) => fields[f.key]?.status === "confirmed"
  ).length;
  const totalCount = schema.fields.length;

  async function call(history: ChatMessage[], document?: PreparedDocument) {
    const snapshot = fieldsRef.current;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/define", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          fields: snapshot,
          schema,
          prompt,
          ...(document ? { document } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
      setPending(actionableProposals(data.proposals as Proposal[], snapshot));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  // Opening turn: ask the model (via system prompt) — never inject a synthetic assistant message.
  useEffect(() => {
    if (messages.length) return;
    let cancelled = false;

    async function kickoff() {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/define", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [], fields, schema, prompt }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Request failed");
        if (data.reply) {
          setMessages((prev) =>
            prev.length ? prev : [{ role: "assistant", content: data.reply }]
          );
        }
        setPending(actionableProposals(data.proposals as Proposal[], fields));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    kickoff();
    return () => {
      cancelled = true;
    };
    // Only when the chat is empty; fields/schema/prompt are read once for the opener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  function send(text: string) {
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(() => history);
    setPending([]);
    call(history);
  }

  async function upload(file: File) {
    if (busy) return;
    setError("");
    try {
      const document = await prepareDocument(file);
      const label = `Uploaded ${document.name}`;
      const history: ChatMessage[] = [...messages, { role: "user", content: label }];
      setMessages(() => history);
      setPending([]);
      await call(history, document);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read document");
    }
  }

  function settle(key: string, value: string, status: "confirmed" | "skipped", inferred: boolean) {
    const next: FieldMap = {
      ...fieldsRef.current,
      [key]: {
        value: status === "confirmed" ? value.trim() : "",
        status,
        inferred: status === "confirmed" ? inferred : false,
      },
    };
    fieldsRef.current = next;
    setFields(() => next);
    const def = byKey[key];
    if (!def) return;
    settlements.current.push(
      status === "confirmed"
        ? `${def.label}${def.group ? ` (${def.group})` : ""}: ${value.trim()}`
        : `${def.label}${def.group ? ` (${def.group})` : ""}: skipped`
    );
  }

  function advance(remaining: Proposal[]) {
    setPending(remaining);
    if (remaining.length) return;
    const lines = settlements.current;
    settlements.current = [];
    if (!lines.length) return;
    const text = `Confirmed —\n${lines.join("\n")}`;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(() => history);
    call(history);
  }

  function onConfirm(p: Proposal, value: string) {
    if (!value.trim()) return;
    settle(p.key, value, "confirmed", !!p.inferred);
    advance(pending.filter((x) => x.key !== p.key));
  }

  function onSkip(p: Proposal) {
    settle(p.key, "", "skipped", false);
    advance(pending.filter((x) => x.key !== p.key));
  }

  function onConfirmAll(values: Record<string, string>) {
    for (const p of pending) {
      const v = values[p.key] ?? p.value;
      if (v.trim()) settle(p.key, v, "confirmed", !!p.inferred);
      else settle(p.key, "", "skipped", false);
    }
    advance([]);
  }

  const footer = (
    <>
      {error && <div className="text-accent">{error}</div>}
      <Proposals
        proposals={pending}
        schema={schema}
        onConfirm={onConfirm}
        onSkip={onSkip}
        onConfirmAll={onConfirmAll}
      />
      {done && (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <div>Audience Define complete. Chat below to revise any data point.</div>
          <CopyBox value={buildSummary(fields, schema)} />
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-line px-6 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-ink">Audience Define</div>
              <div className="text-muted">
                {confirmedCount} of {totalCount} data points confirmed
                {done
                  ? " · complete — chat to revise"
                  : " · type or upload a document"}
              </div>
            </div>
            {onResetStage && (
              <StageReset blockedMessage={resetBlockedMessage ?? null} onReset={onResetStage} />
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <Chat
            messages={messages}
            busy={busy}
            placeholder={done ? "Ask to update a data point…" : "Message"}
            onSend={send}
            onUpload={upload}
            footer={footer}
          />
        </div>
      </div>
      <div className="scroll-thin w-[442px] shrink-0 overflow-y-auto border-l border-line p-5">
        <div className="pb-4 text-muted">Data Points</div>
        <DataPanel fields={fields} schema={schema} />
      </div>
    </div>
  );
}
