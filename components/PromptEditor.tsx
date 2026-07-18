"use client";

import { useMemo, useRef, useState } from "react";
import { emptyFields, reconcileFields, type FieldSchema } from "@/lib/fields";
import {
  insertToken,
  previewPromptSegments,
  promptContainsToken,
  removeToken,
  resolvePreviewToken,
  tokenHelpText,
  truncatePreview,
  type PromptToken,
} from "@/lib/prompts";
import type { FieldMap } from "@/lib/types";

export default function PromptEditor({
  label,
  description,
  value,
  onChange,
  tokens,
  schema,
  fields,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (next: string) => void;
  tokens: PromptToken[];
  schema: FieldSchema;
  fields: FieldMap | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"template" | "preview">("template");
  const [fieldsOpen, setFieldsOpen] = useState(false);

  const previewFields = useMemo(
    () => (fields ? reconcileFields(fields, schema) : emptyFields(schema)),
    [fields, schema]
  );
  const previewCtx = useMemo(
    () => ({ schema, fields: previewFields }),
    [schema, previewFields]
  );
  const segments = useMemo(
    () => previewPromptSegments(value, previewCtx),
    [value, previewCtx]
  );

  function add(token: PromptToken) {
    const el = ref.current;
    const at = el && mode === "template" ? el.selectionStart : undefined;
    const next = insertToken(value, token.token, at);
    onChange(next);
    if (mode !== "template") return;
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = (at ?? next.length - token.token.length) + token.token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function drop(token: PromptToken) {
    onChange(removeToken(value, token.id));
  }

  const systemTokens = tokens.filter((t) => t.kind === "system");
  const dataTokens = tokens.filter((t) => t.kind === "data_point");
  const usedDataCount = dataTokens.filter((t) => promptContainsToken(value, t.id)).length;

  const groupedFields = useMemo(() => {
    return schema.categories
      .map((cat) => ({
        category: cat,
        tokens: dataTokens.filter((t) => {
          const field = schema.fields.find((f) => f.key === t.fieldKey);
          return field?.category === cat.id;
        }),
      }))
      .filter((g) => g.tokens.length > 0);
  }, [schema, dataTokens]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div>{label}</div>
        <div className="pt-1 text-muted">{description}</div>
      </div>

      <div className="flex items-center gap-3 text-[13px]">
        <button
          type="button"
          onClick={() => setMode("template")}
          className={mode === "template" ? "text-ink" : "text-muted hover:text-ink"}
        >
          Template
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          className={mode === "preview" ? "text-ink" : "text-muted hover:text-ink"}
        >
          Preview
        </button>
      </div>

      {mode === "template" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="min-h-[280px] w-full resize-y rounded-lg border border-line px-3 py-2 font-mono text-[13px] leading-relaxed text-ink"
        />
      ) : (
        <div className="min-h-[280px] w-full whitespace-pre-wrap rounded-lg border border-line bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink">
          {segments.length === 0 ? (
            <span className="text-muted">—</span>
          ) : (
            segments.map((seg, i) =>
              seg.type === "text" ? (
                <span key={i}>{seg.text}</span>
              ) : (
                <span key={i} className="rounded-sm bg-check/15 px-0.5">
                  {seg.text}
                </span>
              )
            )
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-soft/40 px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {systemTokens.map((t) => {
            const used = promptContainsToken(value, t.id);
            return (
              <TokenPill
                key={t.id}
                token={t}
                used={used}
                help={tokenHelpText(t)}
                preview={truncatePreview(resolvePreviewToken(t.id, previewCtx))}
                onAdd={() => add(t)}
                onRemove={() => drop(t)}
              />
            );
          })}
        </div>

        {dataTokens.length > 0 && (
          <div className="border-t border-line pt-2">
            <button
              type="button"
              onClick={() => setFieldsOpen((o) => !o)}
              className="flex w-full items-center gap-2 text-left text-[13px] text-muted hover:text-ink"
            >
              <span>Field inserts</span>
              {usedDataCount > 0 && (
                <span className="h-1 w-1 rounded-full bg-ink/50" aria-hidden />
              )}
              <span className="ml-auto text-[12px]">{fieldsOpen ? "−" : "+"}</span>
            </button>

            <div className={`expand-panel ${fieldsOpen ? "open" : ""}`}>
              <div className="expand-panel-inner">
                <div className="flex flex-col gap-3 pt-2">
                  {groupedFields.map(({ category, tokens: catTokens }) => (
                    <div key={category.id} className="flex flex-col gap-1.5">
                      <div className="text-[12px] text-muted">{category.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {catTokens.map((t) => {
                          const used = promptContainsToken(value, t.id);
                          return (
                            <TokenPill
                              key={t.id}
                              token={t}
                              used={used}
                              usedMarker
                              help={tokenHelpText(t)}
                              preview={truncatePreview(
                                resolvePreviewToken(t.id, previewCtx)
                              )}
                              onAdd={() => add(t)}
                              onRemove={() => drop(t)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TokenPill({
  token,
  used,
  usedMarker,
  help,
  preview,
  onAdd,
  onRemove,
}: {
  token: PromptToken;
  used: boolean;
  usedMarker?: boolean;
  help: string;
  preview: string;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <span
      className={
        "group relative inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] " +
        (used ? "border-ink bg-white text-ink" : "border-line bg-white text-muted")
      }
    >
      {usedMarker && used && (
        <span className="h-1 w-1 shrink-0 rounded-full bg-ink" aria-hidden />
      )}
      <button
        type="button"
        onClick={used ? undefined : onAdd}
        disabled={used}
        className="text-left disabled:cursor-default"
      >
        {token.label}
        <span className="pl-1 text-muted">{token.token}</span>
      </button>
      {used && (
        <button
          type="button"
          onClick={onRemove}
          className="pl-1 text-muted hover:text-ink"
        >
          ×
        </button>
      )}
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden w-56 rounded-md border border-line bg-white px-2 py-1.5 text-[11px] leading-snug shadow-sm group-hover:block">
        <span className="block text-ink">{help}</span>
        <span className="mt-0.5 block truncate text-muted">{preview}</span>
      </span>
    </span>
  );
}
