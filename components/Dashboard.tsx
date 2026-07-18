"use client";

import { useState } from "react";
import CopyBox from "./CopyBox";
import { FIELDS, allDone, buildSummary } from "@/lib/fields";
import { buildAudienceSummary, buildProjectSummary } from "@/lib/summary";
import type { FieldMap, SavedAudience } from "@/lib/types";

export default function Dashboard({
  projectName,
  fields,
  audience,
  onOpen,
}: {
  projectName: string;
  fields: FieldMap;
  audience: SavedAudience | null;
  onOpen: (tab: "define" | "find") => void;
}) {
  const [projectSummary, setProjectSummary] = useState("");

  const confirmed = FIELDS.filter((f) => fields[f.key].status === "confirmed").length;
  const skipped = FIELDS.filter((f) => fields[f.key].status === "skipped").length;
  const defineDone = allDone(fields);

  const defineStatus = defineDone
    ? "Completed"
    : confirmed + skipped === 0
    ? "Not started"
    : "In progress";
  const findStatus = audience ? "Completed" : "Not started";

  return (
    <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px]">{projectName}</span>
          <span className="text-muted">Project Dashboard</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <div className="flex items-center justify-between">
              <span>Audience Define</span>
              <span className={defineDone ? "text-accent" : "text-muted"}>{defineStatus}</span>
            </div>
            <div className="text-muted">
              {confirmed} confirmed · {skipped} skipped · {FIELDS.length - confirmed - skipped}{" "}
              outstanding
            </div>
            <CopyBox value={buildSummary(fields)} height="h-64" />
            <div>
              <button
                onClick={() => onOpen("define")}
                className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
              >
                Open
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <div className="flex items-center justify-between">
              <span>Audience Find</span>
              <span className={audience ? "text-accent" : "text-muted"}>{findStatus}</span>
            </div>
            <div className="text-muted">
              {audience
                ? `${audience.row.premade} · confidence ${audience.confidence}`
                : "No audience confirmed"}
            </div>
            <CopyBox
              value={audience ? buildAudienceSummary(audience) : "No audience confirmed."}
              height="h-64"
            />
            <div>
              <button
                onClick={() => onOpen("find")}
                className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
              >
                Open
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <div className="flex items-center justify-between">
            <span>Project Summary</span>
            <button
              onClick={() => setProjectSummary(buildProjectSummary(projectName, fields, audience))}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              Create Summary
            </button>
          </div>
          {projectSummary && <CopyBox value={projectSummary} height="h-96" />}
        </div>
      </div>
    </div>
  );
}
