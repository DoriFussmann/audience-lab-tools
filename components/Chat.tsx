"use client";

import { useEffect, useRef, useState } from "react";
import { acceptAttribute } from "@/lib/document";
import type { ChatMessage } from "@/lib/types";

export default function Chat({
  messages,
  busy,
  disabled,
  placeholder,
  onSend,
  onUpload,
  footer,
}: {
  messages: ChatMessage[];
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  /** When set, composer supports drag-drop and file attach. */
  onUpload?: (file: File) => void;
  footer?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy, footer]);

  function submit() {
    const v = text.trim();
    if (!v || busy || disabled) return;
    setText("");
    onSend(v);
  }

  function takeFile(file: File | undefined | null) {
    if (!file || !onUpload || busy || disabled) return;
    onUpload(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={
        onUpload
          ? (e) => {
              e.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={
        onUpload
          ? (e) => {
              e.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) {
                dragDepth.current = 0;
                setDragging(false);
              }
            }
          : undefined
      }
      onDragOver={
        onUpload
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          : undefined
      }
      onDrop={
        onUpload
          ? (e) => {
              e.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              takeFile(e.dataTransfer.files?.[0]);
            }
          : undefined
      }
    >
      {onUpload && dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/85">
          <div className="rounded-lg border border-dashed border-accent bg-soft px-6 py-4 text-center text-muted">
            <div className="text-ink">Drop document to scan</div>
            <div className="pt-1">PDF, text, or image — max 10 MB</div>
          </div>
        </div>
      )}

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
          {onUpload && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={acceptAttribute()}
                className="hidden"
                onChange={(e) => takeFile(e.target.files?.[0])}
              />
              <button
                type="button"
                title="Upload document"
                disabled={busy || disabled}
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40"
              >
                Attach
              </button>
            </>
          )}
          <textarea
            value={text}
            rows={1}
            disabled={disabled}
            placeholder={
              onUpload
                ? `${placeholder} — or drop a document`
                : placeholder
            }
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
