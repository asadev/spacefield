/* File viewer — placeholder; secure download flow ships next iteration. */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveLink, recordView } from "@/lib/toshare/server";
import type { FilePayload } from "@/lib/toshare/types";
import { hashClientFingerprint } from "@/lib/toshare/fingerprint";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ws?: string }>;
}

export const dynamic = "force-dynamic";

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default async function FileViewer({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ws } = await searchParams;
  const subdomain = ws ?? null;
  const link = await resolveLink(slug, subdomain);
  if (!link || link.type !== "file") notFound();
  const payload = link.payload as unknown as FilePayload;
  const h = await headers();
  recordView({
    slug,
    subdomain,
    ipHash: await hashClientFingerprint(h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""),
    uaHash: await hashClientFingerprint(h.get("user-agent") ?? ""),
    referrer: h.get("referer") ?? "",
  }).catch(() => {});

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{payload.fileName}</h1>
      <p className="text-sm text-slate-500">
        {payload.mimeType} · {fmtBytes(payload.fileSize)}
      </p>
      <div className="rounded-xl border border-slate-200 p-6 text-sm text-slate-500 dark:border-slate-800">
        Secure download flow shipping in next iteration.
      </div>
    </div>
  );
}
