import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "admin@example.com";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/**
 * Require a logged-in admin. Redirects to /admin/sign-in otherwise.
 * Returns the Supabase user when OK.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/admin/sign-in");
  }
  const email = data.user.email;
  if (!isAdminEmail(email)) {
    redirect("/admin/sign-in?denied=1");
  }
  return { user: data.user };
}
