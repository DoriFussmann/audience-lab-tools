import type { Project, ProjectAudit, ProjectFusion } from "./types";
import { emptyProjectFusion, normalizeProjectFusion } from "./fusion";

const KEY = "audience-app.projects";
const MIGRATED_KEY = "audience-app.projects-migrated";
const LAST_PROJECT_KEY = "audience-app.last-project-id";
const STAGE_RESULTS_KEY = "audience-app.stage-results";

/** Lightweight per-project bottom-lines (no lead rows / CSVs). */
export type StageResultsSnapshot = {
  fusion: ProjectFusion;
  audit: ProjectAudit | null;
  updatedAt: number;
};

type StageResultsMap = Record<string, StageResultsSnapshot>;

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

export function loadLastProjectId(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY) || "";
  } catch {
    return "";
  }
}

export function saveLastProjectId(id: string) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(LAST_PROJECT_KEY, id);
    else window.localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // ignore
  }
}

function readStageResultsMap(): StageResultsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STAGE_RESULTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StageResultsMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStageResults(
  projectId: string,
  fusion: ProjectFusion,
  audit: ProjectAudit | null
) {
  if (typeof window === "undefined" || !projectId) return;
  try {
    const map = readStageResultsMap();
    map[projectId] = {
      fusion,
      audit,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(STAGE_RESULTS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function loadStageResults(projectId: string): StageResultsSnapshot | null {
  if (!projectId) return null;
  const snap = readStageResultsMap()[projectId];
  if (!snap || typeof snap !== "object") return null;
  return {
    fusion: normalizeProjectFusion(snap.fusion),
    audit: snap.audit ?? null,
    updatedAt: Number(snap.updatedAt) || 0,
  };
}

export function clearStageResults(projectId: string) {
  if (typeof window === "undefined" || !projectId) return;
  try {
    const map = readStageResultsMap();
    if (!(projectId in map)) return;
    delete map[projectId];
    window.localStorage.setItem(STAGE_RESULTS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** Prefer server data; fall back to local bottom-lines if the server copy is empty. */
export function mergeStageResults(
  projectId: string,
  fusion: ProjectFusion | undefined,
  audit: ProjectAudit | null | undefined
): { fusion: ProjectFusion; audit: ProjectAudit | null } {
  const serverFusion = normalizeProjectFusion(fusion);
  const serverAudit = audit ?? null;
  const local = loadStageResults(projectId);
  if (!local) {
    return { fusion: serverFusion, audit: serverAudit };
  }

  const nextFusion =
    serverFusion.summary != null
      ? serverFusion
      : local.fusion.summary != null
        ? local.fusion
        : serverFusion.attachments.length
          ? serverFusion
          : local.fusion.attachments.length
            ? local.fusion
            : serverFusion;

  return { fusion: nextFusion, audit: serverAudit ?? local.audit };
}

/** @deprecated Prefer crypto.randomUUID() for DB-backed projects. */
export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
