"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { AuthProvider } from "../tools/_components/useAuth";
import SignInDialog from "../tools/_components/SignInDialog";
import SpacefieldLogo from "../_components/SpacefieldLogo";

function readSafeNext(): string {
  if (typeof window === "undefined") return "/";
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  } catch {}
  return "/";
}

function SignInPageInner() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }
    let cancelled = false;
    const supabase = getSupabase();
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) {
        router.replace(readSafeNext());
      } else {
        setChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const close = () => {
    setOpen(false);
    router.replace("/");
  };

  return (
    <main className="min-h-screen bg-app text-app">
      <header className="border-b border-app bg-app-elevated/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center">
            <SpacefieldLogo size="sm" />
          </Link>
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-sm text-secondary transition-colors hover:text-app"
          >
            Back
          </Link>
        </div>
      </header>
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-5 py-12 text-center">
        <div className="rounded-2xl border border-app bg-app-elevated p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-app">
            Sign in to Spacefield
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Use Google or a magic link to sync your workspaces and continue.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!checked}
            className="mt-5 rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {checked ? "Open sign in" : "Checking session..."}
          </button>
        </div>
      </section>
      <SignInDialog open={open && checked} onClose={close} />
    </main>
  );
}

export default function SignInPage() {
  return (
    <AuthProvider>
      <SignInPageInner />
    </AuthProvider>
  );
}
