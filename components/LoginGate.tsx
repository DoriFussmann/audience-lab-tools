"use client";

import { useState } from "react";

export default function LoginGate({ onContinue }: { onContinue: () => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const valid = name.trim().length > 0 && password.length > 0;

  function submit() {
    if (valid) onContinue();
  }

  return (
    <div className="flex h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#2c4a6e] px-14 py-12 text-white md:flex">
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

        <div className="relative text-[13px] text-white/50">Audience tools</div>

        <div className="relative max-w-md">
          <div className="text-5xl leading-tight tracking-tight">Drop The Mic</div>
          <p className="mt-5 text-[15px] leading-relaxed text-white/70">
            Define your audience. Find your crowd. Sketch who you&apos;re talking to, then match
            them to the rooms where your message lands.
          </p>
        </div>

        <p className="relative text-[13px] text-white/40">Built by Blueprint Intent</p>
      </div>

      <div className="flex w-full flex-col items-center justify-center px-6 md:w-1/2">
        <div className="mb-8 text-center md:hidden">
          <div className="text-2xl tracking-tight">Drop The Mic</div>
          <p className="mt-2 text-muted">Define your audience. Find your crowd.</p>
        </div>

        <div className="w-full max-w-[420px] rounded-xl border border-line p-6">
          <div className="pb-4">Sign in</div>

          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={name}
              placeholder="Name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="rounded-lg border border-line px-3 py-2"
            />
            <input
              type="password"
              value={password}
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="rounded-lg border border-line px-3 py-2"
            />
            <button
              disabled={!valid}
              onClick={submit}
              className="rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
