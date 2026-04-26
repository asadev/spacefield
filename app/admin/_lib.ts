import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shared admin utilities. Server-only.
 *
 * Auth model: an admin is a user with profiles.is_admin = true. The
 * Postgres RPC public.is_admin_user() returns true for the calling user
 * when that flag is set. We use the user-scoped server client (cookies
 * forwarded) to evaluate it.
 */

export type AdminCheckResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; reason: "no-user" | "not-admin" };

export async function checkIsAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, reason: "no-user" };
  }
  const { data: rpc, error: rpcErr } = await supabase.rpc("is_admin_user");
  if (rpcErr || rpc !== true) {
    return { ok: false, reason: "not-admin" };
  }
  return {
    ok: true,
    userId: userData.user.id,
    email: userData.user.email ?? null,
  };
}

/** Throw if the caller is not an admin. Use inside server actions. */
export async function assertAdmin(): Promise<{ userId: string; email: string | null }> {
  const r = await checkIsAdmin();
  if (!r.ok) {
    throw new Error(
      r.reason === "no-user" ? "not signed in" : "not authorized"
    );
  }
  return { userId: r.userId, email: r.email };
}

/* ──────────────────── auth.users.email lookups ──────────────────── */

export type AuthUserLite = {
  id: string;
  email: string | null;
  created_at: string;
};

/**
 * Read auth.users by id list via the service-role client. Done by
 * calling auth.admin.getUserById in parallel — there's no batch endpoint
 * in the auth admin API.
 */
export async function fetchAuthUsersByIds(
  ids: string[]
): Promise<Map<string, AuthUserLite>> {
  const out = new Map<string, AuthUserLite>();
  if (ids.length === 0) return out;
  const admin = createAdminClient();
  const unique = Array.from(new Set(ids));
  const results = await Promise.all(
    unique.map((id) =>
      admin.auth.admin
        .getUserById(id)
        .then((res) => ({ id, res }))
        .catch(() => ({ id, res: null }))
    )
  );
  for (const { id, res } of results) {
    if (!res || res.error || !res.data?.user) {
      out.set(id, { id, email: null, created_at: "" });
      continue;
    }
    const u = res.data.user;
    out.set(id, {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? "",
    });
  }
  return out;
}

/**
 * List auth.users with pagination + optional email filter (client-side
 * substring match, since the admin auth API doesn't accept filters).
 * `page` is 1-based to match the URL param.
 */
export async function listAuthUsers(opts: {
  page?: number;
  perPage?: number;
  emailLike?: string;
}): Promise<{ rows: AuthUserLite[]; total: number; page: number; perPage: number }> {
  const admin = createAdminClient();
  const perPage = opts.perPage ?? 50;
  const page = Math.max(1, opts.page ?? 1);

  if (opts.emailLike) {
    // Filtered: scan up to 5 pages of 200 to find matches. Good enough
    // for the search-as-you-type admin flow without paginating the
    // filtered set itself.
    const needle = opts.emailLike.toLowerCase();
    const all: AuthUserLite[] = [];
    for (let p = 1; p <= 5; p++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page: p,
        perPage: 200,
      });
      if (error || !data?.users || data.users.length === 0) break;
      for (const u of data.users) {
        if ((u.email ?? "").toLowerCase().includes(needle)) {
          all.push({
            id: u.id,
            email: u.email ?? null,
            created_at: u.created_at ?? "",
          });
        }
      }
      if (data.users.length < 200) break;
    }
    const start = (page - 1) * perPage;
    return {
      rows: all.slice(start, start + perPage),
      total: all.length,
      page,
      perPage,
    };
  }

  const { data, error } = await admin.auth.admin.listUsers({
    page,
    perPage,
  });
  if (error || !data?.users) {
    return { rows: [], total: 0, page, perPage };
  }
  return {
    rows: data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? "",
    })),
    // The admin API exposes `total` on the response (cast — older
    // typings sometimes omit it).
    total: (data as unknown as { total?: number }).total ?? data.users.length,
    page,
    perPage,
  };
}

/* ──────────────────── formatting helpers ──────────────────── */

export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export function tierBadgeClass(tierId: string | null | undefined): string {
  switch (tierId) {
    case "pro":
      return "bg-tool-accent-soft text-tool-accent";
    case "team":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "enterprise":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

export const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

export const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const buttonGhostClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent disabled:opacity-50";
