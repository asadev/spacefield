/* File viewer — metadata + password-gated download. */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveLink, recordView } from "@/lib/toshare/server";
import type { FilePayload } from "@/lib/toshare/types";
import { hashClientFingerprint } from "@/lib/toshare/fingerprint";
import FileDownload from "../../_components/FileDownload";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ws?: string }>;
}

export const dynamic = "force-dynamic";

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
    <article className="space-y-6">
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-wider text-slate-500">Shared file</div>
        <h1 className="text-2xl font-semibold tracking-tight">A file has been shared with you</h1>
      </header>

      <FileDownload
        linkId={link.id}
        payload={payload}
        passwordRequired={Boolean(payload.passwordHash)}
      />

      <p className="text-xs text-slate-500">
        Files expire automatically and may be limited to a fixed number of downloads.
      </p>
    </article>
  );
}
