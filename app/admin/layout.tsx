import Link from "next/link";
import type { ReactNode } from "react";

import Header from "./_components/Header";
import Sidebar from "./_components/Sidebar";
import { checkIsAdmin } from "./_lib";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin · Space Field",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await checkIsAdmin();

  if (!auth.ok) {
    return (
      <main className="min-h-[80vh] bg-app">
        <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-24 text-center">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            403
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-app">
            Not authorized
          </h1>
          <p className="mt-2 text-sm text-secondary">
            {auth.reason === "no-user"
              ? "Sign in with an admin account to view this page."
              : "Your account does not have admin access."}
          </p>
          <Link
            href="/"
            className="mt-6 rounded-lg border border-app bg-app-elevated px-4 py-2 text-sm text-app transition-colors hover:border-tool-accent"
          >
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-app text-app">
      <Header email={auth.email} />

      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        {/* Section-scoped sidebar — desktop only. Sticks below the
            header (header is ~5.25rem total: 3rem row 1 + 2.25rem row 2). */}
        <aside className="sticky top-[5.5rem] hidden h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto pr-2 lg:block">
          <Sidebar />
        </aside>

        {/* Mobile section drawer — collapsed details element. The Header
            tab bar already lets users switch sections; this is the
            drilldown to specific routes when on a small screen. */}
        <div className="block w-full lg:hidden">
          <details className="mb-4 rounded-lg border border-app bg-app-elevated">
            <summary className="cursor-pointer px-3 py-2 text-sm text-app">
              Section menu
            </summary>
            <div className="border-t border-app p-2">
              <Sidebar />
            </div>
          </details>
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
