import {
  sendPasswordResetLinkForm,
  toggleUserAdmin,
} from "../../../_actions";
import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../../../_lib";
import {
  forceSignOut,
  setUserSuspended,
  updateUserProfile,
} from "../../_actions";

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  designation: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export default function ProfileTab({
  userId,
  profile,
  authEmail,
  authPhone,
  emailConfirmedAt,
  isSuspended,
  bannedUntil,
  isAdmin,
}: {
  userId: string;
  profile: Profile | null;
  authEmail: string | null;
  authPhone: string | null;
  emailConfirmedAt: string | null;
  isSuspended: boolean;
  bannedUntil: string | null;
  isAdmin: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Edit profile */}
      <section className="rounded-xl border border-app bg-app-elevated p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold text-app">Edit profile</h2>
        <p className="mt-1 text-xs text-muted">
          Updates apply immediately. Avatar is a public URL — Spacefield does
          not host avatars yet, paste a CDN URL or leave blank for initials.
        </p>
        <form
          action={updateUserProfile}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="user_id" value={userId} />

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Full name</span>
            <input
              name="full_name"
              defaultValue={profile?.full_name ?? ""}
              className={inputClass}
            />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Username</span>
            <input
              name="username"
              defaultValue={profile?.username ?? ""}
              placeholder="lowercase, unique"
              className={inputClass}
            />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Designation</span>
            <input
              name="designation"
              defaultValue={profile?.designation ?? ""}
              placeholder="Founder, Realtor, etc."
              className={inputClass}
            />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Avatar URL</span>
            <input
              name="avatar_url"
              defaultValue={profile?.avatar_url ?? ""}
              placeholder="https://..."
              className={inputClass}
            />
          </label>

          <label className="block text-xs sm:col-span-2">
            <span className="mb-1 block text-faint">Bio</span>
            <textarea
              name="bio"
              defaultValue={profile?.bio ?? ""}
              rows={3}
              placeholder="Short bio shown on profile."
              className={`${inputClass} resize-y`}
            />
          </label>

          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <button type="submit" className={buttonClass}>
              Save profile
            </button>
          </div>
        </form>
      </section>

      {/* Auth meta */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Auth metadata</h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">Email</dt>
          <dd className="break-all text-app">{authEmail ?? "—"}</dd>

          <dt className="text-muted">Email confirmed</dt>
          <dd className="font-mono text-xs tabular-nums text-secondary">
            {formatDateTime(emailConfirmedAt)}
          </dd>

          <dt className="text-muted">Phone</dt>
          <dd className="text-app">{authPhone ?? "—"}</dd>

          <dt className="text-muted">User ID</dt>
          <dd className="break-all font-mono text-[11px] tabular-nums text-secondary">
            {userId}
          </dd>

          {isSuspended && (
            <>
              <dt className="text-muted">Banned until</dt>
              <dd className="font-mono text-xs tabular-nums text-rose-500">
                {formatDateTime(bannedUntil)}
              </dd>
            </>
          )}
        </dl>
      </section>

      {/* Admin actions */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Admin actions</h2>
        <p className="mt-1 text-xs text-muted">
          Mutations are audited. Suspend uses Supabase ban_duration; force
          sign-out cycles a 1-second ban to invalidate active sessions.
        </p>

        <div className="mt-4 space-y-2">
          <form
            action={toggleUserAdmin}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="user_id" value={userId} />
            <input
              type="hidden"
              name="next"
              value={isAdmin ? "false" : "true"}
            />
            <button type="submit" className={buttonGhostClass}>
              {isAdmin ? "Revoke admin" : "Grant admin"}
            </button>
            <span className="text-[11px] text-muted">
              Toggles profiles.is_admin.
            </span>
          </form>

          <form
            action={setUserSuspended}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="user_id" value={userId} />
            <input
              type="hidden"
              name="suspend"
              value={isSuspended ? "false" : "true"}
            />
            <button
              type="submit"
              className={
                isSuspended
                  ? buttonGhostClass
                  : "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:border-rose-500"
              }
            >
              {isSuspended ? "Unsuspend user" : "Suspend user (100y ban)"}
            </button>
            <span className="text-[11px] text-muted">
              {isSuspended ? "Lifts the ban." : "Sets ban_duration=876600h."}
            </span>
          </form>

          <form
            action={forceSignOut}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="user_id" value={userId} />
            <button type="submit" className={buttonGhostClass}>
              Force sign-out everywhere
            </button>
            <span className="text-[11px] text-muted">
              Invalidates active refresh tokens.
            </span>
          </form>

          {authEmail && (
            <form
              action={sendPasswordResetLinkForm}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="email" value={authEmail} />
              <button type="submit" className={buttonGhostClass}>
                Send password reset
              </button>
              <span className="text-[11px] text-muted">
                Recovery link via Resend SMTP.
              </span>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
