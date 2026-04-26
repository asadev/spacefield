import Link from "next/link";
import type { ReactNode } from "react";

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
      <header className="sticky top-0 z-20 border-b border-app bg-app/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-sm font-semibold tracking-tight text-app"
            >
              Admin
            </Link>
            <span className="text-faint">·</span>
            <span className="text-xs text-muted">Space Field</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="font-mono tabular-nums">{auth.email ?? "—"}</span>
            <Link
              href="/"
              className="text-secondary hover:text-tool-accent"
            >
              Exit
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="sticky top-20 hidden h-fit w-52 shrink-0 lg:block">
          <Sidebar />
        </aside>
        <div className="block w-full lg:hidden">
          <details className="mb-4 rounded-lg border border-app bg-app-elevated">
            <summary className="cursor-pointer px-3 py-2 text-sm text-app">
              Menu
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
