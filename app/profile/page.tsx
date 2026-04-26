"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/* /profile — view & edit your Space Field account.
 *
 * What you can do here:
 *   - See your email + sign-in provider (Google / email magic link)
 *   - Set / change your display name (saved to user_metadata.full_name)
 *   - Set / change your custom avatar URL (user_metadata.custom_avatar_url)
 *   - Sign out
 *
 * Auth-aware: if the user is signed out, shows a friendly "Sign in to
 * see your profile" with a link back home where the topbar SignInDialog
 * can be opened.
 */

export default function ProfilePage() {
  const supabase = getSupabase();
  const enabled = isSupabaseConfigured();

  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const u = data.user;
      setUser(u);
      if (u) {
        setName(
          (u.user_metadata?.full_name as string) ||
            (u.user_metadata?.name as string) ||
            ""
        );
        setAvatarUrl(
          (u.user_metadata?.custom_avatar_url as string) ||
            (u.user_metadata?.avatar_url as string) ||
            ""
        );
      }
      setHydrated(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, enabled]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled || !user || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updErr } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          full_name: name.trim() || null,
          custom_avatar_url: avatarUrl.trim() || null,
        },
      });
      if (updErr) throw updErr;
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    if (!enabled) return;
    await supabase.auth.signOut();
    setUser(null);
  };

  // Loading
  if (!hydrated) {
    return (
      <main className="min-h-screen bg-app text-app flex items-center justify-center">
        <div className="text-secondary text-sm">Loading…</div>
      </main>
    );
  }

  // Signed-out state
  if (!user) {
    return (
      <main className="min-h-screen bg-app text-app">
        <div className="mx-auto max-w-xl px-6 py-16">
          <Link
            href="/"
            className="text-[0.72rem] uppercase tracking-[0.14em] text-secondary hover:text-app transition-colors"
          >
            ← Back to workspace
          </Link>
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-app">
            Profile
          </h1>
          <p className="mt-3 text-sm text-secondary">
            Sign in to see and edit your profile.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-tool-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Go to workspace and sign in
          </Link>
        </div>
      </main>
    );
  }

  // Determine the sign-in provider for the info row
  const providers = user.app_metadata?.providers as string[] | undefined;
  const provider = (user.app_metadata?.provider as string | undefined) ||
    (providers && providers[0]) ||
    "email";

  const displayAvatar =
    avatarUrl ||
    (user.user_metadata?.custom_avatar_url as string | undefined) ||
    (user.user_metadata?.avatar_url as string | undefined) ||
    null;

  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-xl px-6 py-10">
        <Link
          href="/"
          className="text-[0.72rem] uppercase tracking-[0.14em] text-secondary hover:text-app transition-colors"
        >
          ← Back to workspace
        </Link>

        <div className="mt-8 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tool-accent text-xl font-semibold text-white">
            {displayAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayAvatar}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              (
                name?.[0] ||
                (user.email?.[0] ?? "?")
              ).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-app">
              {name || user.email?.split("@")[0] || "Your account"}
            </h1>
            <div className="truncate text-sm text-secondary">
              {user.email}
            </div>
          </div>
        </div>

        <form onSubmit={save} className="mt-10 space-y-5">
          <label className="block">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">
              Display name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="How you want to appear in the app"
              className="mt-1 block w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
            />
          </label>

          <label className="block">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">
              Avatar URL
            </span>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://… image link"
              className="mt-1 block w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
            />
            <span className="mt-1 block text-[11px] text-muted">
              Paste any image URL. (File upload comes when we add the file
              manager.)
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-app bg-surface px-3 py-2 text-sm text-app">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {savedAt && (
              <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">
                Saved
              </span>
            )}
          </div>
        </form>

        <hr className="my-10 border-t border-app" />

        <section>
          <h2 className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">
            Account
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-secondary">Email</dt>
              <dd className="truncate text-app">{user.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-secondary">Sign-in method</dt>
              <dd className="text-app capitalize">{provider}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-secondary">User ID</dt>
              <dd className="truncate font-mono text-[11px] text-muted">
                {user.id}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-secondary">Created</dt>
              <dd className="text-app">
                {user.created_at
                  ? new Date(user.created_at).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <hr className="my-10 border-t border-app" />

        <section>
          <h2 className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">
            Sign out
          </h2>
          <p className="mt-2 text-sm text-secondary">
            Your local workspace data stays on this device. Sign back in to
            resume cloud sync.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-4 rounded-lg border border-app bg-app-elevated px-4 py-2 text-sm font-medium text-app transition-colors hover:bg-surface"
          >
            Sign out
          </button>
        </section>
      </div>
    </main>
  );
}
