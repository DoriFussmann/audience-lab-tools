"use client";

export default function LoadingModal({ message = "Working…" }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white px-8 py-6 shadow-sm">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink" />
        <span className="text-muted">{message}</span>
      </div>
    </div>
  );
}
