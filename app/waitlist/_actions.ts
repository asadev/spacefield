"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server action behind /waitlist. Calls the `waitlist_join` Supabase RPC,
 * which inserts (or no-ops on conflict). Failures degrade to a console
 * log so the email is never silently lost — Vercel captures stdout.
 */
export async function joinWaitlist(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`/waitlist?err=${encodeURIComponent("That doesn't look like an email.")}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Hash the IP rather than store it raw — privacy-by-design.
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") ?? null;
  const fwd = hdrs.get("x-forwarded-for") ?? "";
  const ipRaw = fwd.split(",")[0]?.trim() || null;
  const ipHash = ipRaw ? await sha256(ipRaw) : null;

  if (!url || !anon) {
    // Worst case: env not wired. Still log so Asad doesn't lose the lead.
    console.log(
      JSON.stringify({
        evt: "waitlist.signup.fallback",
        email,
        role,
        ua,
        ipHash,
        ts: new Date().toISOString(),
      }),
    );
    redirect("/waitlist?ok=1");
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/waitlist_join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({
        p_email: email,
        p_role: role || null,
        p_user_agent: ua,
        p_source: "web",
        p_ip_hash: ipHash,
      }),
    });
    if (!res.ok) {
      // Don't fail loud — log + show success so the user isn't blocked.
      const body = await res.text().catch(() => "");
      console.log(
        JSON.stringify({
          evt: "waitlist.signup.rpc_failed",
          status: res.status,
          body: body.slice(0, 500),
          email,
        }),
      );
    } else {
      console.log(JSON.stringify({ evt: "waitlist.signup.ok", email }));
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        evt: "waitlist.signup.error",
        error: err instanceof Error ? err.message : String(err),
        email,
      }),
    );
  }

  redirect("/waitlist?ok=1");
}

async function sha256(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
