"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addShare, fetchProfiles, fetchShares, removeShare } from "@/lib/projects";

export default function SharePanel({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [profiles, setProfiles] = useState<{ id: string; email: string }[]>([]);
  const [shares, setShares] = useState<{ user_id: string; email: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [p, s] = await Promise.all([
      fetchProfiles(supabase, user.id),
      fetchShares(supabase, projectId),
    ]);
    setProfiles(p);
    setShares(s);
    const sharedIds = new Set(s.map((x) => x.user_id));
    const available = p.filter((x) => !sharedIds.has(x.id));
    setSelected(available[0]?.id || "");
  }

  useEffect(() => {
    refresh().catch(() => setError("Could not load users"));
  }, [projectId]);

  const sharedIds = new Set(shares.map((s) => s.user_id));
  const available = profiles.filter((p) => !sharedIds.has(p.id));

  async function share() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      await addShare(supabase, projectId, selected);
      await refresh();
    } catch {
      setError("Could not share");
    } finally {
      setBusy(false);
    }
  }

  async function unshare(userId: string) {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      await removeShare(supabase, projectId, userId);
      await refresh();
    } catch {
      setError("Could not remove share");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-5">
        <div className="flex items-start justify-between gap-3 pb-3">
          <div>
            <div className="text-ink">Share</div>
            <div className="truncate text-muted">{projectName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-2 py-1 text-muted hover:text-ink"
          >
            Close
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-muted"
            disabled={available.length === 0}
          >
            {available.length === 0 ? (
              <option value="">No other users</option>
            ) : (
              available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.email}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={share}
            className="rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {shares.length > 0 && (
          <div className="mt-4 flex flex-col gap-1">
            <div className="pb-1 text-muted">Shared with</div>
            {shares.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-b-0"
              >
                <span className="truncate">{s.email || s.user_id}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => unshare(s.user_id)}
                  className="shrink-0 rounded border border-line px-2 py-1 text-muted hover:text-accent disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="pt-3 text-accent">{error}</div>}
      </div>
    </div>
  );
}
