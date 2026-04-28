import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { r2, R2_BUCKET } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

/* GET /api/files/load-content?id=<fileId>
 *   returns: {
 *     file: { id, name, content_type, size_bytes },
 *     contentBase64: <string>
 *   }
 *
 * Companion to /api/files/save-content. Used by Documents and Sheets to
 * load existing files into their editors. We stream through the server
 * (rather than handing back a presigned GET URL) so the editor can render
 * synchronously without a second hop, and so we can enforce a hard size
 * cap before returning the bytes.
 */

const MAX_LOAD_BYTES = 25 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Service-role lookup — RLS visibility quirks shouldn't make a member
  // think their own file doesn't exist.
  const admin = createAdminClient();
  const { data: row, error: rowErr } = await admin
    .from("workspace_files")
    .select("id, workspace_id, r2_key, name, size_bytes, content_type")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }

  // Membership / ownership check + self-heal — same shape as /upload.
  // Cross-workspace shares: a caller who is NOT a member of the file's
  // owning workspace is still allowed if there's a workspace_file_shares
  // row pointing at one of the caller's workspaces.
  const { data: member } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", row.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    const { data: workspace } = await admin
      .from("workspaces")
      .select("id, user_id")
      .eq("id", row.workspace_id)
      .maybeSingle();
    if (workspace && workspace.user_id === user.id) {
      await admin.from("workspace_members").upsert(
        {
          workspace_id: row.workspace_id,
          user_id: user.id,
          role: "owner",
          invited_by: user.id,
        },
        { onConflict: "workspace_id,user_id", ignoreDuplicates: false }
      );
    } else {
      // No direct membership — accept the call if a share row points
      // at any workspace the caller belongs to.
      const sharesRes = await admin
        .from("workspace_file_shares")
        .select("target_workspace_id")
        .eq("file_id", row.id);
      const targetIds = (sharesRes.data ?? [])
        .map(
          (r) => (r as { target_workspace_id: string }).target_workspace_id
        )
        .filter((v): v is string => Boolean(v));
      let allowedViaShare = false;
      if (targetIds.length > 0) {
        const memberCheck = await admin
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .in("workspace_id", targetIds);
        allowedViaShare = Boolean(
          memberCheck.data && memberCheck.data.length > 0
        );
      }
      if (!allowedViaShare) {
        return NextResponse.json(
          { error: "not a member of that workspace" },
          { status: 403 }
        );
      }
    }
  }

  if (Number(row.size_bytes ?? 0) > MAX_LOAD_BYTES) {
    return NextResponse.json(
      {
        error: "file_too_large_to_open",
        max_bytes: MAX_LOAD_BYTES,
        actual_bytes: Number(row.size_bytes ?? 0),
      },
      { status: 413 }
    );
  }

  // Stream the body from R2 into a buffer.
  let buffer: Buffer;
  try {
    const res = await r2().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key })
    );
    if (!res.Body) {
      return NextResponse.json(
        { error: "empty body" },
        { status: 500 }
      );
    }
    // The S3 client returns a Node Readable in this runtime.
    const stream = res.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buf =
        typeof chunk === "string"
          ? Buffer.from(chunk)
          : Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk as Uint8Array);
      total += buf.length;
      if (total > MAX_LOAD_BYTES) {
        return NextResponse.json(
          {
            error: "file_too_large_to_open",
            max_bytes: MAX_LOAD_BYTES,
            actual_bytes: total,
          },
          { status: 413 }
        );
      }
      chunks.push(buf);
    }
    buffer = Buffer.concat(chunks);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "could not read from storage",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    file: {
      id: row.id,
      name: row.name,
      content_type: row.content_type,
      size_bytes: buffer.length,
    },
    contentBase64: buffer.toString("base64"),
  });
}
