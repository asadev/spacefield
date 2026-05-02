/* Quote viewer — itemized quote/proposal page. */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveLink, recordView } from "@/lib/share/server";
import type { QuotePayload } from "@/lib/share/types";
import { hashClientFingerprint } from "@/lib/share/fingerprint";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ws?: string }>;
}

export const dynamic = "force-dynamic";

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default async function QuoteViewer({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ws } = await searchParams;
  const subdomain = ws ?? null;

  const link = await resolveLink(slug, subdomain);
  if (!link || link.type !== "quote") notFound();

  const payload = link.payload as unknown as QuotePayload;
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
  const subtotal = payload.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  return (
    <article className="space-y-6" style={{ ["--accent" as string]: accent }}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        {payload.brandLogo ? (
          <img src={payload.brandLogo} alt="" className="h-10 w-10 rounded-lg object-cover" />
        ) : null}
        <div className="text-right text-xs text-slate-500">
          <div>Issued {new Date(payload.issuedDate).toLocaleDateString()}</div>
          {payload.validUntil ? (
            <div>Valid until {new Date(payload.validUntil).toLocaleDateString()}</div>
          ) : null}
        </div>
      </header>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{payload.title}</h1>
        {payload.recipientName || payload.recipientCompany ? (
          <p className="mt-1 text-sm text-slate-500">
            For: {payload.recipientName}
            {payload.recipientCompany ? ` · ${payload.recipientCompany}` : ""}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left dark:bg-slate-900">
            <tr>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Unit Price</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {payload.lineItems.map((li, i) => (
              <tr key={i} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-4 py-3">{li.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{li.quantity}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {fmtMoney(li.unitPrice, payload.currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {fmtMoney(li.quantity * li.unitPrice, payload.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
              <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold">
                Total
              </td>
              <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                {fmtMoney(subtotal, payload.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {payload.notes ? (
        <div>
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
            {payload.notes}
          </p>
        </div>
      ) : null}

      {payload.termsHtml ? (
        <details className="rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium">Terms</summary>
          <div
            className="prose prose-sm mt-2 max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: payload.termsHtml }}
          />
        </details>
      ) : null}
    </article>
  );
}
