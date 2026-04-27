"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const signInHref = pathname ? `/auth/sign-in?next=${encodeURIComponent(pathname)}` : "/auth/sign-in";

  useEffect(() => {
    const supabase = createClient();

    // Get initial auth state
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Loading: show skeleton
  if (loading) {
    return (
      <div className="relative">
        <div className="pointer-events-none select-none" style={{ filter: "blur(8px)" }}>
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border border-white/[0.10] bg-white/[0.05] p-6 sm:p-8 text-center backdrop-blur-sm">
            <div className="mx-auto h-4 w-32 animate-pulse rounded bg-white/10" />
            <div className="mx-auto mt-3 h-3 w-48 animate-pulse rounded bg-white/5" />
          </div>
        </div>
      </div>
    );
  }

  // Signed in: render normally
  if (user) return <>{children}</>;

  // Not signed in: show gated overlay
  return (
    <div className="relative">
      <div
        className="pointer-events-none select-none"
        style={{ filter: "blur(8px)" }}
        aria-hidden="true"
      >
        {children}
      </div>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
        <div className="border border-app bg-app-elevated p-6 sm:p-10 text-center max-w-sm sm:max-w-lg mx-3 sm:mx-4">
          <h3 className="text-lg font-semibold tracking-tight text-app">
            Sign in to access all tools
          </h3>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Create a free account to access every tool, track your progress,
            and join the community.
          </p>
          <Link
            href={signInHref}
            className="mt-6 inline-block w-full sm:w-auto border border-app bg-surface px-8 py-4 text-[0.75rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:bg-surface-hover hover:text-app"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
