"use client";

import { useEffect, useRef, useState } from "react";
import Chat from "./Chat";
import CopyBox from "./CopyBox";
import DataPanel from "./DataPanel";
import Proposals from "./Proposals";
import { FIELD_BY_KEY, allDone, buildSummary } from "@/lib/fields";
import type { ChatMessage, FieldMap, Proposal } from "@/lib/types";

const OPENER =
  "What are you selling, and what is the core value proposition?";

export default function AudienceDefine({
  fields,
  setFields,
  messages,
  setMessages,
}: {
  fields: FieldMap;
  setFields: (updater: (prev: FieldMap) => FieldMap) => void;
  messages: ChatMessage[];
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}) {
  const [pending, setPending] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settlements = useRef<string[]>([]);
  const done = allDone(fields);

  useEffect(() => {
    if (!messages.length) {
      setMessages(() => [{ role: "assistant", content: OPENER }]);
    }
  }, [messages.length, setMessages]);

  async function call(history: ChatMessage[]) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/define", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
      const fresh = (data.proposals as Proposal[]).filter(
        (p) => fields[p.key] && fields[p.key].status === "empty"
      );
      setPending(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function send(text: string) {
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(() => history);
    setPending([]);
    call(history);
  }

  function settle(key: string, value: string, status: "confirmed" | "skipped", inferred: boolean) {
    setFields((prev) => ({
      ...prev,
      [key]: {
        value: status === "confirmed" ? value.trim() : "",
        status,
        inferred: status === "confirmed" ? inferred : false,
      },
    }));
    const def = FIELD_BY_KEY[key];
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
        onConfirm={onConfirm}
        onSkip={onSkip}
        onConfirmAll={onConfirmAll}
      />
      {done && (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <div>Audience Define complete. All data points collected.</div>
          <CopyBox value={buildSummary(fields)} />
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <Chat
          messages={messages}
          busy={busy}
          placeholder="Message"
          onSend={send}
          footer={footer}
        />
      </div>
      <div className="scroll-thin w-[442px] shrink-0 overflow-y-auto border-l border-line p-5">
        <div className="pb-4 text-muted">Data Points</div>
        <DataPanel fields={fields} />
      </div>
    </div>
  );
}
