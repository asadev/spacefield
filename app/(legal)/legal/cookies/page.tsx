import DraftBanner from "../../_components/DraftBanner";

export const metadata = {
  title: "Cookies · Space Field",
  description: "What cookies Space Field sets and why.",
};

interface CookieRow {
  name: string;
  vendor: string;
  purpose: string;
  duration: string;
  category: "Strictly necessary" | "Functional" | "Analytics" | "Marketing";
}

const COOKIES: CookieRow[] = [
  {
    name: "sb-access-token",
    vendor: "Supabase",
    purpose: "Authenticated session token",
    duration: "1 hour (auto-refreshed)",
    category: "Strictly necessary",
  },
  {
    name: "sb-refresh-token",
    vendor: "Supabase",
    purpose: "Refreshes the access token without re-login",
    duration: "30 days",
    category: "Strictly necessary",
  },
  {
    name: "spacefield-theme",
    vendor: "Space Field",
    purpose: "Remembers your light / dark theme preference",
    duration: "1 year",
    category: "Functional",
  },
  {
    name: "_vercel_speed_insights",
    vendor: "Vercel",
    purpose: "Real-user performance metrics (Web Vitals)",
    duration: "Session",
    category: "Analytics",
  },
];

export default function CookiesPage() {
  return (
    <>
      <DraftBanner level="review" />
      <h2>Cookie policy</h2>

      <p>
        This page lists the cookies Space Field sets in your browser when you
        use the Service. We do not currently set marketing or third-party
        advertising cookies. If that changes, this page will be updated and
        your consent will be requested before any non-essential cookie is
        set.
      </p>

      <div className="not-prose mt-6 overflow-x-auto rounded-xl border border-app">
        <table className="w-full text-sm">
          <thead className="bg-app-elevated text-xs uppercase tracking-wider text-faint">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Set by</th>
              <th className="px-4 py-2 text-left">Purpose</th>
              <th className="px-4 py-2 text-left">Duration</th>
              <th className="px-4 py-2 text-left">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app">
            {COOKIES.map((c) => (
              <tr key={c.name}>
                <td className="px-4 py-3 font-mono text-xs">{c.name}</td>
                <td className="px-4 py-3 text-secondary">{c.vendor}</td>
                <td className="px-4 py-3 text-secondary">{c.purpose}</td>
                <td className="px-4 py-3 text-secondary">{c.duration}</td>
                <td className="px-4 py-3 text-secondary">{c.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Managing cookies</h3>
      <p>
        Most browsers let you block cookies or delete them after the fact.
        Disabling strictly-necessary cookies will sign you out and break the
        Service. Functional / analytics cookies can be disabled with no loss
        of core functionality.
      </p>

      <h3>Contact</h3>
      <p>
        Questions:{" "}
        <a href="mailto:privacy@spacefield.co">privacy@spacefield.co</a>.
      </p>
    </>
  );
}
