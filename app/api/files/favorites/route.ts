import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* /api/files/favorites
 *
 *   GET    ?workspace_id=  → list the caller's starred files in that
 *                           workspace, joined to workspace_files for
 *                           name / kind / size / created_at. Newest
 *                           star first. Skips files that no longer
 *                           exist or were trashed.
 *   POST   body { file_id, workspace_id } → toggle on (idempotent).
 *   DELETE ?file_id=       → toggle off.
 *
 * RLS does the auth on the favorites rows themselves. The workspace
 * membership check is implicit: a user can't read a file via this
 * route unless workspace_files RLS lets them, because we select
 * through that table.
 */

interface FavoriteRow {
  file_id: string;
  created_at: string;
  workspace_files: {
    id: string;
    name: string;
    size_bytes: number | null;
    content_type: string | null;
    created_at: string;
    deleted_at: string | null;
  } | null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json({ error: "missing workspace_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("workspace_file_favorites")
    .select(
      "file_id, created_at, workspace_files!inner(id, name, size_bytes, content_type, created_at, deleted_at)"
    )
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ items: [] });
  }

  const rows = (data ?? []) as unknown as FavoriteRow[];
  const items = rows
    .map((r) => r.workspace_files)
    .filter(
      (f): f is NonNullable<FavoriteRow["workspace_files"]> =>
        Boolean(f) && f!.deleted_at === null
    )
    .map((f) => ({
      id: f.id,
      name: f.name,
      size_bytes: f.size_bytes ?? 0,
      content_type: f.content_type,
      created_at: f.created_at,
    }));

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { file_id?: unknown; workspace_id?: unknown };
  try {
    body = (await req.json()) as { file_id?: unknown; workspace_id?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const fileId = typeof body.file_id === "string" ? body.file_id : "";
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : "";
  if (!fileId || !workspaceId) {
    return NextResponse.json(
      { error: "missing file_id or workspace_id" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("workspace_file_favorites").upsert(
    {
      user_id: user.id,
      file_id: fileId,
      workspace_id: workspaceId,
    },
    { onConflict: "user_id,file_id", ignoreDuplicates: true }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fileId = req.nextUrl.searchParams.get("file_id");
  if (!fileId) {
    return NextResponse.json({ error: "missing file_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("workspace_file_favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("file_id", fileId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
