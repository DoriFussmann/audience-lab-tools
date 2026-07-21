"use client";

import { useState, type ReactNode } from "react";
import LoadingModal from "./LoadingModal";
import StageReset from "./StageReset";
import { allDone, type FieldSchema } from "@/lib/fields";
import { APPROACH_STYLES } from "@/lib/letter";
import {
  buildAudienceKit,
  buildLetterCopyAll,
} from "@/lib/summary";
import type {
  ApproachStyle,
  FieldMap,
  LetterEmail,
  LetterResult,
  LetterTierName,
  LetterTierSequence,
  ProjectLetter,
  SavedAudience,
} from "@/lib/types";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={
        "h-4 w-4 shrink-0 text-muted transition-transform duration-200 " +
        (open ? "rotate-180" : "")
      }
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ExpandPanel({
  open,
  children,
  className = "",
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`expand-panel ${open ? "open" : ""}`}>
      <div className="expand-panel-inner">
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}

function EmailBar({
  index,
  email,
  open,
  onToggle,
}: {
  index: number;
  email: LetterEmail;
  open: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `${email.subject}\n\n${email.body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border border-line">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 truncate text-ink">
          Email {index + 1} · Day {email.day} · {email.subject}
        </span>
        <Chevron open={open} />
      </button>
      <ExpandPanel open={open} className="flex flex-col gap-2 border-t border-line px-3 py-3">
        <div className="text-ink">{email.subject}</div>
        <div className="whitespace-pre-wrap text-muted leading-relaxed">{email.body}</div>
        <div>
          <button
            type="button"
            onClick={copy}
            className="rounded border border-line px-2 py-1 text-muted hover:text-ink"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </ExpandPanel>
    </div>
  );
}

function TierSequencePanel({
  sequence,
  rule,
  open,
  onToggle,
}: {
  sequence: LetterTierSequence;
  rule: string;
  open: boolean;
  onToggle: () => void;
}) {
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);

  return (
    <div className="border border-line">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 truncate text-ink">
          {sequence.tier} · {rule}
        </span>
        <Chevron open={open} />
      </button>
      <ExpandPanel open={open} className="flex flex-col gap-1.5 border-t border-line px-3 py-3">
        {sequence.emails.map((email, i) => (
          <EmailBar
            key={`${sequence.tier}-${i}-${email.day}`}
            index={i}
            email={email}
            open={expandedEmail === i}
            onToggle={() => setExpandedEmail((prev) => (prev === i ? null : i))}
          />
        ))}
      </ExpandPanel>
    </div>
  );
}

function slugFilename(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

export default function AudienceLetter({
  projectName,
  fields,
  audience,
  schema,
  prompt,
  letter,
  setLetter,
  onOpenTab,
  resetBlockedMessage,
  onResetStage,
}: {
  projectName: string;
  fields: FieldMap;
  audience: SavedAudience | null;
  schema: FieldSchema;
  prompt: string;
  letter: ProjectLetter;
  setLetter: (updater: (prev: ProjectLetter) => ProjectLetter) => void;
  onOpenTab: (tab: "define" | "find") => void;
  resetBlockedMessage?: string | null;
  onResetStage?: () => void;
}) {
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("Generating emails…");
  const [error, setError] = useState("");
  const [copyAllFlash, setCopyAllFlash] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [openTiers, setOpenTiers] = useState<Record<LetterTierName, boolean>>({
    Silver: false,
    Gold: false,
    Diamond: false,
  });

  const defineDone = allDone(fields, schema);
  const findDone = !!audience?.basket?.length;
  const ready = defineDone && findDone;
  const result = letter.result;

  function updateMaterials(patch: Partial<ProjectLetter["materials"]>) {
    setLetter((prev) => ({
      ...prev,
      materials: { ...prev.materials, ...patch },
    }));
  }

  function setStyle(style: ApproachStyle) {
    setLetter((prev) => ({ ...prev, style }));
  }

  async function generate(opts?: { feedback?: string }) {
    if (!ready || !audience || busy) return;
    const revision = opts?.feedback?.trim() || "";
    if (result && !revision) {
      const ok = window.confirm("Replace the current letter sequences?");
      if (!ok) return;
    }

    setBusyMessage(revision ? "Rewriting emails…" : "Generating emails…");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields,
          audience,
          materials: letter.materials,
          style: letter.style,
          schema,
          prompt,
          ...(revision
            ? { feedback: revision, previous: result }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      const next = data.result as LetterResult;
      setLetter((prev) => ({ ...prev, result: next, style: next.style || prev.style }));
      setOpenTiers({ Silver: false, Gold: false, Diamond: false });
      if (revision) setFeedback("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function submitFeedback() {
    const text = feedback.trim();
    if (!text || !result || busy) return;
    const ok = window.confirm("Re-generate all letter sequences with this feedback?");
    if (!ok) return;
    void generate({ feedback: text });
  }

  async function copyAll() {
    if (!result) return;
    await navigator.clipboard.writeText(buildLetterCopyAll(result));
    setCopyAllFlash(true);
    setTimeout(() => setCopyAllFlash(false), 1500);
  }

  function download() {
    if (!audience || !result) return;
    const text = buildAudienceKit(projectName, fields, audience, letter, schema);
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugFilename(projectName)}-audience-kit.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function tierRule(name: LetterTierName) {
    if (!audience) return "";
    const plan = audience.tierPlan;
    if (name === "Silver") return plan.silver.rule;
    if (name === "Gold") return plan.gold.rule;
    return plan.diamond.rule;
  }

  function sequenceFor(name: LetterTierName) {
    return result?.tiers.find((t) => t.tier === name) || null;
  }

  if (!ready) {
    return (
      <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl text-muted">
          {!defineDone ? (
            <>
              Complete{" "}
              <button
                type="button"
                onClick={() => onOpenTab("define")}
                className="text-ink underline decoration-line underline-offset-2 hover:text-accent"
              >
                Audience Define
              </button>{" "}
              first
            </>
          ) : (
            <>
              Complete{" "}
              <button
                type="button"
                onClick={() => onOpenTab("find")}
                className="text-ink underline decoration-line underline-offset-2 hover:text-accent"
              >
                Audience Find
              </button>{" "}
              first
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
      {busy && <LoadingModal message={busyMessage} />}
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-ink">Audience Letter</span>
          <div className="flex items-center gap-2">
            {onResetStage && (
              <StageReset blockedMessage={resetBlockedMessage ?? null} onReset={onResetStage} />
            )}
            {result && (
              <>
                <button
                  type="button"
                  onClick={copyAll}
                  className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
                >
                  {copyAllFlash ? "Copied" : "Copy all"}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
                >
                  Download
                </button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <button
            type="button"
            onClick={() => setMaterialsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-soft"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-ink">Materials</span>
              <span className="text-muted">optional</span>
            </span>
            <Chevron open={materialsOpen} />
          </button>
          <ExpandPanel open={materialsOpen} className="flex flex-col gap-3 border-t border-line px-4 py-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-muted">Links</span>
              <textarea
                value={letter.materials.links}
                onChange={(e) => updateMaterials({ links: e.target.value })}
                rows={3}
                placeholder={"https://…\none URL per line"}
                className="scroll-thin w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-muted">Snippets</span>
              <textarea
                value={letter.materials.snippets}
                onChange={(e) => updateMaterials({ snippets: e.target.value })}
                rows={4}
                placeholder="Testimonials, stats, client names"
                className="scroll-thin w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-ink"
              />
            </label>
          </ExpandPanel>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {APPROACH_STYLES.map((style) => {
            const active = letter.style === style;
            return (
              <button
                key={style}
                type="button"
                onClick={() => setStyle(style)}
                className={
                  "rounded-lg border px-3 py-1.5 " +
                  (active
                    ? "border-line bg-soft text-ink"
                    : "border-line text-muted hover:text-ink")
                }
              >
                {style}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="ml-auto rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink disabled:opacity-40"
          >
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>

        {error && <div className="text-accent">{error}</div>}

        {result && (
          <div className="flex flex-col gap-2">
            {sequenceFor("Silver") && (
              <TierSequencePanel
                sequence={sequenceFor("Silver")!}
                rule={tierRule("Silver")}
                open={openTiers.Silver}
                onToggle={() =>
                  setOpenTiers((prev) => ({ ...prev, Silver: !prev.Silver }))
                }
              />
            )}
            <div className="ml-5 flex flex-col gap-2">
              {sequenceFor("Gold") && (
                <TierSequencePanel
                  sequence={sequenceFor("Gold")!}
                  rule={tierRule("Gold")}
                  open={openTiers.Gold}
                  onToggle={() =>
                    setOpenTiers((prev) => ({ ...prev, Gold: !prev.Gold }))
                  }
                />
              )}
              <div className="ml-5">
                {sequenceFor("Diamond") && (
                  <TierSequencePanel
                    sequence={sequenceFor("Diamond")!}
                    rule={tierRule("Diamond")}
                    open={openTiers.Diamond}
                    onToggle={() =>
                      setOpenTiers((prev) => ({
                        ...prev,
                        Diamond: !prev.Diamond,
                      }))
                    }
                  />
                )}
              </div>
            </div>
            {result.note && <div className="pt-1 text-muted">{result.note}</div>}

            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
              <div className="text-ink">Feedback</div>
              <div className="text-muted">
                What should change? Submit to rewrite all sequences with your notes.
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                disabled={busy}
                placeholder="e.g. shorter subjects, warmer tone on Email 1, lead with the proof point sooner…"
                className="scroll-thin w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-ink disabled:bg-soft"
              />
              <div>
                <button
                  type="button"
                  onClick={submitFeedback}
                  disabled={busy || !feedback.trim()}
                  className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink disabled:opacity-40"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
