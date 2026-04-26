"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface UserPreferences {
  agentName: string;
  agentPhone: string;
  companyName: string;
  defaultAgentSplit: string;
}

const DEFAULT_PREFS: UserPreferences = {
  agentName: "",
  agentPhone: "",
  companyName: "",
  defaultAgentSplit: "",
};

const LS_KEY = "user_preferences";

function loadFromLocalStorage(): UserPreferences {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PREFS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_PREFS };
}

function saveToLocalStorage(prefs: UserPreferences) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {}
}

export function useUserPreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>({ ...DEFAULT_PREFS });
  const [loading, setLoading] = useState(true);
  const isLoggedIn = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPrefs = useRef<UserPreferences>(prefs);

  // Keep ref in sync
  useEffect(() => {
    latestPrefs.current = prefs;
  }, [prefs]);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (cancelled) return;

      if (user) {
        isLoggedIn.current = true;
        const saved = user.user_metadata?.preferences as Partial<UserPreferences> | undefined;
        const merged = { ...DEFAULT_PREFS, ...saved };
        setPrefs(merged);
        // Also sync to localStorage as fallback
        saveToLocalStorage(merged);
      } else {
        isLoggedIn.current = false;
        setPrefs(loadFromLocalStorage());
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const updatePrefs = useCallback((partial: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const merged = { ...prev, ...partial };
      latestPrefs.current = merged;

      // Always save to localStorage immediately (cheap)
      saveToLocalStorage(merged);

      // Debounce Supabase save
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(async () => {
        if (isLoggedIn.current) {
          const supabase = createClient();
          await supabase.auth.updateUser({
            data: { preferences: latestPrefs.current },
          });
        }
      }, 500);

      return merged;
    });
  }, []);

  return { prefs, updatePrefs, loading };
}
