"use client";

import { useState } from "react";

export default function CopyBox({
  value,
  height = "h-72",
  label = "Copy",
}: {
  value: string;
  height?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        readOnly
        value={value}
        className={`scroll-thin w-full resize-none rounded-lg border border-line bg-white p-3 text-ink leading-relaxed ${height}`}
      />
      <div>
        <button
          onClick={copy}
          className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink"
        >
          {copied ? "Copied" : label}
        </button>
      </div>
    </div>
  );
}
