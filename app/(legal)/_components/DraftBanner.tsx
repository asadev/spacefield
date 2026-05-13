/**
 * Banner that flags pages we shipped as starter templates while waiting
 * on a UAE-licensed lawyer review. Renders at the top of every legal
 * page so users (and prospective B2B buyers reading them) know the
 * document hasn't been independently reviewed.
 */
export default function DraftBanner({
  level = "draft",
}: {
  level?: "draft" | "review";
}) {
  const text =
    level === "review"
      ? "This document is awaiting independent legal review. Provided in good faith; not legal advice."
      : "DRAFT — starter template. Awaiting UAE-licensed counsel review before formal effect. Provided in good faith; not legal advice.";
  return (
    <div className="not-prose mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
      <strong className="font-semibold">Heads-up:</strong> {text}
    </div>
  );
}
