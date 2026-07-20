"use client";

import { useState } from "react";
import type { ProjectListItem } from "@/lib/projects";

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export default function ProjectGate({
  projects,
  onCreate,
  onOpen,
  onDelete,
  onShare,
}: {
  projects: ProjectListItem[];
  onCreate: (name: string) => void;
  onOpen: (p: ProjectListItem) => void;
  onDelete: (p: ProjectListItem) => void;
  onShare?: (p: ProjectListItem) => void;
}) {
  const [name, setName] = useState("");
  const taken = projects.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  const valid = name.trim().length > 0 && !taken;

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-[420px] rounded-xl border border-line p-6">
        <div className="pb-4">New Project</div>

        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            placeholder="Project name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) onCreate(name.trim());
            }}
            className="flex-1 rounded-lg border border-line px-3 py-2"
          />
          <button
            disabled={!valid}
            onClick={() => onCreate(name.trim())}
            className="rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40"
          >
            Create
          </button>
        </div>
        {taken && <div className="pt-2 text-accent">Name already used</div>}

        {projects.length > 0 && (
          <>
            <div className="pb-2 pt-6 text-muted">Open existing</div>
            <div className="scroll-thin max-h-64 overflow-y-auto rounded-lg border border-line">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="group flex w-full items-center border-b border-line last:border-b-0 hover:bg-soft"
                >
                  <button
                    onClick={() => onOpen(p)}
                    className="flex min-w-0 flex-1 flex-col items-start px-3 py-2 text-left"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 pl-3 text-muted">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {!p.isOwner && (
                      <span className="pt-0.5 text-[12px] text-muted">
                        shared by {p.ownerEmail || "another user"}
                      </span>
                    )}
                  </button>
                  {p.isOwner && onShare && (
                    <button
                      type="button"
                      aria-label={`Share ${p.name}`}
                      title="Share project"
                      onClick={() => onShare(p)}
                      className="mr-1 shrink-0 rounded px-2 py-1.5 text-[12px] text-muted opacity-0 hover:text-ink group-hover:opacity-100"
                    >
                      Share
                    </button>
                  )}
                  {p.isOwner && (
                    <button
                      type="button"
                      aria-label={`Delete ${p.name}`}
                      title="Delete project"
                      onClick={() => onDelete(p)}
                      className="mr-2 shrink-0 rounded p-1.5 text-muted opacity-0 hover:text-accent group-hover:opacity-100"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
