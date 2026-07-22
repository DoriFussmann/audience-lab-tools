"use client";

import type { DefineReportData } from "@/lib/defineReport";

/** Landscape slide preview of the Definition Summary PDF (cover + content). */
export default function DefineReportPreview({ data }: { data: DefineReportData }) {
  return (
    <div className="scroll-thin flex max-h-[min(42rem,72vh)] flex-col gap-4 overflow-y-auto pr-1">
      {/* Cover — landscape slide */}
      <div className="relative aspect-[11/8.5] w-full overflow-hidden rounded-lg bg-[#2c4a6e] text-white shadow-sm">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 20% 30%, rgba(120,160,200,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 85% 80%, rgba(40,70,110,0.55), transparent 50%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between px-10 py-8">
          <div className="text-[12px] text-white/50">Audience tools</div>
          <div className="max-w-md">
            <div className="text-[34px] leading-tight tracking-tight">Drop The Mic</div>
            <p className="mt-3 text-[14px] leading-relaxed text-white/70">
              Define your audience. Find your crowd.
            </p>
          </div>
          <div className="flex items-end justify-between gap-6">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="text-[12px] text-white/55">Audience Definition Report</div>
              <div className="truncate text-[20px] tracking-tight">{data.clientName}</div>
              {data.clientName !== data.projectName && (
                <div className="truncate text-[12px] text-white/70">
                  Project: {data.projectName}
                </div>
              )}
              <div className="text-[12px] text-white/70">{data.dateLabel}</div>
            </div>
            <div className="shrink-0 text-[11px] text-white/40">Built by Blueprint Intent</div>
          </div>
        </div>
      </div>

      {/* Content — matching landscape slide; scrolls inside if dense */}
      <div className="flex aspect-[11/8.5] w-full flex-col overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <div className="shrink-0 px-10 pt-7">
          <div className="text-[15px] text-ink">Definition Summary</div>
          <div className="mt-1 text-[11px] text-muted">
            {data.clientName} · {data.dateLabel}
          </div>
          <div className="mt-3 border-t border-line" />
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-10 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {data.sections.map((section) => (
              <div key={section.label} className="min-w-0">
                <div className="pb-1.5 text-[10px] uppercase tracking-wide text-muted">
                  {section.label}
                </div>
                <ul className="flex flex-col gap-1">
                  {section.bullets.map((b) => (
                    <li key={b.label} className="text-[11px] leading-snug text-ink">
                      <span className="text-muted">• </span>
                      <span>{b.label}: </span>
                      <span className="break-words text-muted">{b.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
