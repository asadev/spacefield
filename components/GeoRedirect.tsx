"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { detectPreferredRegion } from "@/lib/geo-detect";
import { isNeutralPath, setRegion } from "@/lib/region";

/**
 * On first visit (no stored region preference), detect the user's country
 * and redirect to that region's home. Only acts on:
 *   - the UAE root home page (`/`) — the implicit default landing
 * Once redirected or stored, we never act again.
 *
 * Mount once in the root layout. SSR-safe — all logic runs in useEffect.
 */
export default function GeoRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Don't fire on neutral or non-root pages — user already has a path intent
    if (pathname !== "/" || isNeutralPath(pathname)) return;

    let cancelled = false;
    detectPreferredRegion().then((region) => {
      if (cancelled || !region || region === "uae") return;
      const target = `/${region}`;
      setRegion(region);
      router.push(target);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
