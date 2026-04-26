"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

export type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  theme: Theme;
  resolved: ResolvedTheme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystem(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved: ResolvedTheme = theme === "system" ? resolveSystem() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  // Hydrate from URL ?theme= (iframe pin) > storage > OS. URL param locks
  // the iframe to the parent's resolved theme so the desktop and tool stay
  // in sync. localStorage is the explicit user choice. OS is the default.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qp = (window.location.search.match(/[?&]theme=(dark|light)/) || [])[1] as ResolvedTheme | undefined;
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) || null;
    const next: Theme = qp === "dark" || qp === "light"
      ? qp
      : stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    setThemeState(next);
    const r: ResolvedTheme = next === "system" ? resolveSystem() : next;
    setResolved(r);
    applyTheme(next);
  }, []);

  // React to OS preference changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const r: ResolvedTheme = mql.matches ? "light" : "dark";
      setResolved(r);
      document.documentElement.setAttribute("data-theme", r);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue as Theme | null;
      if (v === "light" || v === "dark" || v === "system") {
        setThemeState(v);
        const r: ResolvedTheme = v === "system" ? resolveSystem() : v;
        setResolved(r);
        applyTheme(v);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    const r: ResolvedTheme = t === "system" ? resolveSystem() : t;
    setResolved(r);
    applyTheme(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    // dark -> light -> system -> dark
    const next: Theme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(next);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Sensible fallback if used outside provider
    return {
      theme: "dark" as Theme,
      resolved: "dark" as ResolvedTheme,
      setTheme: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}

// Inline script that runs before React hydrates. Three responsibilities:
//   1. Resolve & paint the theme: URL ?theme= > localStorage > OS pref.
//   2. Mark the document as framed (?frame=1) so CSS can suppress any
//      bespoke macOS-style chrome the inner tool page may have added.
//   3. When framed, run a DOM-cleanup pass after content paints that
//      hides bespoke title-bars and back-to-index links. CSS :has()
//      can be brittle across browsers/builds — JS guarantees it.
export const themeInitScript = `
(function(){try{
  var qp = (location.search.match(/[?&]theme=(dark|light)/) || [])[1];
  var t = qp || localStorage.getItem('theme');
  var sys = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  var resolved = t === 'light' ? 'light' : t === 'dark' ? 'dark' : sys;
  document.documentElement.setAttribute('data-theme', resolved);
  var framed = /[?&]frame=1\\b/.test(location.search);
  if (framed) {
    document.documentElement.setAttribute('data-framed', '1');
    // DOM cleanup once the body is parseable. We run on DOMContentLoaded
    // and again after a tick so React-rendered chrome also gets stripped.
    var cleanup = function(){
      try {
        // 1. Hide any back-to-index links — break the workspace metaphor.
        var BACK_HREFS = ['/tools','/solutions','/solutions/tools'];
        document.querySelectorAll('a[href]').forEach(function(a){
          var h = a.getAttribute('href');
          if (BACK_HREFS.indexOf(h) !== -1) a.style.display = 'none';
        });
        // 2. Hide bespoke macOS title-bars. We anchor on the red dot
        //    and walk up to find the enclosing title-bar.
        var redSel = '[class*="bg-[#ff5f57]"], [class*="bg-red-400"], [class*="bg-red-500"], [class*="bg-rose-400"]';
        document.querySelectorAll(redSel).forEach(function(red){
          var dotsWrap = red.parentElement;
          if (!dotsWrap) return;
          var greenSel = '[class*="bg-[#28c840]"], [class*="bg-emerald-400"], [class*="bg-green-400"], [class*="bg-emerald-500"], [class*="bg-green-500"]';
          var hasGreen = dotsWrap.querySelector(greenSel);
          if (!hasGreen) return;
          dotsWrap.style.display = 'none';
          var titleBar = dotsWrap.parentElement;
          if (titleBar && titleBar.children.length <= 6) {
            titleBar.style.display = 'none';
          }
        });
      } catch(_) {}
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', cleanup);
    } else {
      cleanup();
    }
    setTimeout(cleanup, 100);
    setTimeout(cleanup, 500);

    // Intercept tool-to-tool navigation. Each tool window should host
    // exactly ONE tool — clicks on links to OTHER tools must NOT
    // navigate inside the iframe. Instead, postMessage to the parent
    // desktop which opens a new window for the target tool.
    document.addEventListener('click', function(e){
      try {
        var t = e.target;
        var a = t && t.closest ? t.closest('a[href]') : null;
        if (!a) return;
        var href = a.getAttribute('href') || '';
        // Only intercept tool routes — not external links.
        var m = href.match(/^\\/(?:tools|solutions\\/tools)\\/([^\\/?#]+)/);
        if (!m) return;
        var slug = m[1];
        // Don't intercept clicks that target the same slug as this iframe.
        var here = location.pathname.match(/^\\/(?:tools|solutions\\/tools)\\/([^\\/?#]+)/);
        if (here && here[1] === slug) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          window.parent.postMessage({
            type: 'tools-open',
            slug: slug,
            title: (a.textContent || slug).trim()
          }, location.origin);
        } catch(_) {}
      } catch(_) {}
    }, true);
  }
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();
`;
