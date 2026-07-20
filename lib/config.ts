import type { SupabaseClient } from "@supabase/supabase-js";
import { get, set } from "idb-keyval";
import {
  DEFAULT_SCHEMA,
  normalizeSchema,
  schemaNeedsMigration,
  type FieldSchema,
} from "./fields";
import {
  DEFAULT_PROMPTS,
  migratePrompts,
  normalizePrompts,
  syncPromptsToSchema,
  type ChatPrompts,
} from "./prompts";
import { parseTaxonomy } from "./taxonomy";
import type { TaxRow } from "./types";

export const TAX_ROWS = "audience-app.taxonomy.rows";
export const TAX_NAME = "audience-app.taxonomy.name";
export const TAX_META = "audience-app.taxonomy.meta";
export const FIELD_SCHEMA = "audience-app.field-schema";
export const CHAT_PROMPTS = "audience-app.chat-prompts";

export const TAXONOMY_OBJECT_PATH = "current";

export type TaxonomyMeta = {
  updatedAt: string;
  etag: string;
  name: string;
};

export type ProfileInfo = {
  id: string;
  email: string;
  is_super_admin: boolean;
};

export async function fetchProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileInfo | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileInfo | null;
}

export async function loadAppConfig(
  supabase: SupabaseClient
): Promise<{ schema: FieldSchema; prompts: ChatPrompts; seeded: boolean }> {
  const { data, error } = await supabase
    .from("app_config")
    .select("id, data")
    .in("id", ["field_schema", "prompts"]);
  if (error) throw error;

  const map = new Map((data || []).map((r: { id: string; data: unknown }) => [r.id, r.data]));
  const hasSchema = map.has("field_schema");
  const hasPrompts = map.has("prompts");

  let schema = normalizeSchema(map.get("field_schema")) || null;
  let prompts = normalizePrompts(map.get("prompts")) || null;

  return {
    schema: schema || DEFAULT_SCHEMA,
    prompts: prompts
      ? syncPromptsToSchema(migratePrompts(prompts), schema || DEFAULT_SCHEMA)
      : DEFAULT_PROMPTS,
    seeded: hasSchema && hasPrompts,
  };
}

/** Super-admin only: seed empty app_config from IndexedDB or code defaults. */
export async function seedAppConfigIfEmpty(
  supabase: SupabaseClient,
  isSuperAdmin: boolean
): Promise<{ schema: FieldSchema; prompts: ChatPrompts }> {
  const loaded = await loadAppConfig(supabase);
  if (loaded.seeded || !isSuperAdmin) {
    // Still apply local schema migration heuristics for in-memory use.
    let schema = loaded.schema;
    if (schemaNeedsMigration(schema)) schema = DEFAULT_SCHEMA;
    const prompts = syncPromptsToSchema(migratePrompts(loaded.prompts), schema);
    return { schema, prompts };
  }

  let nextSchema = normalizeSchema(await get(FIELD_SCHEMA)) || DEFAULT_SCHEMA;
  if (schemaNeedsMigration(nextSchema)) nextSchema = DEFAULT_SCHEMA;

  const rawPrompts = normalizePrompts(await get(CHAT_PROMPTS)) || DEFAULT_PROMPTS;
  const nextPrompts = syncPromptsToSchema(migratePrompts(rawPrompts), nextSchema);
  const now = new Date().toISOString();

  const { error } = await supabase.from("app_config").upsert([
    { id: "field_schema", data: nextSchema, updated_at: now },
    { id: "prompts", data: nextPrompts, updated_at: now },
  ]);
  if (error) throw error;

  return { schema: nextSchema, prompts: nextPrompts };
}

export async function saveAppConfig(
  supabase: SupabaseClient,
  schema: FieldSchema,
  prompts: ChatPrompts
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("app_config").upsert([
    { id: "field_schema", data: schema, updated_at: now },
    { id: "prompts", data: prompts, updated_at: now },
  ]);
  if (error) throw error;
}

async function readTaxonomyObject(
  supabase: SupabaseClient
): Promise<{ blob: Blob; updatedAt: string; etag: string; name: string } | null> {
  const { data: listed, error: listError } = await supabase.storage
    .from("taxonomy")
    .list("", { limit: 20 });
  if (listError) throw listError;

  const file = (listed || []).find((f) => f.name === TAXONOMY_OBJECT_PATH);
  if (!file) return null;

  const updatedAt = file.updated_at || file.created_at || "";
  const etag = (file as { metadata?: { eTag?: string }; id?: string }).id || updatedAt;

  const { data, error } = await supabase.storage
    .from("taxonomy")
    .download(TAXONOMY_OBJECT_PATH);
  if (error) throw error;
  if (!data) return null;

  const metaName =
    (file.metadata as { originalName?: string } | null)?.originalName ||
    "taxonomy";

  return { blob: data, updatedAt, etag, name: metaName };
}

export async function ensureTaxonomyCached(
  supabase: SupabaseClient
): Promise<{ rows: TaxRow[]; name: string } | null> {
  const remote = await readTaxonomyObject(supabase);
  if (!remote) {
    // Fall back to existing IDB cache if present (offline / empty bucket).
    const cached = await get<TaxRow[]>(TAX_ROWS);
    const name = (await get<string>(TAX_NAME)) || "";
    if (cached?.length) return { rows: cached, name: name || "taxonomy" };
    return null;
  }

  const meta = await get<TaxonomyMeta>(TAX_META);
  if (
    meta &&
    meta.updatedAt === remote.updatedAt &&
    meta.etag === remote.etag
  ) {
    const cached = await get<TaxRow[]>(TAX_ROWS);
    const name = (await get<string>(TAX_NAME)) || meta.name;
    if (cached?.length) return { rows: cached, name: name || "taxonomy" };
  }

  const file = new File(
    [remote.blob],
    remote.name.endsWith(".xlsx") || remote.name.endsWith(".csv")
      ? remote.name
      : `${remote.name}.xlsx`,
    { type: remote.blob.type || "application/octet-stream" }
  );
  const rows = await parseTaxonomy(file);
  const name = remote.name || "taxonomy";
  await set(TAX_ROWS, rows);
  await set(TAX_NAME, name);
  await set(TAX_META, {
    updatedAt: remote.updatedAt,
    etag: remote.etag,
    name,
  } satisfies TaxonomyMeta);
  return { rows, name };
}

export async function uploadTaxonomy(
  supabase: SupabaseClient,
  file: File,
  rows: TaxRow[]
): Promise<void> {
  const { error } = await supabase.storage
    .from("taxonomy")
    .upload(TAXONOMY_OBJECT_PATH, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
      metadata: { originalName: file.name },
    });
  if (error) throw error;

  await set(TAX_ROWS, rows);
  await set(TAX_NAME, file.name);

  // Refresh meta from storage listing.
  const { data: listed } = await supabase.storage.from("taxonomy").list("", { limit: 20 });
  const obj = (listed || []).find((f) => f.name === TAXONOMY_OBJECT_PATH);
  const updatedAt = obj?.updated_at || new Date().toISOString();
  const etag = obj?.id || updatedAt;
  await set(TAX_META, { updatedAt, etag, name: file.name } satisfies TaxonomyMeta);
}

export async function removeTaxonomy(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.storage.from("taxonomy").remove([TAXONOMY_OBJECT_PATH]);
  if (error) throw error;
  await set(TAX_ROWS, []);
  await set(TAX_NAME, "");
  await set(TAX_META, { updatedAt: "", etag: "", name: "" } satisfies TaxonomyMeta);
}
