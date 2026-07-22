import Chevron from "./Chevron";

export default function CollapsibleCard({
  title,
  meta,
  status,
  statusAccent,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  status?: string;
  statusAccent?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-soft"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-ink">{title}</span>
          {meta && <span className="truncate text-muted">{meta}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {status && (
            <span className={statusAccent ? "text-accent" : "text-muted"}>{status}</span>
          )}
          <Chevron open={open} />
        </span>
      </button>
      <div className={`expand-panel ${open ? "open" : ""}`}>
        <div className="expand-panel-inner">
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
