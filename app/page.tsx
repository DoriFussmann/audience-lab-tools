"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import AudienceDefine from "@/components/AudienceDefine";
import AudienceFind from "@/components/AudienceFind";
import Dashboard from "@/components/Dashboard";
import ProjectGate from "@/components/ProjectGate";
import { emptyFields } from "@/lib/fields";
import { loadProjects, newId, saveProjects } from "@/lib/store";
import { buildIndex, parseTaxonomy, type Index } from "@/lib/taxonomy";
import type { ChatMessage, FieldMap, Project, SavedAudience, TaxRow } from "@/lib/types";

const TAX_ROWS = "audience-app.taxonomy.rows";
const TAX_NAME = "audience-app.taxonomy.name";

type Tab = "dashboard" | "define" | "find";

const NAV: [Tab, string][] = [
  ["dashboard", "Project Dashboard"],
  ["define", "Audience Define"],
  ["find", "Audience Find"],
];

export default function Page() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");

  const [fields, setFieldsState] = useState<FieldMap>(emptyFields());
  const [defineMessages, setDefineMessagesState] = useState<ChatMessage[]>([]);
  const [findMessages, setFindMessagesState] = useState<ChatMessage[]>([]);
  const [audience, setAudience] = useState<SavedAudience | null>(null);

  const [rows, setRows] = useState<TaxRow[]>([]);
  const [taxonomyName, setTaxonomyName] = useState("");
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const index: Index | null = useMemo(() => (rows.length ? buildIndex(rows) : null), [rows]);
  const current = projects.find((p) => p.id === currentId) || null;
  const skipSave = useRef(false);

  useEffect(() => {
    setProjects(loadProjects());
    setHydrated(true);
    (async () => {
      try {
        const cached = await get<TaxRow[]>(TAX_ROWS);
        const name = await get<string>(TAX_NAME);
        if (cached && cached.length) {
          setRows(cached);
          setTaxonomyName(name || "taxonomy");
        }
      } catch {
        // ignore
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
              }
            : p
        );
        saveProjects(next);
        return next;
      });
      setSaved(true);
    }, 400);
    return () => clearTimeout(t);
  }, [currentId, fields, defineMessages, findMessages, audience, taxonomyName]);

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

  function createProject(name: string) {
    const project: Project = {
      id: newId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      define: { fields: emptyFields(), messages: [] },
      find: { messages: [], audience: null, taxonomyName },
    };
    const next = [...projects, project];
    setProjects(next);
    saveProjects(next);
    skipSave.current = true;
    setFieldsState(project.define.fields);
    setDefineMessagesState([]);
    setFindMessagesState([]);
    setAudience(null);
    setCurrentId(project.id);
    setMenuOpen(false);
    setTab("define");
  }

  function openProject(p: Project) {
    skipSave.current = true;
    setFieldsState(p.define.fields);
    setDefineMessagesState(p.define.messages);
    setFindMessagesState(p.find.messages);
    setAudience(p.find.audience);
    setCurrentId(p.id);
    setMenuOpen(false);
    setTab("dashboard");
  }

  if (!hydrated) return null;

  if (!current) {
    return <ProjectGate projects={projects} onCreate={createProject} onOpen={openProject} />;
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5"
          >
            <span>{current.name}</span>
            <span className="text-muted">▾</span>
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-10 z-40 w-64 rounded-lg border border-line bg-white py-1">
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
                    {p.find.audience && <span className="pl-2 text-muted">✓</span>}
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
        <div className="flex w-52 shrink-0 flex-col gap-1 border-r border-line p-3">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                "rounded-lg px-3 py-2 text-left " +
                (tab === id ? "bg-soft text-ink" : "text-muted hover:text-ink")
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          {tab === "dashboard" && (
            <Dashboard
              projectName={current.name}
              fields={fields}
              audience={audience}
              onOpen={setTab}
            />
          )}
          {tab === "define" && (
            <AudienceDefine
              fields={fields}
              setFields={setFieldsState}
              messages={defineMessages}
              setMessages={setDefineMessagesState}
            />
          )}
          {tab === "find" && (
            <AudienceFind
              fields={fields}
              applyProposal={applyProposal}
              messages={findMessages}
              setMessages={setFindMessagesState}
              rows={rows}
              index={index}
              taxonomyName={taxonomyName}
              loadingTaxonomy={loadingTaxonomy}
              onFile={onFile}
              audience={audience}
              setAudience={setAudience}
            />
          )}
        </div>
      </div>
    </div>
  );
}
