"use client";

/* useAuth + AuthProvider — lightweight wrapper around Supabase auth.
 *
 * Spacefield is auth-OPTIONAL. If Supabase env vars aren't set the
 * provider returns a permanently signed-out state and no errors are
 * thrown. The workspace continues to work, just without cross-device
 * sync.
 *
 * If env vars are set:
 *   - On first mount, hydrates the current session.
 *   - Subscribes to auth state changes.
 *   - Exposes signIn (email magic link), signOut, and the user object.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

interface AuthContextValue {
  /** Null if Supabase isn't configured OR user not signed in. */
  user: User | null;
  /** True only after the initial session check completes. */
  hydrated: boolean;
  /** True if Supabase env vars are set. */
  enabled: boolean;
  /** The Supabase client (always non-null; see lib/supabase/client.ts). */
  supabase: SupabaseClient;
  /** Send a magic link to the given email. Throws if Supabase isn't configured. */
  signInWithEmail: (email: string) => Promise<void>;
  /** Sign out the current user. No-op if not configured / not signed in. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabase(), []);
  const enabled = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUser(data.user);
      setHydrated(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, enabled]);

  const signInWithEmail = useCallback(
    async (email: string) => {
      if (!enabled) throw new Error("Supabase not configured");
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? window.location.origin
              : undefined,
        },
      });
      if (error) throw error;
    },
    [supabase, enabled]
  );

  const signOut = useCallback(async () => {
    if (!enabled) return;
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase, enabled]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      hydrated,
      enabled,
      supabase,
      signInWithEmail,
      signOut,
    }),
    [user, hydrated, enabled, supabase, signInWithEmail, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
