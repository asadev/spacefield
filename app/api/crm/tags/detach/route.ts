import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { recordTagAttach } from "../../_schemas";

/* POST /api/crm/tags/detach — same body as /attach. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = recordTagAttach.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { error } = await auth.supabase
    .from("crm_record_tags")
    .delete()
    .eq("tag_id", parsed.data.tag_id)
    .eq("record_type", parsed.data.record_type)
    .eq("record_id", parsed.data.record_id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
