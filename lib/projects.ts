import type { Project } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectListItem = Project & {
  ownerId: string;
  ownerEmail: string;
  isOwner: boolean;
};

type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  data: Project;
  created_at: string;
  updated_at: string;
  owner?: { email: string | null } | { email: string | null }[] | null;
};

function ownerEmailFrom(row: ProjectRow): string {
  const o = row.owner;
  if (!o) return "";
  if (Array.isArray(o)) return o[0]?.email || "";
  return o.email || "";
}

export function rowToProject(row: ProjectRow, userId: string): ProjectListItem {
  const data = row.data || ({} as Project);
  const updatedAt = new Date(row.updated_at).getTime();
  const createdAt = new Date(row.created_at).getTime();
  return {
    id: row.id,
    name: row.name || data.name || "Untitled",
    createdAt: data.createdAt || createdAt,
    updatedAt: data.updatedAt || updatedAt,
    define: data.define,
    find: data.find,
    letter: data.letter,
    fusion: data.fusion,
    audit: data.audit ?? null,
    ownerId: row.owner_id,
    ownerEmail: ownerEmailFrom(row),
    isOwner: row.owner_id === userId,
  };
}

export function projectPayload(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    define: project.define,
    find: project.find,
    letter: project.letter,
    fusion: project.fusion,
    audit: project.audit ?? null,
  };
}

export async function fetchProjects(
  supabase: SupabaseClient,
  userId: string
): Promise<ProjectListItem[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, owner_id, name, data, created_at, updated_at, owner:profiles!owner_id(email)")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as ProjectRow[] | null)?.map((row) => rowToProject(row, userId)) || [];
}

export async function upsertProject(
  supabase: SupabaseClient,
  project: ProjectListItem | Project,
  ownerId: string
): Promise<void> {
  const payload = projectPayload(project);
  const updatedAt = new Date(payload.updatedAt || Date.now()).toISOString();
  const createdAt = new Date(payload.createdAt || Date.now()).toISOString();

  // Update path: never send owner_id (shared users can edit; trigger + RLS lock ownership).
  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update({
      name: payload.name,
      data: payload,
      updated_at: updatedAt,
    })
    .eq("id", payload.id)
    .select("id");

  if (updateError) throw updateError;
  if (updated && updated.length > 0) return;

  const { error: insertError } = await supabase.from("projects").insert({
    id: payload.id,
    owner_id: ownerId,
    name: payload.name,
    data: payload,
    updated_at: updatedAt,
    created_at: createdAt,
  });
  if (insertError) throw insertError;
}

export async function deleteProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

export async function fetchProfiles(
  supabase: SupabaseClient,
  excludeUserId: string
): Promise<{ id: string; email: string }[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .neq("id", excludeUserId)
    .order("email");
  if (error) throw error;
  return (
    (data || [])
      .filter((p): p is { id: string; email: string } => !!p.email)
      .map((p) => ({ id: p.id, email: p.email }))
  );
}

export async function fetchShares(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ user_id: string; email: string }[]> {
  const { data, error } = await supabase
    .from("project_shares")
    .select("user_id, profile:profiles!user_id(email)")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data || []).map((row: {
    user_id: string;
    profile?: { email: string | null } | { email: string | null }[] | null;
  }) => {
    const p = row.profile;
    const email = Array.isArray(p) ? p[0]?.email || "" : p?.email || "";
    return { user_id: row.user_id, email };
  });
}

export async function addShare(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("project_shares")
    .insert({ project_id: projectId, user_id: userId });
  if (error) throw error;
}

export async function removeShare(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("project_shares")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw error;
}
