"use client";

import { useEffect, useMemo, useState } from "react";
import PromptEditor from "./PromptEditor";
import {
  DEFAULT_SCHEMA,
  slugify,
  type CategoryDef,
  type FieldDef,
  type FieldSchema,
} from "@/lib/fields";
import {
  DEFAULT_PROMPTS,
  availableTokens,
  syncPromptsToSchema,
  type ChatPrompts,
} from "@/lib/prompts";
import type { FieldMap } from "@/lib/types";

function cloneSchema(schema: FieldSchema): FieldSchema {
  return {
    categories: schema.categories.map((c) => ({ ...c })),
    fields: schema.fields.map((f) => ({ ...f })),
  };
}

function clonePrompts(prompts: ChatPrompts): ChatPrompts {
  return { define: prompts.define, find: prompts.find, letter: prompts.letter };
}

export default function Admin({
  schema,
  prompts,
  fields,
  onSave,
  taxonomyName,
  rowsCount,
  loadingTaxonomy,
  onFile,
  onRemoveTaxonomy,
}: {
  schema: FieldSchema;
  prompts: ChatPrompts;
  fields: FieldMap | null;
  onSave: (schema: FieldSchema, prompts: ChatPrompts) => void;
  taxonomyName: string;
  rowsCount: number;
  loadingTaxonomy: boolean;
  onFile: (file: File) => void;
  onRemoveTaxonomy?: () => void;
}) {
  const [draftSchema, setDraftSchema] = useState(() => cloneSchema(schema));
  const [draftPrompts, setDraftPrompts] = useState(() => clonePrompts(prompts));
  const [dragging, setDragging] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraftSchema(cloneSchema(schema));
    setDraftPrompts(clonePrompts(prompts));
    setDirty(false);
  }, [schema, prompts]);

  const defineTokens = useMemo(
    () => availableTokens("define", draftSchema),
    [draftSchema]
  );
  const findTokens = useMemo(() => availableTokens("find", draftSchema), [draftSchema]);
  const letterTokens = useMemo(() => availableTokens("letter", draftSchema), [draftSchema]);

  function touchSchema(next: FieldSchema) {
    const synced = syncPromptsToSchema(draftPrompts, next);
    setDraftSchema(next);
    setDraftPrompts(synced);
    setDirty(true);
  }

  function touchPrompts(next: ChatPrompts) {
    setDraftPrompts(next);
    setDirty(true);
  }

  function addCategory() {
    const used = new Set(draftSchema.categories.map((c) => c.id));
    const id = slugify("category", used);
    touchSchema({
      ...draftSchema,
      categories: [...draftSchema.categories, { id, label: "New category" }],
    });
  }

  function updateCategory(id: string, patch: Partial<CategoryDef>) {
    touchSchema({
      ...draftSchema,
      categories: draftSchema.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }

  function removeCategory(id: string) {
    touchSchema({
      categories: draftSchema.categories.filter((c) => c.id !== id),
      fields: draftSchema.fields.filter((f) => f.category !== id),
    });
  }

  function addField(categoryId: string) {
    const used = new Set(draftSchema.fields.map((f) => f.key));
    const key = slugify("data_point", used);
    const field: FieldDef = {
      key,
      label: "New data point",
      category: categoryId,
      group: null,
      optional: false,
    };
    touchSchema({ ...draftSchema, fields: [...draftSchema.fields, field] });
  }

  function updateField(key: string, patch: Partial<FieldDef>) {
    touchSchema({
      ...draftSchema,
      fields: draftSchema.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    });
  }

  function removeField(key: string) {
    touchSchema({
      ...draftSchema,
      fields: draftSchema.fields.filter((f) => f.key !== key),
    });
  }

  function save() {
    if (!draftSchema.categories.length || !draftSchema.fields.length) return;
    if (
      !draftPrompts.define.trim() ||
      !draftPrompts.find.trim() ||
      !draftPrompts.letter.trim()
    ) {
      return;
    }
    const synced = syncPromptsToSchema(draftPrompts, draftSchema);
    onSave(draftSchema, synced);
    setDraftPrompts(synced);
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  function resetDefaults() {
    setDraftSchema(cloneSchema(DEFAULT_SCHEMA));
    setDraftPrompts(clonePrompts(DEFAULT_PROMPTS));
    setDirty(true);
  }

  const ready = rowsCount > 0;

  return (
    <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[15px]">Admin</div>
            <div className="pt-1 text-muted">Global settings for all projects</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={resetDefaults}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Reset defaults
            </button>
            <button
              type="button"
              onClick={save}
              disabled={
                !dirty ||
                !draftSchema.categories.length ||
                !draftSchema.fields.length ||
                !draftPrompts.define.trim() ||
                !draftPrompts.find.trim() ||
                !draftPrompts.letter.trim()
              }
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
        {(dirty || savedFlash) && (
          <div className="-mt-4 text-muted">{savedFlash ? "Saved" : "Unsaved changes"}</div>
        )}

        <section className="flex flex-col gap-3">
          <div>
            <div>Audience taxonomy file source</div>
            <div className="pt-1 text-muted">
              Source file used by Audience Find. One taxonomy for all projects.
            </div>
          </div>
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
              "flex items-center justify-center rounded-lg border border-dashed px-4 py-6 " +
              (dragging ? "border-accent bg-soft" : "border-line")
            }
          >
            <label className="cursor-pointer text-muted">
              {loadingTaxonomy
                ? "Loading taxonomy…"
                : ready
                ? `${taxonomyName} · ${rowsCount.toLocaleString()} audiences · drop or click to replace`
                : "Drag & drop taxonomy file (.xlsx, .xls, .csv)"}
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
          {ready && onRemoveTaxonomy && (
            <button
              type="button"
              onClick={onRemoveTaxonomy}
              className="self-start rounded-lg border border-line px-3 py-1.5 text-muted hover:text-accent"
            >
              Remove taxonomy
            </button>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <div>Chat data points</div>
            <div className="pt-1 text-muted">
              Categories and fields collected in Audience Define. Editing these updates the prompt
              pills below — removed fields are dropped from prompts automatically.
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {draftSchema.categories.map((cat) => {
              const fields = draftSchema.fields.filter((f) => f.category === cat.id);
              return (
                <div key={cat.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-center gap-2 pb-3">
                    <input
                      value={cat.label}
                      onChange={(e) => updateCategory(cat.id, { label: e.target.value })}
                      className="flex-1 rounded-lg border border-line px-3 py-1.5"
                      placeholder="Category name"
                    />
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      disabled={draftSchema.categories.length <= 1}
                      className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {fields.map((f) => (
                      <div
                        key={f.key}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2"
                      >
                        <input
                          value={f.label}
                          onChange={(e) => updateField(f.key, { label: e.target.value })}
                          className="min-w-[160px] flex-1 rounded border border-line px-2 py-1"
                          placeholder="Data point"
                        />
                        <input
                          value={f.group ?? ""}
                          onChange={(e) =>
                            updateField(f.key, {
                              group: e.target.value.trim() ? e.target.value : null,
                            })
                          }
                          className="w-40 rounded border border-line px-2 py-1 text-muted"
                          placeholder="Group (optional)"
                        />
                        <label className="flex items-center gap-1.5 text-muted">
                          <input
                            type="checkbox"
                            className="accent-check"
                            checked={!f.optional}
                            onChange={(e) => updateField(f.key, { optional: !e.target.checked })}
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => removeField(f.key)}
                          disabled={draftSchema.fields.length <= 1}
                          className="rounded border border-line px-2 py-1 text-muted hover:text-ink disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => addField(cat.id)}
                      className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
                    >
                      Add data point
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <button
              type="button"
              onClick={addCategory}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Add category
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-8 border-t border-line pt-8">
          <PromptEditor
            label="Audience Define prompt"
            description="System prompt for the define chat. Use dynamic inserts for live field state."
            value={draftPrompts.define}
            onChange={(define) => touchPrompts({ ...draftPrompts, define })}
            tokens={defineTokens}
            schema={draftSchema}
            fields={fields}
          />
          <PromptEditor
            label="Audience Find prompt"
            description="System prompt for the find chat. Candidate list and definition summary are filled at runtime."
            value={draftPrompts.find}
            onChange={(find) => touchPrompts({ ...draftPrompts, find })}
            tokens={findTokens}
            schema={draftSchema}
            fields={fields}
          />
          <PromptEditor
            label="Audience Letter prompt"
            description="System prompt for letter sequence generation. Project data is sent with each generate call; optional inserts can be added below."
            value={draftPrompts.letter}
            onChange={(letter) => touchPrompts({ ...draftPrompts, letter })}
            tokens={letterTokens}
            schema={draftSchema}
            fields={fields}
          />
        </section>
      </div>
    </div>
  );
}
