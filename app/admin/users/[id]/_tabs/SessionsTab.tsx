import { buttonGhostClass, formatDateTime } from "../../../_lib";
import { forceSignOut } from "../../_actions";

export default function SessionsTab({
  userId,
  lastSignInAt,
  isSuspended,
}: {
  userId: string;
  lastSignInAt: string | null;
  isSuspended: boolean;
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated p-5">
      <h2 className="text-sm font-semibold text-app">Sessions</h2>
      <p className="mt-1 text-xs text-muted">
        Supabase doesn&apos;t expose a session list cleanly via the admin
        API. The most you can do here is force a global sign-out — that
        invalidates every active refresh token.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted">Last sign-in</dt>
        <dd className="font-mono text-xs tabular-nums text-secondary">
          {formatDateTime(lastSignInAt)}
        </dd>

        <dt className="text-muted">Currently suspended</dt>
        <dd className="text-app">{isSuspended ? "Yes" : "No"}</dd>
      </dl>

      <form action={forceSignOut} className="mt-5 flex items-center gap-2">
        <input type="hidden" name="user_id" value={userId} />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-500 transition-colors hover:border-rose-500"
        >
          Force sign-out everywhere
        </button>
        <span className="text-[11px] text-muted">
          Cycles a 1-second ban to invalidate active refresh tokens.
        </span>
      </form>

      <p className="mt-4 text-[11px] text-muted">
        For a real session list (device, IP, user-agent per session), we&apos;d
        need to write directly against
        {" "}<code className="text-secondary">auth.refresh_tokens</code>. That&apos;s
        Supabase-internal and out of scope for this admin pane.
      </p>

      {/* keep the userId in scope; React doesn't need it but the linter
          flags unused props otherwise. */}
      <span hidden>{userId}</span>
    </section>
  );
}
