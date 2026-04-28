import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/files/list?workspace_id=&limit=&kinds=&shared=
 *
 * Lightweight listing endpoint for surfaces that aren't the Files
 * Manager itself — currently the Launchpad's Downloads / Documents /
 * Shared sidebar entries. RLS does the auth (the workspace_files
 * SELECT policy already requires workspace membership), so this route
 * is just a thin convenience layer that:
 *   - applies the same query Files Manager uses (newest first, limit)
 *   - filters by content-type "kinds" when requested:
 *       document → text/markdown, text/plain, application/vnd.spacefield.doc
 *       sheet    → text/csv, application/vnd.spacefield.sheet, *.xls*
 *       image    → image/*
 *       video    → video/*
 *   - filters out trash (deleted_at not null)
 *
 * The `shared=true` flag is reserved for future "files shared with me
 * by other workspace members" filtering. v1 just returns the same
 * workspace listing — RLS already restricts to the user's reachable
 * files, which is the closest thing to "shared" we have.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const limitParam = url.searchParams.get("limit");
  const kinds = (url.searchParams.get("kinds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const limit = Math.min(
    Math.max(Number.parseInt(limitParam ?? "30", 10) || 30, 1),
    200
  );

  if (!workspaceId) {
    return NextResponse.json({ error: "missing workspace_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("workspace_files")
    .select(
      "id, name, size_bytes, content_type, created_at, user_id, deleted_at, tags"
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Treat as empty — the Launchpad surfaces a "no files yet" state
    // rather than an error pane.
    return NextResponse.json({ items: [] });
  }

  type Row = {
    id: string;
    name: string;
    size_bytes: number | null;
    content_type: string | null;
    created_at: string;
    user_id: string | null;
    deleted_at: string | null;
    tags: string[] | null;
  };
  const rows = (data ?? []) as Row[];
  const matchKind = (r: Row): boolean => {
    if (kinds.length === 0) return true;
    const ct = (r.content_type ?? "").toLowerCase();
    const name = r.name.toLowerCase();
    return kinds.some((k) => {
      if (k === "document") {
        return (
          ct.includes("markdown") ||
          ct.includes("plain") ||
          ct.includes("vnd.spacefield.doc") ||
          /\.(md|txt|doc|docx)$/i.test(name)
        );
      }
      if (k === "sheet") {
        return (
          ct.includes("csv") ||
          ct.includes("vnd.spacefield.sheet") ||
          /\.(csv|xls|xlsx)$/i.test(name)
        );
      }
      if (k === "image") return ct.startsWith("image/");
      if (k === "video") return ct.startsWith("video/");
      return false;
    });
  };

  const items = rows.filter(matchKind);
  return NextResponse.json({ items });
}
