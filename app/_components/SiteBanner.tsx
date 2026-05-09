import "server-only";

import { getActiveBanners } from "@/lib/runtime-banner";
import type { SiteBannerRow } from "@/app/admin/_types";
import { BannerDismisser } from "./BannerDismisser";

/* Server component — renders a stack of active site banners at the very
 * top of every page (mounted from app/layout.tsx just inside <body>).
 *
 * - Reads via the active_banners(uid, tier) RPC through the service-role
 *   client so unauthenticated visitors still see public banners without
 *   tripping RLS. The RPC itself does the audience filtering.
 * - Each banner is its own server-rendered <div>; a single client child
 *   <BannerDismisser> handles the localStorage dismissed-id list and
 *   hides matching nodes via CSS attribute selectors. This keeps the
 *   server output cacheable and ships zero JS for non-dismissible
 *   banners.
 * - We always pass uid/tier as undefined here — the layout doesn't have
 *   a session lookup wired in yet and adding one would touch shared
 *   infra. Audience filtering happens at the RPC level so anonymous
 *   visitors only see banners with audience='all'. Once the layout
 *   gains a user/tier source, those values can be threaded in. */
export default async function SiteBanner(): Promise<React.ReactElement | null> {
  const banners = await getActiveBanners();
  if (banners.length === 0) return null;

  const dismissibleIds = banners
    .filter((b) => b.dismissible)
    .map((b) => b.id);

  return (
    <div data-site-banner-root className="w-full">
      {banners.map((b) => (
        <SiteBannerRow key={b.id} banner={b} />
      ))}
      {dismissibleIds.length > 0 && (
        <BannerDismisser ids={dismissibleIds} />
      )}
    </div>
  );
}

const VARIANT_STYLES: Record<
  SiteBannerRow["variant"],
  { bg: string; chipBg: string; chipText: string; text: string; link: string }
> = {
  info: {
    bg: "bg-sky-500/10 border-sky-500/30",
    chipBg: "bg-sky-500/20",
    chipText: "text-sky-200",
    text: "text-sky-50",
    link: "text-sky-100 hover:text-white underline underline-offset-2",
  },
  warning: {
    bg: "bg-amber-500/10 border-amber-500/30",
    chipBg: "bg-amber-500/20",
    chipText: "text-amber-200",
    text: "text-amber-50",
    link: "text-amber-100 hover:text-white underline underline-offset-2",
  },
  success: {
    bg: "bg-emerald-500/10 border-emerald-500/30",
    chipBg: "bg-emerald-500/20",
    chipText: "text-emerald-200",
    text: "text-emerald-50",
    link: "text-emerald-100 hover:text-white underline underline-offset-2",
  },
  error: {
    bg: "bg-rose-500/10 border-rose-500/30",
    chipBg: "bg-rose-500/20",
    chipText: "text-rose-200",
    text: "text-rose-50",
    link: "text-rose-100 hover:text-white underline underline-offset-2",
  },
};

function SiteBannerRow({ banner }: { banner: SiteBannerRow }) {
  const style = VARIANT_STYLES[banner.variant] ?? VARIANT_STYLES.info;
  return (
    <div
      data-site-banner
      data-banner-id={banner.id}
      data-banner-dismissible={banner.dismissible ? "1" : "0"}
      className={`relative border-b ${style.bg} ${style.text}`}
    >
      <div className="flex items-center gap-3 px-4 py-2 sm:px-6 text-xs sm:text-sm">
        <span
          className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] ${style.chipBg} ${style.chipText}`}
        >
          {banner.variant}
        </span>
        <span className="flex-1 min-w-0 leading-snug">{banner.message}</span>
        {banner.cta_label && banner.cta_href && (
          <a
            href={banner.cta_href}
            className={`shrink-0 text-xs sm:text-sm ${style.link}`}
          >
            {banner.cta_label}
          </a>
        )}
        {banner.dismissible && (
          <button
            type="button"
            data-banner-dismiss
            data-banner-id={banner.id}
            aria-label="Dismiss banner"
            className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded text-current/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M2 2 L10 10 M10 2 L2 10" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
