"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getLevel } from "@/lib/xp-system";
import type { User } from "@supabase/supabase-js";
import {
  getRegion,
  setRegion,
  subscribeRegion,
  isNeutralPath,
  regionFromPath,
  safePathMap,
  REGION_LABELS,
  ALL_REGIONS,
  type Region,
} from "@/lib/region";
import {
  getCitiesForRegion,
  isSingleCityRegion,
  type City,
} from "@/lib/cities";
import { getCity, setCity, subscribeCity } from "@/lib/city";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";

const uaeLinks = [
  { href: "/tools", label: "Tools" },
  { href: "/games", label: "Games" },
  { href: "/learn", label: "Learn" },
  { href: "/community", label: "Community" },
  { href: "/market", label: "Market" },
  { href: "/network", label: "Network" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

function buildRegionalLinks(prefix: string) {
  return [
    { href: `${prefix}/tools`, label: "Tools" },
    { href: `${prefix}/learn`, label: "Learn" },
    { href: `${prefix}/community`, label: "Community" },
    { href: `${prefix}/market`, label: "Market" },
    { href: "/network", label: "Network" },
    { href: `${prefix}/blog`, label: "Blog" },
    { href: `${prefix}/about`, label: "About" },
  ];
}

const linksByRegion: Record<Region, typeof uaeLinks> = {
  uae: uaeLinks,
  uk: buildRegionalLinks("/uk"),
  monaco: buildRegionalLinks("/monaco"),
  tokyo: buildRegionalLinks("/tokyo"),
  singapore: buildRegionalLinks("/singapore"),
  usa: buildRegionalLinks("/usa"),
  spain: buildRegionalLinks("/spain"),
  portugal: buildRegionalLinks("/portugal"),
  turkey: buildRegionalLinks("/turkey"),
  saudi: buildRegionalLinks("/saudi"),
};

const homeByRegion: Record<Region, string> = {
  uae: "/",
  uk: "/uk",
  monaco: "/monaco",
  tokyo: "/tokyo",
  singapore: "/singapore",
  usa: "/usa",
  spain: "/spain",
  portugal: "/portugal",
  turkey: "/turkey",
  saudi: "/saudi",
};

const REGION_BUTTON_LABEL: Record<Region, string> = {
  uae: "UAE",
  uk: "UK",
  monaco: "Monaco",
  tokyo: "Tokyo",
  singapore: "Singapore",
  usa: "USA",
  spain: "Spain",
  portugal: "Portugal",
  turkey: "Turkey",
  saudi: "Saudi",
};

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [mobileRegionOpen, setMobileRegionOpen] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [mobileCityOpen, setMobileCityOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userLevel, setUserLevel] = useState<number>(0);
  const [region, setRegionState] = useState<Region>("uae");
  const [cityByRegion, setCityByRegion] = useState<Record<Region, City | null>>(
    () => ({
      uae: null, uk: null, monaco: null, tokyo: null, singapore: null,
      usa: null, spain: null, portugal: null, turkey: null, saudi: null,
    })
  );
  const regionMenuRef = useRef<HTMLDivElement>(null);
  const cityMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  // Region detection:
  // - If path is /uk/* or /monaco/* → that region
  // - If neutral path → use stored preference
  // - Otherwise (UAE regional path) → UAE
  const pathRegion = regionFromPath(pathname);
  const neutral = isNeutralPath(pathname);
  const activeRegion: Region = pathRegion ?? region;
  const isUK = activeRegion === "uk";
  const isMonaco = activeRegion === "monaco";
  const links = linksByRegion[activeRegion];
  const homeHref = homeByRegion[activeRegion];
  const regionLabel = REGION_LABELS[activeRegion];

  // Subscribe to region preference changes (from dashboard toggle, other tabs)
  useEffect(() => {
    setRegionState(getRegion());
    return subscribeRegion(setRegionState);
  }, []);

  // Hydrate city preferences per region + subscribe to changes
  useEffect(() => {
    const seed = {
      uae: getCity("uae"), uk: getCity("uk"), monaco: getCity("monaco"),
      tokyo: getCity("tokyo"), singapore: getCity("singapore"),
      usa: getCity("usa"), spain: getCity("spain"),
      portugal: getCity("portugal"), turkey: getCity("turkey"),
      saudi: getCity("saudi"),
    };
    setCityByRegion(seed);
    return subscribeCity((r, city) => {
      setCityByRegion((prev) => ({ ...prev, [r]: city }));
    });
  }, []);

  const activeCity = cityByRegion[activeRegion];
  const citiesForActiveRegion = getCitiesForRegion(activeRegion);
  const showCityDropdown = !isSingleCityRegion(activeRegion);

  const handleCitySwitch = (citySlug: string) => {
    setCity(activeRegion, citySlug);
    setCityMenuOpen(false);
    setMobileCityOpen(false);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Persist region preference based on current path — but only for regional pages.
  // Neutral pages (dashboard, auth) preserve whatever the user explicitly set.
  useEffect(() => {
    if (pathRegion === null) return; // neutral path, don't change pref
    setRegion(pathRegion);
  }, [pathRegion]);

  // Region toggle handler — maps current path to target region + persists pref
  const handleRegionSwitch = (target: Region) => {
    setRegion(target);
    setRegionMenuOpen(false);
    setMobileRegionOpen(false);
    const targetPath = safePathMap(pathname, target);
    if (targetPath !== pathname) router.push(targetPath);
  };

  // Close region dropdown on outside click
  useEffect(() => {
    if (!regionMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (regionMenuRef.current && !regionMenuRef.current.contains(e.target as Node)) {
        setRegionMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [regionMenuOpen]);

  // Close city dropdown on outside click
  useEffect(() => {
    if (!cityMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (cityMenuRef.current && !cityMenuRef.current.contains(e.target as Node)) {
        setCityMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [cityMenuOpen]);

  // Auth state listener
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        supabase
          .from("profiles")
          .select("total_xp")
          .eq("id", user.id)
          .single()
          .then(({ data }) => {
            if (data?.total_xp) setUserLevel(getLevel(data.total_xp).level);
          });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userInitial = user
    ? (
        user.user_metadata?.full_name?.[0] ||
        user.user_metadata?.name?.[0] ||
        user.email?.[0] ||
        "U"
      ).toUpperCase()
    : null;

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "backdrop-blur-xl border-b border-app"
            : "bg-transparent"
        }`}
        style={
          scrolled
            ? { backgroundColor: "color-mix(in srgb, var(--bg) 85%, transparent)" }
            : undefined
        }
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 sm:px-6 py-4 lg:px-10">
          {/* Logo + Region Toggle */}
          <div className="flex items-center gap-4">
            <Link href={homeHref} className="group flex items-center gap-3">
              <span className="text-sm font-semibold tracking-wide text-app transition-colors group-hover:opacity-80">
                example.com
              </span>
              <span className="hidden text-[0.6rem] uppercase tracking-[0.2em] text-faint sm:block">
                {regionLabel}
              </span>
            </Link>

            {/* Region Dropdown — desktop */}
            <div ref={regionMenuRef} className="relative hidden lg:block">
              <button
                onClick={() => setRegionMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={regionMenuOpen}
                className="flex items-center gap-1.5 rounded-md border border-app bg-surface bg-surface-hover px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.1em] text-secondary transition-colors hover:text-app"
              >
                <span>{REGION_BUTTON_LABEL[activeRegion]}</span>
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  className={`transition-transform ${regionMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                >
                  <path d="M1.5 3L4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <AnimatePresence>
                {regionMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    role="menu"
                    className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[70vh] min-w-[160px] overflow-y-auto rounded-md border border-app bg-app-elevated backdrop-blur-xl p-1 shadow-lg"
                  >
                    {ALL_REGIONS.map((r) => (
                      <button
                        key={r}
                        role="menuitem"
                        onClick={() => handleRegionSwitch(r)}
                        className={`block w-full rounded px-3 py-1.5 text-left text-[0.65rem] uppercase tracking-[0.12em] transition-colors ${
                          activeRegion === r
                            ? "bg-surface-strong text-app"
                            : "text-muted bg-surface-hover hover:text-app"
                        }`}
                      >
                        {REGION_BUTTON_LABEL[r]}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* City Dropdown — desktop (hidden for single-city regions) */}
            {showCityDropdown && (
              <div ref={cityMenuRef} className="relative hidden lg:block">
                <button
                  onClick={() => setCityMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={cityMenuOpen}
                  className="flex items-center gap-1.5 rounded-md border border-app bg-surface bg-surface-hover px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.1em] text-secondary transition-colors hover:text-app"
                >
                  <span>{activeCity?.name ?? "City"}</span>
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    className={`transition-transform ${cityMenuOpen ? "rotate-180" : ""}`}
                    fill="none"
                  >
                    <path d="M1.5 3L4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <AnimatePresence>
                  {cityMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      role="menu"
                      className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[60vh] min-w-[170px] overflow-y-auto rounded-md border border-app bg-app-elevated backdrop-blur-xl p-1 shadow-lg"
                    >
                      {citiesForActiveRegion.map((c) => (
                        <button
                          key={c.slug}
                          role="menuitem"
                          onClick={() => handleCitySwitch(c.slug)}
                          className={`block w-full rounded px-3 py-1.5 text-left text-[0.65rem] uppercase tracking-[0.12em] transition-colors ${
                            activeCity?.slug === c.slug
                              ? "bg-surface-strong text-app"
                              : "text-muted bg-surface-hover hover:text-app"
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Desktop links */}
          <div className="hidden items-center gap-8 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-[0.75rem] uppercase tracking-[0.15em] transition-colors duration-300 ${
                  pathname === link.href || pathname.startsWith(link.href + "/")
                    ? "text-app"
                    : "text-secondary hover:text-app"
                }`}
              >
                {link.label}
                {(pathname === link.href || pathname.startsWith(link.href + "/")) && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full"
                    style={{ backgroundColor: "var(--text)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            ))}

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Notification bell (renders null when signed out) */}
            <NotificationBell />

            {/* Auth link — desktop */}
            {user ? (
              <Link
                href="/"
                className="flex items-center gap-2"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-app-strong bg-surface-strong text-[0.65rem] font-medium text-app transition-colors overflow-hidden ring-1 ring-white/20">
                  {user.user_metadata?.custom_avatar_url || user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.custom_avatar_url || user.user_metadata.avatar_url}
                      alt="Profile"
                      className="h-7 w-7 object-cover"
                    />
                  ) : (
                    userInitial
                  )}
                </span>
                {userLevel > 1 && (
                  <span className="text-[0.55rem] uppercase tracking-[0.12em] text-muted">
                    Lv.{userLevel}
                  </span>
                )}
              </Link>
            ) : (
              <Link
                href={activeRegion === "uae" ? "/signin" : `/signin?next=${encodeURIComponent(homeByRegion[activeRegion])}`}
                className="rounded-md bg-surface-strong border border-app-strong px-3 py-1.5 text-[0.75rem] uppercase tracking-[0.15em] text-app transition-colors duration-300 hover:opacity-90"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile: theme toggle + menu button */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5"
            aria-label="Toggle menu"
          >
            <motion.span
              animate={mobileOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
              className="block h-px w-5"
              style={{ backgroundColor: "var(--text-secondary)" }}
            />
            <motion.span
              animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
              className="block h-px w-5"
              style={{ backgroundColor: "var(--text-secondary)" }}
            />
            <motion.span
              animate={mobileOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
              className="block h-px w-5"
              style={{ backgroundColor: "var(--text-secondary)" }}
            />
          </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 backdrop-blur-xl md:hidden overflow-hidden"
            style={{ backgroundColor: "color-mix(in srgb, var(--bg) 95%, transparent)" }}
          >
            <div className="flex h-full flex-col items-center justify-center gap-6 sm:gap-8">
              {/* Region Dropdown — mobile */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="relative"
              >
                <button
                  onClick={() => setMobileRegionOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={mobileRegionOpen}
                  className="flex items-center gap-2 rounded-md border border-app bg-surface px-4 py-2 text-[0.7rem] uppercase tracking-[0.15em] text-app"
                >
                  <span>{REGION_BUTTON_LABEL[activeRegion]}</span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 8 8"
                    className={`transition-transform ${mobileRegionOpen ? "rotate-180" : ""}`}
                    fill="none"
                  >
                    <path d="M1.5 3L4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <AnimatePresence>
                  {mobileRegionOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      role="menu"
                      className="absolute left-1/2 top-[calc(100%+6px)] z-10 max-h-[60vh] w-[200px] -translate-x-1/2 overflow-y-auto rounded-md border border-app bg-app-elevated backdrop-blur-xl p-1 shadow-lg"
                    >
                      {ALL_REGIONS.map((r) => (
                        <button
                          key={r}
                          role="menuitem"
                          onClick={() => {
                            handleRegionSwitch(r);
                            setMobileOpen(false);
                          }}
                          className={`block w-full rounded px-3 py-2 text-left text-[0.7rem] uppercase tracking-[0.12em] transition-colors ${
                            activeRegion === r
                              ? "bg-surface-strong text-app"
                              : "text-muted bg-surface-hover hover:text-app"
                          }`}
                        >
                          {REGION_BUTTON_LABEL[r]}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* City Dropdown — mobile */}
              {showCityDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.07 }}
                  className="relative"
                >
                  <button
                    onClick={() => setMobileCityOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={mobileCityOpen}
                    className="flex items-center gap-2 rounded-md border border-app bg-surface px-4 py-2 text-[0.7rem] uppercase tracking-[0.15em] text-app"
                  >
                    <span>{activeCity?.name ?? "City"}</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 8 8"
                      className={`transition-transform ${mobileCityOpen ? "rotate-180" : ""}`}
                      fill="none"
                    >
                      <path d="M1.5 3L4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <AnimatePresence>
                    {mobileCityOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        role="menu"
                        className="absolute left-1/2 top-[calc(100%+6px)] z-10 max-h-[60vh] w-[200px] -translate-x-1/2 overflow-y-auto rounded-md border border-app bg-app-elevated backdrop-blur-xl p-1 shadow-lg"
                      >
                        {citiesForActiveRegion.map((c) => (
                          <button
                            key={c.slug}
                            role="menuitem"
                            onClick={() => {
                              handleCitySwitch(c.slug);
                              setMobileOpen(false);
                            }}
                            className={`block w-full rounded px-3 py-2 text-left text-[0.7rem] uppercase tracking-[0.12em] transition-colors ${
                              activeCity?.slug === c.slug
                                ? "bg-surface-strong text-app"
                                : "text-muted bg-surface-hover hover:text-app"
                            }`}
                          >
                            {c.name}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {links.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                >
                  <Link
                    href={link.href}
                    className={`text-lg uppercase tracking-[0.2em] transition-colors ${
                      pathname === link.href ? "text-app" : "text-secondary"
                    }`}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}

              {/* Auth link — mobile */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + links.length * 0.08 }}
              >
                {user ? (
                  <Link
                    href="/"
                    className={`text-lg uppercase tracking-[0.2em] transition-colors ${
                      pathname === "/" ? "text-app" : "text-secondary"
                    }`}
                  >
                    Dashboard
                  </Link>
                ) : (
                  <Link
                    href={activeRegion === "uae" ? "/signin" : `/signin?next=${encodeURIComponent(homeByRegion[activeRegion])}`}
                    className={`text-lg uppercase tracking-[0.2em] transition-colors ${
                      pathname.startsWith("/auth") ? "text-app" : "text-secondary"
                    }`}
                  >
                    Sign In
                  </Link>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
