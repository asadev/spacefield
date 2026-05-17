import DraftBanner from "../../_components/DraftBanner";

export const metadata = {
  title: "Subprocessors · Space Field",
  description: "Third-party services that process data on behalf of Space Field.",
};

// Legal copy changes only on deploy. 1-hour ISR.
export const revalidate = 3600;

interface Sub {
  vendor: string;
  purpose: string;
  region: string;
  data: string;
}

const SUBS: Sub[] = [
  {
    vendor: "Supabase (Inc.)",
    purpose: "Primary database, authentication, file storage, realtime",
    region: "EU (eu-west-1 / eu-central-1)",
    data: "All account, content, and usage data",
  },
  {
    vendor: "Vercel (Inc.)",
    purpose: "Hosting, edge functions, CDN, deployment",
    region: "Global (primary fra1 — Frankfurt)",
    data: "Request metadata, request bodies in flight, edge logs",
  },
  {
    vendor: "Anthropic, PBC",
    purpose: "AI model inference (Claude)",
    region: "United States",
    data: "Prompts + content submitted to AI features (not used for model training where supported)",
  },
  {
    vendor: "OpenAI, L.L.C.",
    purpose: "AI model inference (GPT, embeddings)",
    region: "United States",
    data: "Prompts + content submitted to AI features (zero data retention via API)",
  },
  {
    vendor: "Paddle.com Market Ltd",
    purpose: "Merchant of record — billing, tax, invoicing",
    region: "United Kingdom / EU",
    data: "Billing identity, card last-4, transaction history",
  },
  {
    vendor: "Cloudflare, Inc.",
    purpose: "DNS, CAPTCHA (Turnstile) — when enabled",
    region: "Global",
    data: "IP, request metadata",
  },
];

export default function SubprocessorsPage() {
  return (
    <>
      <DraftBanner level="review" />
      <h2>Subprocessors</h2>
      <p>
        This page lists the third-party services that process customer data
        on behalf of Space Field. We update it within 30 days of a material
        change and, for additions affecting business customers, send notice
        by email.
      </p>

      <div className="not-prose mt-6 overflow-x-auto rounded-xl border border-app">
        <table className="w-full text-sm">
          <thead className="bg-app-elevated text-xs uppercase tracking-wider text-faint">
            <tr>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Purpose</th>
              <th className="px-4 py-2 text-left">Region</th>
              <th className="px-4 py-2 text-left">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app">
            {SUBS.map((s) => (
              <tr key={s.vendor} className="align-top">
                <td className="px-4 py-3 font-medium">{s.vendor}</td>
                <td className="px-4 py-3 text-secondary">{s.purpose}</td>
                <td className="px-4 py-3 text-secondary">{s.region}</td>
                <td className="px-4 py-3 text-secondary">{s.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>How to subscribe to updates</h3>
      <p>
        Email{" "}
        <a href="mailto:privacy@spacefield.co?subject=Subprocessor%20notifications">
          privacy@spacefield.co
        </a>{" "}
        with subject &quot;Subprocessor notifications&quot; — we will add you
        to the announcement list.
      </p>
    </>
  );
}
