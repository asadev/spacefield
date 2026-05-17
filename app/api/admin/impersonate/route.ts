import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/app/admin/_lib";
import {
  endImpersonation,
  listActiveImpersonations,
  startImpersonation,
} from "@/lib/impersonate";
import { safeErrorMessage } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/impersonate
 *   List active (non-ended) impersonation sessions.
 *   Returns: { rows: ImpersonationSessionRow[] }
 *
 * POST /api/admin/impersonate
 *   body: { target_user_id: string, reason: string }
 *   Returns: { session: ImpersonationSessionRow }
 *
 * DELETE /api/admin/impersonate?id=<uuid>
 *   Closes the session. Returns: { ok: true }
 */

export async function GET() {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.impersonate.list.auth",
          fallback: "forbidden",
        }),
      },
      { status: 401 }
    );
  }
  const rows = await listActiveImpersonations();
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.impersonate.start.auth",
          fallback: "forbidden",
        }),
      },
      { status: 401 }
    );
  }

  let body: { target_user_id?: string; reason?: string };
  try {
    body = (await req.json()) as { target_user_id?: string; reason?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const target = (body.target_user_id ?? "").trim();
  const reason = (body.reason ?? "").trim();
  if (!target) {
    return NextResponse.json(
      { error: "missing target_user_id" },
      { status: 400 }
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "missing reason" },
      { status: 400 }
    );
  }

  try {
    const session = await startImpersonation(auth.userId, target, reason);
    revalidatePath("/admin/support/impersonations");
    return NextResponse.json({ session });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.impersonate.start",
          userId: auth.userId,
          fallback: "impersonate_start_failed",
        }),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.impersonate.end.auth",
          fallback: "forbidden",
        }),
      },
      { status: 401 }
    );
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  try {
    await endImpersonation(id);
    revalidatePath("/admin/support/impersonations");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.impersonate.end",
          userId: auth.userId,
          fallback: "impersonate_end_failed",
        }),
      },
      { status: 500 }
    );
  }
}
