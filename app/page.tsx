"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Admin from "@/components/Admin";
import AudienceAudit from "@/components/AudienceAudit";
import AudienceDefine from "@/components/AudienceDefine";
import AudienceFind from "@/components/AudienceFind";
import AudienceFusion from "@/components/AudienceFusion";
import AudienceLetter from "@/components/AudienceLetter";
import Dashboard from "@/components/Dashboard";
import LoginGate from "@/components/LoginGate";
import ProjectGate from "@/components/ProjectGate";
import SharePanel from "@/components/SharePanel";
import {
  ensureTaxonomyCached,
  fetchProfile,
  removeTaxonomy,
  saveAppConfig,
  seedAppConfigIfEmpty,
  uploadTaxonomy,
  type ProfileInfo,
} from "@/lib/config";
import {
  DEFAULT_SCHEMA,
  emptyFields,
  reconcileFields,
  type FieldSchema,
} from "@/lib/fields";
import {
  emptyProjectFusion,
  markFusionNeedsReattach,
  normalizeProjectFusion,
  type FuseResult,
} from "@/lib/fusion";
import { emptyProjectLetter, normalizeProjectLetter } from "@/lib/letter";
import { normalizeSavedAudience } from "@/lib/match";
import {
  deleteProject as deleteProjectRow,
  fetchProjects,
  upsertProject,
  type ProjectListItem,
} from "@/lib/projects";
import {
  DEFAULT_PROMPTS,
  syncPromptsToSchema,
  type ChatPrompts,
} from "@/lib/prompts";
import {
  emptyDefine,
  emptyFind,
  resetBlockedBy,
  type StageId,
} from "@/lib/stageData";
import {
  clearLegacyProjects,
  hasMigratedLegacyProjects,
  loadProjects,
  markLegacyProjectsMigrated,
  newId,
} from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { parseTaxonomy } from "@/lib/taxonomy";
import type {
  ChatMessage,
  FieldMap,
  Project,
  ProjectAudit,
  ProjectFusion,
  ProjectLetter,
  SavedAudience,
  TaxRow,
} from "@/lib/types";

type Tab = "dashboard" | "define" | "find" | "letter" | "fusion" | "audit" | "admin";

const NAV: [Tab, string][] = [
  ["dashboard", "Project Dashboard"],
  ["define", "Audience Define"],
  ["find", "Audience Find"],
  ["letter", "Audience Letter"],
  ["fusion", "Audience Fusion"],
  ["audit", "Audience Audit"],
];

function navButtonClass(active: boolean) {
  return (
    "w-full rounded-lg border px-3 py-2 text-left " +
    (active
      ? "border-line bg-soft text-ink"
      : "border-line text-muted hover:bg-soft hover:text-ink")
  );
}

function toListItem(project: Project, ownerId: string, ownerEmail: string): ProjectListItem {
  return {
    ...project,
    ownerId,
    ownerEmail,
    isOwner: true,
  };
}

