"use client";

import { useEffect, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import Admin from "@/components/Admin";
import AudienceDefine from "@/components/AudienceDefine";
import AudienceFind from "@/components/AudienceFind";
import AudienceLetter from "@/components/AudienceLetter";
import Dashboard from "@/components/Dashboard";
import LoginGate from "@/components/LoginGate";
import ProjectGate from "@/components/ProjectGate";
import {
  DEFAULT_SCHEMA,
  emptyFields,
  normalizeSchema,
  reconcileFields,
  schemaNeedsMigration,
  type FieldSchema,
} from "@/lib/fields";
import { emptyProjectLetter, normalizeProjectLetter } from "@/lib/letter";
import { normalizeSavedAudience } from "@/lib/match";
import {
  DEFAULT_PROMPTS,
  migratePrompts,
  normalizePrompts,
  syncPromptsToSchema,
  type ChatPrompts,
} from "@/lib/prompts";
import { loadProjects, newId, saveProjects } from "@/lib/store";
import { parseTaxonomy } from "@/lib/taxonomy";
import type {
  ChatMessage,
  FieldMap,
  Project,
  ProjectLetter,
  SavedAudience,
  TaxRow,
} from "@/lib/types";

const TAX_ROWS = "audience-app.taxonomy.rows";
const TAX_NAME = "audience-app.taxonomy.name";
const FIELD_SCHEMA = "audience-app.field-schema";
const CHAT_PROMPTS = "audience-app.chat-prompts";

type Tab = "dashboard" | "define" | "find" | "letter" | "admin";

const NAV: [Tab, string][] = [
  ["dashboard", "Project Dashboard"],
  ["define", "Audience Define"],
  ["find", "Audience Find"],
  ["letter", "Audience Letter"],
];

function navButtonClass(active: boolean) {
  return (
    "w-full rounded-lg border px-3 py-2 text-left " +
    (active
      ? "border-line bg-soft text-ink"
      : "border-line text-muted hover:bg-soft hover:text-ink")
  );
}

export default function Page() {
  const [hydrated, setHydrated] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");

  const [schema, setSchema] = useState<FieldSchema>(DEFAULT_SCHEMA);
  const [prompts, setPrompts] = useState<ChatPrompts>(DEFAULT_PROMPTS);
  const [fields, setFieldsState] = useState<FieldMap>(() => emptyFields(DEFAULT_SCHEMA));
  const [defineMessages, setDefineMessagesState] = useState<ChatMessage[]>([]);
  const [findMessages, setFindMessagesState] = useState<ChatMessage[]>([]);
  const [audience, setAudience] = useState<SavedAudience | null>(null);
  const [letter, setLetterState] = useState<ProjectLetter>(() => emptyProjectLetter());

  const [rows, setRows] = useState<TaxRow[]>([]);
  const [taxonomyName, setTaxonomyName] = useState("");
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const current = projects.find((p) => p.id === currentId) || null;
  const skipSave = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const cached = await get<TaxRow[]>(TAX_ROWS);
        const name = await get<string>(TAX_NAME);
        if (cached && cached.length) {
          setRows(cached);
          setTaxonomyName(name || "taxonomy");
        }

        let nextSchema = normalizeSchema(await get(FIELD_SCHEMA)) || DEFAULT_SCHEMA;
        let schemaMigrated = false;
        if (schemaNeedsMigration(nextSchema)) {
          nextSchema = DEFAULT_SCHEMA;
          schemaMigrated = true;
        }

        const rawPrompts = normalizePrompts(await get(CHAT_PROMPTS)) || DEFAULT_PROMPTS;
        const migratedPrompts = migratePrompts(rawPrompts);
        const nextPrompts = syncPromptsToSchema(migratedPrompts, nextSchema);
        const promptsMigrated =
          nextPrompts.define !== rawPrompts.define ||
          nextPrompts.find !== rawPrompts.find ||
          nextPrompts.letter !== (rawPrompts.letter || "");

        if (schemaMigrated) await set(FIELD_SCHEMA, nextSchema);
        if (schemaMigrated || promptsMigrated) await set(CHAT_PROMPTS, nextPrompts);

        setSchema(nextSchema);
        setPrompts(nextPrompts);

        const updated = loadProjects().map((p) => ({
          ...p,
          define: {
            ...p.define,
            fields: reconcileFields(p.define.fields, nextSchema),
          },
          find: {
            ...p.find,
            audience: normalizeSavedAudience(p.find?.audience),
          },
          letter: normalizeProjectLetter(p.letter),
        }));
        saveProjects(updated);
        setProjects(updated);
      } catch {
        setProjects(
          loadProjects().map((p) => ({
            ...p,
            letter: normalizeProjectLetter(p.letter),
            find: {
              ...p.find,
              audience: normalizeSavedAudience(p.find?.audience),
            },
          }))
        );
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Autosave: once a project is open, all collected data saves to it.
  useEffect(() => {
    if (!currentId) return;
    if (skipSave.current) {
      skipSave.current = false;
      setSaved(true);
      return;
    }
    setSaved(false);
    const t = setTimeout(() => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === currentId
            ? {
                ...p,
                updatedAt: Date.now(),
                define: { fields, messages: defineMessages },
                find: { messages: findMessages, audience, taxonomyName },
                letter,
              }
            : p
        );
        saveProjects(next);
        return next;
      });
      setSaved(true);
    }, 400);
    return () => clearTimeout(t);
  }, [currentId, fields, defineMessages, findMessages, audience, taxonomyName, letter]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  function applyProposal(key: string, value: string, inferred: boolean) {
    if (!value.trim()) return;
    setFieldsState((prev) => ({
      ...prev,
      [key]: { value: value.trim(), status: "confirmed", inferred },
    }));
  }

  async function onFile(file: File) {
    setLoadingTaxonomy(true);
    try {
      const parsed = await parseTaxonomy(file);
      setRows(parsed);
      setTaxonomyName(file.name);
      await set(TAX_ROWS, parsed);
      await set(TAX_NAME, file.name);
      flash(`${parsed.length.toLocaleString()} audiences loaded`);
    } catch {
      flash("Could not read that file");
    } finally {
      setLoadingTaxonomy(false);
    }
  }

  async function saveAdmin(nextSchema: FieldSchema, nextPrompts: ChatPrompts) {
    const synced = syncPromptsToSchema(nextPrompts, nextSchema);
    setSchema(nextSchema);
    setPrompts(synced);
    await set(FIELD_SCHEMA, nextSchema);
    await set(CHAT_PROMPTS, synced);
    setFieldsState((prev) => reconcileFields(prev, nextSchema));
    setProjects((prev) => {
      const updated = prev.map((p) => ({
        ...p,
        define: {
          ...p.define,
          fields: reconcileFields(p.define.fields, nextSchema),
        },
        updatedAt: p.id === currentId ? Date.now() : p.updatedAt,
      }));
      saveProjects(updated);
      return updated;
    });
    flash("Admin settings saved");
  }

  function createProject(name: string) {
    const project: Project = {
      id: newId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      define: { fields: emptyFields(schema), messages: [] },
      find: { messages: [], audience: null, taxonomyName },
      letter: emptyProjectLetter(),
    };
    const next = [...projects, project];
    setProjects(next);
    saveProjects(next);
    skipSave.current = true;
    setFieldsState(project.define.fields);
    setDefineMessagesState([]);
    setFindMessagesState([]);
    setAudience(null);
    setLetterState(emptyProjectLetter());
    setCurrentId(project.id);
    setMenuOpen(false);
    setTab("define");
  }

  function openProject(p: Project) {
    skipSave.current = true;
    setFieldsState(reconcileFields(p.define.fields, schema));
    setDefineMessagesState(p.define.messages);
    setFindMessagesState(p.find.messages);
    setAudience(normalizeSavedAudience(p.find.audience));
    setLetterState(normalizeProjectLetter(p.letter));
    setCurrentId(p.id);
    setMenuOpen(false);
    setTab("dashboard");
  }

  function deleteProject(p: Project) {
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    const next = projects.filter((x) => x.id !== p.id);
    setProjects(next);
    saveProjects(next);
  }

  if (!hydrated) return null;

  if (!signedIn) {
    return <LoginGate onContinue={() => setSignedIn(true)} />;
  }

  if (!current) {
    return (
      <div className="mx-auto h-screen max-w-[1280px]">
        <ProjectGate
          projects={projects}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-screen max-w-[1280px] flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pr-4">
        <div className="relative w-52 shrink-0 px-3">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5"
          >
            <span className="truncate">{current.name}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={
                "h-4 w-4 shrink-0 text-muted transition-transform duration-200 " +
                (menuOpen ? "rotate-180" : "")
              }
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute left-3 right-3 top-10 z-40 rounded-lg border border-line bg-white py-1">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setCurrentId("");
                }}
                className="w-full px-3 py-2 text-left text-muted hover:bg-soft hover:text-ink"
              >
                New project
              </button>
              {projects.length > 0 && <div className="my-1 border-t border-line" />}
              <div className="scroll-thin max-h-72 overflow-y-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openProject(p)}
                    className={
                      "flex w-full items-center justify-between px-3 py-2 text-left hover:bg-soft " +
                      (p.id === currentId ? "bg-soft" : "")
                    }
                  >
                    <span className="truncate">{p.name}</span>
                    {p.find.audience?.basket?.length ? (
                      <span className="pl-2 text-muted">✓</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-muted">{toast}</span>
          <span className="text-muted">{saved ? "Saved" : "Saving…"}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-52 shrink-0 flex-col border-r border-line p-3">
          <div className="flex flex-col gap-3">
            {NAV.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={navButtonClass(tab === id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-auto pt-3">
            <button onClick={() => setTab("admin")} className={navButtonClass(tab === "admin")}>
              Admin
            </button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          {tab === "dashboard" && (
            <Dashboard
              projectName={current.name}
              fields={fields}
              audience={audience}
              letter={letter}
              schema={schema}
              onOpen={setTab}
            />
          )}
          {tab === "define" && (
            <AudienceDefine
              fields={fields}
              setFields={setFieldsState}
              messages={defineMessages}
              setMessages={setDefineMessagesState}
              schema={schema}
              prompt={prompts.define}
            />
          )}
          {tab === "find" && (
            <AudienceFind
              fields={fields}
              applyProposal={applyProposal}
              messages={findMessages}
              setMessages={setFindMessagesState}
              rows={rows}
              taxonomyName={taxonomyName}
              audience={audience}
              setAudience={setAudience}
              schema={schema}
              prompt={prompts.find}
            />
          )}
          {tab === "letter" && (
            <AudienceLetter
              projectName={current.name}
              fields={fields}
              audience={audience}
              schema={schema}
              prompt={prompts.letter}
              letter={letter}
              setLetter={setLetterState}
              onOpenTab={setTab}
            />
          )}
          {tab === "admin" && (
            <Admin
              schema={schema}
              prompts={prompts}
              fields={current ? fields : null}
              onSave={saveAdmin}
              taxonomyName={taxonomyName}
              rowsCount={rows.length}
              loadingTaxonomy={loadingTaxonomy}
              onFile={onFile}
            />
          )}
        </div>
      </div>
    </div>
  );
}
