/**
 * Status chip used by the jobs index + detail tables. Mirrors the look
 * of `app/admin/agents/_components/StatusChip.tsx` so the panel feels
 * consistent.
 */

const STYLES: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-500",
  running: "bg-blue-500/15 text-blue-500",
  error: "bg-rose-500/15 text-rose-500",
  timeout: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  disabled: "bg-app text-faint border border-app",
};

const NEUTRAL = "bg-app-elevated text-secondary border border-app";

export default function CronStatusChip({
  status,
}: {
  status: string | null | undefined;
}) {
  if (!status) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${NEUTRAL}`}
      >
        never
      </span>
    );
  }
  const cls = STYLES[status] ?? NEUTRAL;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}
