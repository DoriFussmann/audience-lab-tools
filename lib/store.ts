import type { Project } from "./types";

const KEY = "audience-app.projects";
const MIGRATED_KEY = "audience-app.projects-migrated";

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLegacyProjects() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function hasMigratedLegacyProjects(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MIGRATED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLegacyProjectsMigrated() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // ignore
  }
}

/** @deprecated Prefer crypto.randomUUID() for DB-backed projects. */
export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
