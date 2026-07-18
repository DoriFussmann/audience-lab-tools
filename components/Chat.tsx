"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

export default function Chat({
  messages,
  busy,
  disabled,
  placeholder,
  onSend,
  footer,
}: {
  messages: ChatMessage[];
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  footer?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy, footer]);

  function submit() {
    const v = text.trim();
    if (!v || busy || disabled) return;
    setText("");
    onSend(v);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-lg bg-soft px-3 py-2 text-ink"
                    : "max-w-[85%] whitespace-pre-wrap text-ink"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div className="text-muted">…</div>}
          {footer}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-line px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={text}
            rows={1}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-40 flex-1 resize-none rounded-lg border border-line px-3 py-2 disabled:bg-soft"
          />
          <button
            onClick={submit}
            disabled={busy || disabled || !text.trim()}
            className="rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
