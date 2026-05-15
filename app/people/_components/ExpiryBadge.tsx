import { docExpiryBucket } from "@/lib/people/server";

/**
 * Tiny pill showing how close a doc expiry is. Red <30 days, amber <90,
 * gray otherwise. "Expired" for past dates.
 */
export default function ExpiryBadge({
  expiresAt,
}: {
  expiresAt: string | null | undefined;
}) {
  if (!expiresAt) {
    return (
      <span className="inline-flex items-center rounded-full bg-app-elevated border border-app px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
        no expiry
      </span>
    );
  }
  const bucket = docExpiryBucket(expiresAt);
  const ts = new Date(expiresAt).getTime();
  const days = Math.floor((ts - Date.now()) / (24 * 60 * 60 * 1000));
  const cls =
    bucket === "expired"
      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
      : bucket === "red"
      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
      : bucket === "amber"
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      : "bg-app-elevated border border-app text-secondary";
  const label =
    bucket === "expired"
      ? `expired ${-days}d ago`
      : days <= 0
      ? "expires today"
      : `${days}d left`;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}
