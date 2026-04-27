import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/chat/members?workspace_id=<uuid>
 *   returns: { members: Array<{ user_id, role, full_name, username, avatar_url }> }
 *
 * Used by the @-mention dropdown in the composer. RLS on
 * workspace_members lets a member read all rows in workspaces they
 * belong to — we then enrich with public profile data (anyone can
 * read profiles).
 */

interface MemberRow {
  user_id: string;
  role: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
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
    return NextResponse.json(
      { error: "missing workspace_id" },
      { status: 400 }
    );
  }

  const { data: rows, error } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = (rows ?? []) as Array<{ user_id: string; role: string }>;
  if (list.length === 0) {
    return NextResponse.json({ members: [] as MemberRow[] });
  }

  const ids = list.map((r) => r.user_id);
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("user_id, full_name, username, avatar_url")
    .in("user_id", ids);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  const profMap = new Map(
    (profiles ?? []).map((p) => [
      p.user_id as string,
      {
        full_name: (p.full_name as string | null) ?? null,
        username: (p.username as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
      },
    ])
  );

  const members: MemberRow[] = list.map((r) => {
    const p = profMap.get(r.user_id) ?? {
      full_name: null,
      username: null,
      avatar_url: null,
    };
    return {
      user_id: r.user_id,
      role: r.role,
      full_name: p.full_name,
      username: p.username,
      avatar_url: p.avatar_url,
    };
  });

  return NextResponse.json({ members });
}
