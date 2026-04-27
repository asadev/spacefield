import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, workspaceInviteEmail } from "@/lib/email";

/* POST /api/workspaces/invite
 *   body: { workspaceId, identifier, role }
 *
 * Wraps the public.send_workspace_invite RPC so we can also fire the
 * branded invite email via Resend after the row is inserted. The RPC
 * itself only creates the workspace_invites row and resolves the
 * identifier (email or username) into a target — it doesn't have the
 * Node-side credentials it'd need to talk to an email provider.
 *
 * Auth model:
 *   - The RPC's own SECURITY DEFINER body enforces that the caller is
 *     owner or admin of the workspace, so we don't double-check here.
 *   - We DO use the user-scoped Supabase client to call the RPC so the
 *     auth.uid() inside SECURITY DEFINER resolves to the actual caller.
 *   - For looking up workspace name + inviter profile + recipient email
 *     we use the service-role client (admin) so RLS doesn't hide cross-
 *     account fields like the inviter's full_name.
 *
 * Response:
 *   - { invite, email_sent: true|false } — email_sent is false if the
 *     row was created but the email send failed (we don't fail the whole
 *     request on a transient email error; the row still represents a
 *     valid pending invite the recipient can find via spacefield.co).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { workspaceId?: string; identifier?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { workspaceId, identifier } = body;
  const role = body.role === "admin" ? "admin" : "member";
  if (!workspaceId || !identifier?.trim()) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Step 1 — call the RPC as the caller. The RPC enforces owner/admin
  // role, dedupes against existing pending invites, resolves identifier.
  const { data: invite, error: rpcErr } = await supabase.rpc(
    "send_workspace_invite",
    {
      ws_id: workspaceId,
      identifier: identifier.trim(),
      role_in: role,
    }
  );
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  }
  if (!invite) {
    return NextResponse.json(
      { error: "invite_not_returned" },
      { status: 500 }
    );
  }

  // Step 2 — gather context for the email. Service-role client so we
  // can read another user's profile + auth.users row.
  const admin = createAdminClient();

  type InviteRow = {
    id: string;
    workspace_id: string;
    invitee_user_id: string | null;
    invitee_email: string | null;
    role: "owner" | "admin" | "member";
    invited_by: string;
  };
  const inv = invite as InviteRow;

  const [{ data: ws }, { data: inviterProfile }] = await Promise.all([
    admin
      .from("workspaces")
      .select("id, name, user_id")
      .eq("id", inv.workspace_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("user_id, full_name, username")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // Resolve recipient email — invitee_email is set when invited by
  // email; for username invites the RPC stores invitee_user_id and
  // invitee_email might be null.
  let recipientEmail: string | null = inv.invitee_email;
  let recipientName: string | null = null;
  if (!recipientEmail && inv.invitee_user_id) {
    const { data: userRow } = await admin.auth.admin.getUserById(
      inv.invitee_user_id
    );
    recipientEmail = userRow.user?.email ?? null;
  }
  if (inv.invitee_user_id) {
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name, username")
      .eq("user_id", inv.invitee_user_id)
      .maybeSingle();
    recipientName =
      (prof?.full_name as string | null) ??
      (prof?.username as string | null) ??
      null;
  }

  if (!recipientEmail) {
    return NextResponse.json(
      { invite: inv, email_sent: false, reason: "no_recipient_email" },
      { status: 200 }
    );
  }

  const inviterName =
    (inviterProfile?.full_name as string | null) ||
    (inviterProfile?.username as string | null) ||
    user.email ||
    "A teammate";

  // Step 3 — render + send the email.
  const tpl = workspaceInviteEmail({
    inviteeName: recipientName,
    inviterName,
    workspaceName: ws?.name ?? "your workspace",
    role: role as "admin" | "member",
    acceptUrl: `https://spacefield.co/?invite=${inv.id}`,
  });

  let emailSent = false;
  try {
    await sendEmail({
      from: "invites",
      to: recipientEmail,
      subject: tpl.subject,
      html: tpl.html,
    });
    emailSent = true;
  } catch (err) {
    // The invite row was created — don't unwind it. Just report the
    // email failure so the client can show a soft warning.
    console.warn("[invite] email send failed:", err);
  }

  return NextResponse.json({ invite: inv, email_sent: emailSent });
}
