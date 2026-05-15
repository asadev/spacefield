/* Page viewer — renders a hosted page from PagePayload blocks. */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveLink, recordView } from "@/lib/toshare/server";
import type { PagePayload } from "@/lib/toshare/types";
import { hashClientFingerprint } from "@/lib/toshare/fingerprint";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ws?: string }>;
}

export const dynamic = "force-dynamic";

export default async function PageViewer({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ws } = await searchParams;
  const subdomain = ws ?? null;

  const link = await resolveLink(slug, subdomain);
  if (!link || link.type !== "page") notFound();

  const payload = link.payload as unknown as PagePayload;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = h.get("user-agent") ?? "";
  const referrer = h.get("referer") ?? "";
  recordView({
    slug,
    subdomain,
    ipHash: await hashClientFingerprint(ip),
    uaHash: await hashClientFingerprint(ua),
    referrer,
  }).catch(() => {});

  const accent = payload.brandColor ?? "#0f172a";

  // If a rasterized poster snapshot is provided, render it full-bleed
  // and skip the generic block layout entirely. The user designed an
  // exact poster — show that exact poster, not a re-layout of the data.
  if (payload.posterImage) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <img
          src={payload.posterImage}
          alt={payload.title || ""}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: "12px",
            boxShadow: "0 8px 24px -8px rgba(15, 23, 42, 0.18)",
          }}
        />
        {payload.ctaLabel && payload.ctaHref ? (
          <a
            href={payload.ctaHref}
            style={{
              alignSelf: "flex-start",
              display: "inline-flex",
              height: "44px",
              alignItems: "center",
              padding: "0 20px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#ffffff",
              backgroundColor: accent,
              textDecoration: "none",
            }}
          >
            {payload.ctaLabel}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <article className="space-y-8" style={{ ["--accent" as string]: accent }}>
      {payload.brandLogo ? (
        <div className="flex items-center gap-3">
          <img src={payload.brandLogo} alt="" className="h-10 w-10 rounded-lg object-cover" />
        </div>
      ) : null}

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{payload.title}</h1>
      </header>

      {payload.hero ? (
        payload.hero.kind === "image" ? (
          <img
            src={payload.hero.src}
            alt={payload.hero.alt ?? ""}
            className="aspect-[16/9] w-full rounded-2xl object-cover"
          />
        ) : (
          <video src={payload.hero.src} controls className="aspect-[16/9] w-full rounded-2xl" />
        )
      ) : null}

      <div className="space-y-6">
        {payload.blocks.map((block, i) => {
          switch (block.kind) {
            case "heading": {
              const Tag = `h${block.level ?? 2}` as "h1" | "h2" | "h3";
              return (
                <Tag key={i} className="text-2xl font-semibold tracking-tight">
                  {block.text}
                </Tag>
              );
            }
            case "paragraph":
              return <p key={i} className="text-base leading-relaxed">{block.text}</p>;
            case "image":
              return (
                <figure key={i} className="space-y-2">
                  <img src={block.src} alt={block.alt ?? ""} className="w-full rounded-xl" />
                  {block.caption ? (
                    <figcaption className="text-xs text-slate-500">{block.caption}</figcaption>
                  ) : null}
                </figure>
              );
            case "gallery":
              return (
                <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {block.items.map((it, j) => (
                    <img
                      key={j}
                      src={it.src}
                      alt={it.alt ?? ""}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              );
            case "stats":
              return (
                <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {block.items.map((s, j) => (
                    <div
                      key={j}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="text-xs uppercase tracking-wider text-slate-500">{s.label}</div>
                      <div className="mt-1 text-xl font-semibold">{s.value}</div>
                    </div>
                  ))}
                </div>
              );
            case "list": {
              const Tag = block.ordered ? "ol" : "ul";
              return (
                <Tag
                  key={i}
                  className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
                >
                  {block.items.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </Tag>
              );
            }
            case "video":
              return <video key={i} src={block.src} controls className="w-full rounded-xl" />;
            case "embed":
              // SB-002: refuse to render raw HTML from `block.html` —
              // toshare payloads are minted from a public server action
              // with no sanitiser, so any caller could ship arbitrary
              // markup (script tags, event handlers, javascript: URIs).
              // No UI currently authors embed blocks, so we render a
              // safe placeholder. If you need embeds, route them through
              // a server-side sanitiser (e.g. DOMPurify on the writer)
              // first and replace this branch.
              return (
                <div
                  key={i}
                  className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500"
                >
                  [embed removed for safety]
                </div>
              );
            case "spacer":
              return (
                <div
                  key={i}
                  className={
                    block.size === "lg" ? "h-12" : block.size === "md" ? "h-6" : "h-3"
                  }
                />
              );
          }
        })}
      </div>

      {payload.ctaLabel && payload.ctaHref ? (
        <a
          href={payload.ctaHref}
          className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-medium text-white"
          style={{ backgroundColor: accent }}
        >
          {payload.ctaLabel}
        </a>
      ) : null}
    </article>
  );
}
