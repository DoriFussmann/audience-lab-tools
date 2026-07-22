import { useState } from "react";
import Chevron from "../components/Chevron";
import CollapsibleCard from "../components/CollapsibleCard";

const NAV = [
  "Project Dashboard",
  "Audience Define",
  "Audience Find",
  "Audience Letter",
  "Audience Fusion",
  "Audience Audit",
] as const;

function navButtonClass(active: boolean) {
  return (
    "w-full rounded-lg border px-3 py-2 text-left " +
    (active
      ? "border-line bg-soft text-ink"
      : "border-line text-muted hover:bg-soft hover:text-ink")
  );
}

const CARDS = [
  {
    id: "define",
    title: "Audience Define",
    meta: "18 confirmed · 2 skipped · 0 left · 4/4 categories",
    status: "Completed",
    statusAccent: true,
    body: "Define data points and category progress appear here.",
  },
  {
    id: "find",
    title: "Audience Find",
    meta: "6 in basket · 3 tier audiences",
    status: "Completed",
    statusAccent: true,
    body: "Confirmed basket and tier plan appear here.",
  },
  {
    id: "letter",
    title: "Audience Letter",
    meta: "No sequences generated",
    status: "Not started",
    statusAccent: false,
    body: "Generated email sequences appear here.",
  },
  {
    id: "fusion",
    title: "Audience Fusion",
    meta: "Attach lead CSVs and fuse",
    status: "Not started",
    statusAccent: false,
    body: "Fused lead summary appears here.",
  },
  {
    id: "audit",
    title: "Audience Audit",
    meta: "Requires fusion bottom-lines (run Fusion once)",
    status: "Not run",
    statusAccent: false,
    body: "Audit results appear here.",
  },
  {
    id: "summary",
    title: "Project Summary",
    meta: "Generate when define and find are ready",
    status: "Not created",
    statusAccent: false,
    body: "Copyable project summary appears here.",
  },
] as const;

export default function DashboardPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<(typeof NAV)[number]>("Project Dashboard");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="mx-auto flex h-screen max-w-[1280px] flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pr-4">
        <div className="relative w-52 shrink-0 px-3">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5"
          >
            <span className="truncate">Sample Project</span>
            <Chevron open={menuOpen} />
          </button>

          {menuOpen && (
            <div className="absolute left-3 right-3 top-10 z-40 rounded-lg border border-line bg-white py-1">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="w-full px-3 py-2 text-left text-muted hover:bg-soft hover:text-ink"
              >
                New project
              </button>
              <div className="my-1 border-t border-line" />
              <div className="scroll-thin max-h-72 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full flex-col items-start bg-soft px-3 py-2 text-left hover:bg-soft"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="truncate">Sample Project</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
          >
            Share
          </button>
          <span className="text-muted">Saved</span>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-52 shrink-0 flex-col border-r border-line p-3">
          <div className="flex flex-col gap-3">
            {NAV.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setActiveNav(label)}
                className={navButtonClass(activeNav === label)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          <div className="scroll-thin h-full overflow-y-auto px-8 py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <div className="flex items-baseline justify-between pb-2">
                <span className="text-[15px] text-ink">Sample Project</span>
                <span className="text-muted">Project Dashboard</span>
              </div>

              {CARDS.map((card) => (
                <CollapsibleCard
                  key={card.id}
                  title={card.title}
                  meta={card.meta}
                  status={card.status}
                  statusAccent={card.statusAccent}
                  open={!!openSections[card.id]}
                  onToggle={() => toggle(card.id)}
                >
                  <div className="text-muted">{card.body}</div>
                  <div>
                    <button
                      type="button"
                      className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
                    >
                      Open
                    </button>
                  </div>
                </CollapsibleCard>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
