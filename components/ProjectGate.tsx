"use client";

import { useState } from "react";
import type { Project } from "@/lib/types";

export default function ProjectGate({
  projects,
  onCreate,
  onOpen,
}: {
  projects: Project[];
  onCreate: (name: string) => void;
  onOpen: (p: Project) => void;
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
                <button
                  key={p.id}
                  onClick={() => onOpen(p)}
                  className="flex w-full items-center justify-between border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-soft"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="pl-3 text-muted">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