export default function Page() {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");

  const [schema, setSchema] = useState<FieldSchema>(DEFAULT_SCHEMA);
  const [prompts, setPrompts] = useState<ChatPrompts>(DEFAULT_PROMPTS);
  const [fields, setFieldsState] = useState<FieldMap>(() => emptyFields(DEFAULT_SCHEMA));
  const [defineMessages, setDefineMessagesState] = useState<ChatMessage[]>([]);
  const [findMessages, setFindMessagesState] = useState<ChatMessage[]>([]);
  const [audience, setAudience] = useState<SavedAudience | null>(null);
  const [letter, setLetterState] = useState<ProjectLetter>(() => emptyProjectLetter());
  const [fusion, setFusionState] = useState<ProjectFusion>(() => emptyProjectFusion());

  const [fuseResult, setFuseResult] = useState<FuseResult | null>(null);
  const [auditState, setAuditState] = useState<ProjectAudit | null>(null);

  const [rows, setRows] = useState<TaxRow[]>([]);
  const [taxonomyName, setTaxonomyName] = useState("");
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(false);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareProject, setShareProject] = useState<ProjectListItem | null>(null);
  const [fusionResetKey, setFusionResetKey] = useState(0);

  const current = projects.find((p) => p.id === currentId) || null;
  const skipSave = useRef(false);
  const isSuperAdmin = !!profile?.is_super_admin;

  const stageState = {
    fields,
    defineMessages,
    findMessages,
    audience,
    letter,
    fusion,
  };

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  // Auth session
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setHydrated(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Only update user state on genuine identity transitions.
      // TOKEN_REFRESHED and similar no-op events must NOT trigger a state
      // change: doing so produces a new User object reference, which causes
      // the [user] effect to re-run, resetting accountReady and reloading
      // projects — wiping any in-progress unsaved work on tab refocus.
      if (event === "SIGNED_OUT") {
        setUser(null);
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setUser((prev) => {
          const nextId = session?.user?.id ?? null;
          // Same identity — return the existing reference so React bails out
          // without a re-render and the project-load effect never re-fires.
          if ((prev?.id ?? null) === nextId) return prev;
          return session?.user ?? null;
        });
      }
      // TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED:
      // token rotated but same user — intentionally ignored to prevent spurious
      // project reloads on tab focus.
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load profile, config, projects after login
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProjects([]);
      setCurrentId("");
      setAccountReady(false);
      return;
    }

    let cancelled = false;
    setAccountReady(false);
    (async () => {
      try {
        const supabase = createClient();
        const prof = await fetchProfile(supabase, user.id);
        if (cancelled) return;
        setProfile(prof);

        const { schema: nextSchema, prompts: nextPrompts } = await seedAppConfigIfEmpty(
          supabase,
          !!prof?.is_super_admin
        );
        if (cancelled) return;
        setSchema(nextSchema);
        setPrompts(nextPrompts);

        let list = await fetchProjects(supabase, user.id);
        list = list.map((p) => ({
          ...p,
          define: {
            ...p.define,
            fields: reconcileFields(p.define?.fields || emptyFields(nextSchema), nextSchema),
          },
          find: {
            messages: p.find?.messages || [],
            audience: normalizeSavedAudience(p.find?.audience),
            taxonomyName: p.find?.taxonomyName || "",
          },
          letter: normalizeProjectLetter(p.letter),
          fusion: markFusionNeedsReattach(normalizeProjectFusion(p.fusion)),
        }));

        // One-time legacy localStorage import
        if (
          list.length === 0 &&
          !hasMigratedLegacyProjects()
        ) {
          const legacy = loadProjects();
          if (legacy.length > 0) {
            const ok = window.confirm(`Import ${legacy.length} local projects?`);
            markLegacyProjectsMigrated();
            if (ok) {
              const imported: ProjectListItem[] = [];
              for (const p of legacy) {
                const id = newId();
                const item = toListItem(
                  {
                    ...p,
                    id,
                    define: {
                      ...p.define,
                      fields: reconcileFields(p.define.fields, nextSchema),
                    },
                    find: {
                      messages: p.find?.messages || [],
                      audience: normalizeSavedAudience(p.find?.audience),
                      taxonomyName: p.find?.taxonomyName || "",
                    },
                    letter: normalizeProjectLetter(p.letter),
                    fusion: markFusionNeedsReattach(normalizeProjectFusion(p.fusion)),
                  },
                  user.id,
                  user.email || ""
                );
                await upsertProject(supabase, item, user.id);
                imported.push(item);
              }
              clearLegacyProjects();
              list = imported;
            }
          } else {
            markLegacyProjectsMigrated();
          }
        }

        if (cancelled) return;
        setProjects(list);

        // Warm taxonomy cache (Find will refresh on enter if needed)
        try {
          const tax = await ensureTaxonomyCached(supabase);
          if (!cancelled && tax) {
            setRows(tax.rows);
            setTaxonomyName(tax.name);
          }
        } catch {
          // Taxonomy may be empty until admin uploads.
        }
      } catch (e) {
        console.error(e);
        flash("Could not load account data");
      } finally {
        if (!cancelled) setAccountReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Autosave current project → Supabase
  useEffect(() => {
    if (!user || !currentId || !current) return;
    if (skipSave.current) {
      skipSave.current = false;
      setSaved(true);
      return;
    }
    setSaved(false);
    const t = setTimeout(async () => {
      const nextProject: ProjectListItem = {
        ...current,
        updatedAt: Date.now(),
        define: { fields, messages: defineMessages },
        find: { messages: findMessages, audience, taxonomyName },
        letter,
        fusion,
        audit: auditState,
        name: current.name,
      };
      setProjects((prev) => prev.map((p) => (p.id === currentId ? nextProject : p)));
      try {
        const supabase = createClient();
        await upsertProject(supabase, nextProject, current.ownerId);
        setSaved(true);
      } catch (e) {
        console.error(e);
        flash("Save failed");
        setSaved(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [currentId, fields, defineMessages, findMessages, audience, taxonomyName, letter, fusion, auditState, user]);

  // Refresh taxonomy when entering Find
  useEffect(() => {
    if (!user || tab !== "find") return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const tax = await ensureTaxonomyCached(supabase);
        if (cancelled || !tax) return;
        setRows(tax.rows);
        setTaxonomyName(tax.name);
      } catch {
        // keep existing cache
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, user]);

  // Non-admins cannot stay on admin tab
  useEffect(() => {
    if (tab === "admin" && !isSuperAdmin) setTab("dashboard");
  }, [tab, isSuperAdmin]);

  function applyProposal(key: string, value: string, inferred: boolean) {
    if (!value.trim()) return;
    setFieldsState((prev) => ({
      ...prev,
      [key]: { value: value.trim(), status: "confirmed", inferred },
    }));
  }

  async function onFile(file: File) {
    if (!isSuperAdmin) return;
    setLoadingTaxonomy(true);
    try {
      const parsed = await parseTaxonomy(file);
      const supabase = createClient();
      await uploadTaxonomy(supabase, file, parsed);
      setRows(parsed);
      setTaxonomyName(file.name);
      flash(`${parsed.length.toLocaleString()} audiences loaded`);
    } catch {
      flash("Could not read that file");
    } finally {
      setLoadingTaxonomy(false);
    }
  }

  async function onRemoveTaxonomy() {
    if (!isSuperAdmin) return;
    if (!window.confirm("Remove the shared taxonomy file for all users?")) return;
    setLoadingTaxonomy(true);
    try {
      const supabase = createClient();
      await removeTaxonomy(supabase);
      setRows([]);
      setTaxonomyName("");
      flash("Taxonomy removed");
    } catch {
      flash("Could not remove taxonomy");
    } finally {
      setLoadingTaxonomy(false);
    }
  }

  async function saveAdmin(nextSchema: FieldSchema, nextPrompts: ChatPrompts) {
    if (!isSuperAdmin) return;
    const synced = syncPromptsToSchema(nextPrompts, nextSchema);
    setSchema(nextSchema);
    setPrompts(synced);
    try {
      const supabase = createClient();
      await saveAppConfig(supabase, nextSchema, synced);
    } catch {
      flash("Could not save admin settings");
      return;
    }
    setFieldsState((prev) => reconcileFields(prev, nextSchema));
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        define: {
          ...p.define,
          fields: reconcileFields(p.define.fields, nextSchema),
        },
        updatedAt: p.id === currentId ? Date.now() : p.updatedAt,
      }))
    );
    flash("Admin settings saved");
  }

  async function createProject(name: string) {
    if (!user) return;
    const id = newId();
    const project = toListItem(
      {
        id,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        define: { fields: emptyFields(schema), messages: [] },
        find: { messages: [], audience: null, taxonomyName },
        letter: emptyProjectLetter(),
        fusion: emptyProjectFusion(),
        audit: null,
      },
      user.id,
      user.email || profile?.email || ""
    );
    try {
      const supabase = createClient();
      await upsertProject(supabase, project, user.id);
    } catch {
      flash("Could not create project");
      return;
    }
    setProjects((prev) => [project, ...prev]);
    skipSave.current = true;
    setFieldsState(project.define.fields);
    setDefineMessagesState([]);
    setFindMessagesState([]);
    setAudience(null);
    setLetterState(emptyProjectLetter());
    setFusionState(emptyProjectFusion());
    setAuditState(null);
    setFuseResult(null);
    setCurrentId(project.id);
    setMenuOpen(false);
    setTab("define");
  }

  function openProject(p: ProjectListItem) {
    skipSave.current = true;
    setFieldsState(reconcileFields(p.define.fields, schema));
    setDefineMessagesState(p.define.messages);
    setFindMessagesState(p.find.messages);
    setAudience(normalizeSavedAudience(p.find.audience));
    setLetterState(normalizeProjectLetter(p.letter));
    setFusionState(markFusionNeedsReattach(normalizeProjectFusion(p.fusion)));
    setAuditState(p.audit ?? null);
    setFuseResult(null);
    setCurrentId(p.id);
    setMenuOpen(false);
    setTab("dashboard");
  }

  async function deleteProject(p: ProjectListItem) {
    if (!p.isOwner) return;
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    try {
      const supabase = createClient();
      await deleteProjectRow(supabase, p.id);
    } catch {
      flash("Could not delete project");
      return;
    }
    setProjects((prev) => prev.filter((x) => x.id !== p.id));
    if (currentId === p.id) setCurrentId("");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setProjects([]);
    setCurrentId("");
  }

  function resetStage(stage: StageId) {
    const blocked = resetBlockedBy(stage, stageState);
    if (blocked) return;
    skipSave.current = false;
    if (stage === "define") {
      const empty = emptyDefine(schema);
      setFieldsState(empty.fields);
      setDefineMessagesState(empty.messages);
    } else if (stage === "find") {
      const empty = emptyFind(taxonomyName);
      setFindMessagesState(empty.messages);
      setAudience(empty.audience);
    } else if (stage === "letter") {
      setLetterState(emptyProjectLetter());
    } else if (stage === "fusion") {
      setFusionState(emptyProjectFusion());
      setFusionResetKey((k) => k + 1);
      setFuseResult(null);
    }
  }

  if (!hydrated) return null;

  if (!user) {
    return <LoginGate />;
  }

  if (!accountReady) return null;

  if (!current) {
    return (
      <div className="mx-auto h-screen max-w-[1280px]">
        <div className="flex h-12 items-center justify-end gap-4 border-b border-line px-4">
          <span className="text-muted">{toast}</span>
          <span className="truncate text-muted">{user.email}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
          >
            Sign out
          </button>
        </div>
        <ProjectGate
          projects={projects}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
          onShare={(p) => setShareProject(p)}
        />
        {shareProject && (
          <SharePanel
            projectId={shareProject.id}
            projectName={shareProject.name}
            onClose={() => setShareProject(null)}
          />
        )}
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
                      "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-soft " +
                      (p.id === currentId ? "bg-soft" : "")
                    }
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="truncate">{p.name}</span>
                      {p.find.audience?.basket?.length ? (
                        <span className="pl-2 text-muted">✓</span>
                      ) : null}
                    </div>
                    {!p.isOwner && (
                      <span className="text-[12px] text-muted">
                        shared by {p.ownerEmail || "another user"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-muted">{toast}</span>
          {!current.isOwner && (
            <span className="text-muted">
              shared by {current.ownerEmail || "another user"}
            </span>
          )}
          {current.isOwner && (
            <button
              type="button"
              onClick={() => setShareProject(current)}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Share
            </button>
          )}
          <span className="text-muted">{saved ? "Saved" : "Saving…"}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
          >
            Sign out
          </button>
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
          {isSuperAdmin && (
            <div className="mt-auto pt-3">
              <button onClick={() => setTab("admin")} className={navButtonClass(tab === "admin")}>
                Admin
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          {tab === "dashboard" && (
            <Dashboard
              projectName={current.name}
              fields={fields}
              audience={audience}
              letter={letter}
              fusion={fusion}
              audit={auditState}
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
              resetBlockedMessage={resetBlockedBy("define", stageState)}
              onResetStage={() => resetStage("define")}
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
              resetBlockedMessage={resetBlockedBy("find", stageState)}
              onResetStage={() => resetStage("find")}
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
              resetBlockedMessage={resetBlockedBy("letter", stageState)}
              onResetStage={() => resetStage("letter")}
            />
          )}
          {tab === "fusion" && (
            <AudienceFusion
              projectName={current.name}
              audience={audience}
              fusion={fusion}
              setFusion={setFusionState}
              onOpenTab={setTab}
              resetBlockedMessage={resetBlockedBy("fusion", stageState)}
              onResetStage={() => resetStage("fusion")}
              resetKey={fusionResetKey}
              onFused={setFuseResult}
            />
          )}
          {tab === "audit" && (
            <AudienceAudit
              fuseResult={fuseResult}
              audience={audience}
              fields={fields}
              schema={schema}
              prompt={prompts.audit || ""}
              persistedAudit={auditState}
              onAuditResult={setAuditState}
            />
          )}
          {tab === "admin" && isSuperAdmin && (
            <Admin
              schema={schema}
              prompts={prompts}
              fields={current ? fields : null}
              onSave={saveAdmin}
              taxonomyName={taxonomyName}
              rowsCount={rows.length}
              loadingTaxonomy={loadingTaxonomy}
              onFile={onFile}
              onRemoveTaxonomy={onRemoveTaxonomy}
            />
          )}
        </div>
      </div>

      {shareProject && (
        <SharePanel
          projectId={shareProject.id}
          projectName={shareProject.name}
          onClose={() => setShareProject(null)}
        />
      )}
    </div>
  );
}
