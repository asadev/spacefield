import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/files/finalize
 *   body: { workspaceId, fileId, key, name, contentType, sizeBytes }
 *   returns: the inserted public.workspace_files row
 *
 * Called by the client after a successful PUT to the presigned URL.
 * Inserts the metadata row that the Files Manager UI lists.
 */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    workspaceId?: string;
    fileId?: string;
    key?: string;
    name?: string;
    contentType?: string;
    sizeBytes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { workspaceId, fileId, key, name, contentType, sizeBytes } = body;
  if (!workspaceId || !fileId || !key || !name || typeof sizeBytes !== "number") {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Sanity: the key the client sends must match what /upload generated
  // for THIS user + workspace + fileId. Prevents the client from
  // claiming a file uploaded under someone else's prefix.
  if (!key.startsWith(`${workspaceId}/${fileId}/`)) {
    return NextResponse.json({ error: "key mismatch" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("workspace_files")
    .insert({
      id: fileId,
      workspace_id: workspaceId,
      user_id: user.id,
      r2_key: key,
      name,
      size_bytes: sizeBytes,
      content_type: contentType ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ file: data });
}
