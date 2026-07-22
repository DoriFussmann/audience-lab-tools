import { NextResponse } from "next/server";
import {
  PROJECT_REPORTS_BUCKET,
  defineReportStoragePath,
} from "@/lib/defineReport";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureReportsBucket(
  admin: ReturnType<typeof createAdminClient>
): Promise<void> {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw listError;
  if ((buckets || []).some((b) => b.name === PROJECT_REPORTS_BUCKET)) return;
  const { error } = await admin.storage.createBucket(PROJECT_REPORTS_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

async function userCanAccessProject(projectId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  // RLS on projects already limits select to owner/shared; presence means access.
  return !!data && !!userId;
}

/** Upload or replace the Definition Summary PDF for a project. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const projectId = String(form.get("projectId") || "").trim();
    const file = form.get("file");
    if (!projectId || !(file instanceof Blob)) {
      return NextResponse.json({ error: "projectId and file are required" }, { status: 400 });
    }
    if (!(await userCanAccessProject(projectId, user.id))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    await ensureReportsBucket(admin);
    const path = defineReportStoragePath(projectId);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(PROJECT_REPORTS_BUCKET).upload(path, buffer, {
      upsert: true,
      contentType: "application/pdf",
    });
    if (error) throw error;

    return NextResponse.json({ path });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Signed URL to open a saved Definition Summary PDF. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();
    const path = String(searchParams.get("path") || "").trim();
    if (!projectId || !path) {
      return NextResponse.json({ error: "projectId and path are required" }, { status: 400 });
    }
    if (path !== defineReportStoragePath(projectId)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    if (!(await userCanAccessProject(projectId, user.id))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    await ensureReportsBucket(admin);
    const { data, error } = await admin.storage
      .from(PROJECT_REPORTS_BUCKET)
      .createSignedUrl(path, 3600);
    if (error) throw error;
    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not open PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Remove a saved Definition Summary PDF (e.g. on Define reset). */
export async function DELETE(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();
    const path = String(searchParams.get("path") || "").trim();
    if (!projectId || !path) {
      return NextResponse.json({ error: "projectId and path are required" }, { status: 400 });
    }
    if (path !== defineReportStoragePath(projectId)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    if (!(await userCanAccessProject(projectId, user.id))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    await ensureReportsBucket(admin);
    const { error } = await admin.storage.from(PROJECT_REPORTS_BUCKET).remove([path]);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
