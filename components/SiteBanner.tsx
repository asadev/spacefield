import { getActiveAnnouncements } from "@/lib/admin/announcements";

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-blue-500/[0.08] border-blue-400/25 text-blue-100",
  warning: "bg-amber-500/[0.08] border-amber-400/25 text-amber-100",
  critical: "bg-rose-500/[0.10] border-rose-400/30 text-rose-100",
};

/**
 * Server component rendered at the top of the root layout. Fetches active
 * admin announcements and shows them above the nav. Silent if none active.
 * Admin creates/edits via /admin/announcements.
 */
export default async function SiteBanner() {
  const announcements = await getActiveAnnouncements();
  if (announcements.length === 0) return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-[60] flex flex-col gap-px">
      {announcements.map((a) => (
        <div
          key={a.id}
          className={`border-b px-4 py-2 text-center text-[0.7rem] sm:text-xs ${
            SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.info
          }`}
        >
          <span className="font-semibold tracking-wide">{a.title}</span>
          {a.body && <span className="ml-2 opacity-80">— {a.body}</span>}
        </div>
      ))}
    </div>
  );
}
