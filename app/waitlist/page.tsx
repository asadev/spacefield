import Link from "next/link";

import { joinWaitlist } from "./_actions";

export const metadata = {
  title: "Join the waitlist · Space Field",
  description: "Be first when Space Field opens for general availability.",
};

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const submitted = sp.ok === "1";
  const error = sp.err ?? null;

  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <Link
          href="/"
          className="text-[0.6rem] uppercase tracking-[0.25em] text-faint hover:text-app"
        >
          ← Space Field
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          {submitted ? "You're on the list." : "Join the waitlist"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          {submitted
            ? "We'll email you the moment Space Field opens for general availability."
            : "Space Field is currently in invite-only beta. Drop your email and we'll let you know the moment we open up."}
        </p>

        {!submitted && (
          <form
            action={joinWaitlist}
            className="mx-auto mt-8 flex max-w-md flex-col gap-3"
          >
            <input
              type="email"
              name="email"
              required
              placeholder="you@company.com"
              className="rounded-lg border border-app bg-app-elevated px-4 py-3 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <input
              type="text"
              name="role"
              placeholder="What do you do? (optional)"
              className="rounded-lg border border-app bg-app-elevated px-4 py-3 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-tool-accent px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Notify me at launch
            </button>
            {error ? (
              <p className="text-xs text-rose-500" role="alert">
                {error}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-faint">
              We&apos;ll only use this address to notify you about the launch and
              early-access perks. See our{" "}
              <Link className="underline" href="/legal/privacy">
                privacy policy
              </Link>
              .
            </p>
          </form>
        )}

        {submitted && (
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm">
            <Link
              href="/roadmap"
              className="rounded-lg border border-app bg-app-elevated px-4 py-2 hover:border-tool-accent"
            >
              See the roadmap
            </Link>
            <Link
              href="/changelog"
              className="rounded-lg border border-app bg-app-elevated px-4 py-2 hover:border-tool-accent"
            >
              See what we just shipped
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
