import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { recordTagAttach } from "../../_schemas";

/* POST /api/crm/tags/attach
 *   body: { workspace_id, tag_id, record_type, record_id }
 *   Idempotent — primary key is (tag_id, record_type, record_id).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = recordTagAttach.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { error } = await auth.supabase
    .from("crm_record_tags")
    .upsert(parsed.data, {
      onConflict: "tag_id,record_type,record_id",
      ignoreDuplicates: true,
    });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
