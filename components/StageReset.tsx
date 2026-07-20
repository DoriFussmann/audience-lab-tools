"use client";

import { useState } from "react";

/** Minimal reset control: blocked message or confirm + callback. */
export default function StageReset({
  blockedMessage,
  onReset,
}: {
  blockedMessage: string | null;
  onReset: () => void;
}) {
  const [note, setNote] = useState("");

  function click() {
    if (blockedMessage) {
      setNote(blockedMessage);
      return;
    }
    setNote("");
    if (!window.confirm("Reset this stage? This cannot be undone.")) return;
    onReset();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={click}
        className="rounded-lg border border-line px-2.5 py-1 text-[13px] text-muted hover:text-ink"
      >
        Reset stage
      </button>
      {note && <div className="text-[13px] text-muted">{note}</div>}
    </div>
  );
}
