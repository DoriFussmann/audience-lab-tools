import type { Project } from "./types";

const KEY = "audience-app.projects";

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

export function saveProjects(projects: Project[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(projects));
  } catch {
    // ignore quota errors
  }
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
