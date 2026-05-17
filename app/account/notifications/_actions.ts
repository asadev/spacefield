"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Server action backing the notification-preferences form. Upserts a
 * single row keyed by `user_id` (RLS in `notification_prefs` ensures
 * the user can only write their own row).
 *
 * The form posts plain checkbox fields — when a checkbox is checked
 * the browser sends `name=on`, when unchecked it's omitted entirely.
 * So we coerce "field present and truthy" to `true`, anything else to
 * `false`.
 */
export async function updateNotificationPrefs(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/notifications");
  }

  const row = {
    user_id: user.id,
    comment_mention: bool(formData, "comment_mention"),
    task_assigned: bool(formData, "task_assigned"),
    task_completed: bool(formData, "task_completed"),
    timeoff_decision: bool(formData, "timeoff_decision"),
    workspace_invite: bool(formData, "workspace_invite"),
    weekly_digest: bool(formData, "weekly_digest"),
    email_marketing: bool(formData, "email_marketing"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("notification_prefs")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    // Surface the error on the page via the toast query-param picked
    // up by `<Toaster />`. Keep the message short — the full reason
    // is in server logs.
    console.error(
      JSON.stringify({
        evt: "notification_prefs.update.failed",
        user_id: user.id,
        msg: error.message,
      })
    );
    redirect(
      "/account/notifications?toast=error:Couldn%27t%20save%20your%20preferences.%20Try%20again.",
    );
  }

  revalidatePath("/account/notifications");
  redirect(
    "/account/notifications?toast=success:Notification%20preferences%20saved.",
  );
}

function bool(form: FormData, name: string): boolean {
  const v = form.get(name);
  if (v === null) return false;
  if (typeof v !== "string") return false;
  return v === "on" || v === "true" || v === "1";
}
